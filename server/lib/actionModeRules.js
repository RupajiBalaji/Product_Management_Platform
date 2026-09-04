/**
 * Pure Logic Module: Employee Action Mode Rules
 * Evaluates Reorder, Swap within week, and Postpone requests.
 * NO DB calls inside these functions — pure computational functions operating on passed data.
 */

/**
 * evaluateReorder(taskId, newPosition, allProjectTasksWithDependencies)
 * Checks whether the proposed reorder would violate any dependency ordering
 * (a task cannot be moved before something it depends on, or after something that depends on it).
 *
 * @param {string} taskId - ID of the task being moved
 * @param {number} newPosition - Target index in the execution order (0-indexed)
 * @param {Array<{ id?: string, _id?: string, title?: string, depends_on?: string[] }>} allProjectTasksWithDependencies
 * @returns {{ approved: boolean, reason: string }}
 */
function toId(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (val._id) return String(val._id);
  if (val.id && typeof val.id === "string") return val.id;
  if (typeof val.toString === "function") return val.toString();
  return String(val);
}

function evaluateReorder(taskId, newPosition, allProjectTasksWithDependencies) {
  if (!Array.isArray(allProjectTasksWithDependencies) || allProjectTasksWithDependencies.length === 0) {
    return { approved: false, reason: "Task list is empty or invalid." };
  }

  const strTaskId = toId(taskId);
  const currentIndex = allProjectTasksWithDependencies.findIndex(
    (t) => toId(t) === strTaskId
  );

  if (currentIndex === -1) {
    return { approved: false, reason: `Task '${strTaskId}' not found in project task list.` };
  }

  if (newPosition < 0 || newPosition >= allProjectTasksWithDependencies.length) {
    return {
      approved: false,
      reason: `Target position index ${newPosition} is out of bounds (0 to ${allProjectTasksWithDependencies.length - 1}).`,
    };
  }

  // Construct the proposed order by moving taskId to newPosition
  const proposedOrder = [...allProjectTasksWithDependencies];
  const [movingTask] = proposedOrder.splice(currentIndex, 1);
  proposedOrder.splice(newPosition, 0, movingTask);

  // Map task ID to its new position in the proposed order
  const posMap = new Map();
  proposedOrder.forEach((t, idx) => {
    posMap.set(toId(t), idx);
  });

  const movingTaskNewPos = posMap.get(strTaskId);

  // 1. Check prerequisites of the moving task:
  // All prerequisites in depends_on must appear BEFORE the moving task (pos < movingTaskNewPos)
  const prerequisites = (movingTask.depends_on || []).map((dep) => toId(dep));
  for (const prereqId of prerequisites) {
    if (posMap.has(prereqId)) {
      const prereqPos = posMap.get(prereqId);
      if (prereqPos >= movingTaskNewPos) {
        const prereqTask = allProjectTasksWithDependencies.find(
          (t) => toId(t) === prereqId
        );
        const title = prereqTask?.title || prereqId;
        return {
          approved: false,
          reason: `Cannot move task before prerequisite '${title}' (dependency violation: prerequisite must execute first).`,
        };
      }
    }
  }

  // 2. Check downstream dependents of the moving task:
  // Any task that depends on movingTask must appear AFTER the moving task (pos > movingTaskNewPos)
  for (const otherTask of proposedOrder) {
    const otherId = toId(otherTask);
    if (otherId === strTaskId) continue;

    const otherDeps = (otherTask.depends_on || []).map((dep) => toId(dep));
    if (otherDeps.includes(strTaskId)) {
      const depPos = posMap.get(otherId);
      if (depPos <= movingTaskNewPos) {
        return {
          approved: false,
          reason: `Cannot move task after downstream dependent '${otherTask.title || otherId}' (dependency violation: dependent requires this task to execute first).`,
        };
      }
    }
  }

  return {
    approved: true,
    reason: "Reorder approved: DAG dependency sequence is strictly preserved.",
  };
}

/**
 * evaluateSwapWithinWeek(employeeWeeklyAllocations, taskHours, targetDate, weekBounds)
 * Checks that the target date is within the same week AND the employee's total hours
 * for that week (after the swap) stays within their weekly capacity cap.
 *
 * @param {{ currentWeeklyHours?: number, weeklyCapHours?: number, projectedWeeklyHours?: number, alreadyContainsTask?: boolean }} employeeWeeklyAllocations
 * @param {number} taskHours - Hours estimated for the task being scheduled
 * @param {string|Date} targetDate - Date proposed for the swap (YYYY-MM-DD or Date)
 * @param {{ start: string|Date, end: string|Date }} weekBounds - Start and end dates of the current planning week
 * @returns {{ approved: boolean, reason: string, projectedWeeklyHours: number }}
 */
function evaluateSwapWithinWeek(employeeWeeklyAllocations, taskHours, targetDate, weekBounds) {
  const normDate = (d) => {
    if (!d) return "";
    if (typeof d === "string") return d.slice(0, 10);
    return d.toISOString().slice(0, 10);
  };

  const targetDateStr = normDate(targetDate);
  const weekStartStr = normDate(weekBounds?.start);
  const weekEndStr = normDate(weekBounds?.end);

  // 1. Check if target date is within the current week boundary
  if (weekStartStr && weekEndStr) {
    if (targetDateStr < weekStartStr || targetDateStr > weekEndStr) {
      return {
        approved: false,
        reason: `Swap rejected: Target date '${targetDateStr}' is outside the current weekly boundary (${weekStartStr} to ${weekEndStr}).`,
        projectedWeeklyHours: employeeWeeklyAllocations?.currentWeeklyHours || 0,
      };
    }
  }

  // 2. Check weekly capacity limits
  const weeklyCap = Number(employeeWeeklyAllocations?.weeklyCapHours ?? 40);
  const projectedWeeklyHours =
    employeeWeeklyAllocations?.projectedWeeklyHours !== undefined
      ? Number(employeeWeeklyAllocations.projectedWeeklyHours)
      : Number(employeeWeeklyAllocations?.currentWeeklyHours || 0) +
        (employeeWeeklyAllocations?.alreadyContainsTask ? 0 : Number(taskHours || 0));

  if (projectedWeeklyHours > weeklyCap) {
    return {
      approved: false,
      reason: `Swap rejected: Projected weekly workload (${projectedWeeklyHours} hrs) would exceed weekly capacity cap (${weeklyCap} hrs).`,
      projectedWeeklyHours,
    };
  }

  return {
    approved: true,
    reason: `Swap approved: Target date '${targetDateStr}' is within current week and total workload (${projectedWeeklyHours}h) is within the ${weeklyCap}h weekly cap.`,
    projectedWeeklyHours,
  };
}

/**
 * evaluatePostpone()
 * Hardcoded rule per platform governance:
 * Postponing or extending deadlines is strictly forbidden by contributors.
 * Only a Product Lead can authorize milestone scope changes.
 *
 * @returns {{ approved: false, reason: string }}
 */
function evaluatePostpone() {
  return {
    approved: false,
    reason:
      "Postponing or extending deadlines is a strictly forbidden action per platform governance. This requires a formal scope change request, which only a Product Lead can authorize.",
  };
}

module.exports = {
  evaluateReorder,
  evaluateSwapWithinWeek,
  evaluatePostpone,
};
