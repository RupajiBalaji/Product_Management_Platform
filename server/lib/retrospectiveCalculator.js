/**
 * Pure Calculation Module: Project Retrospective Analytics (Phase 11)
 *
 * Single source of truth for estimation accuracy, incident summarization,
 * and team performance reliability metrics.
 * STRICT REQUIREMENT: Zero database dependencies (100% pure computational logic).
 */

/**
 * calculateEstimationAccuracy(allTasks, dynamicRoles, teamAllocations)
 *
 * @param {Array<Object>} allTasks - Array of project tasks with estimate_hours, logged_hours/actual_hours, assignee_ids
 * @param {Array<Object>} dynamicRoles - Array of DynamicRole objects ({ _id, domain, title })
 * @param {Array<Object>} teamAllocations - Array of project team allocations ({ user_id, role_id })
 * @returns {{
 *   overall: { totalEstimatedHours: number, totalActualHours: number, variancePct: number },
 *   byEmployee: Array<{ userId: string, estimatedHours: number, actualHours: number, variancePct: number }>,
 *   byPhase: Array<{ phaseOrTaskGroup: string, estimatedHours: number, actualHours: number, variancePct: number }>
 * }}
 */
function calculateEstimationAccuracy(allTasks = [], dynamicRoles = [], teamAllocations = []) {
  if (!Array.isArray(allTasks)) {
    return {
      overall: { totalEstimatedHours: 0, totalActualHours: 0, variancePct: 0 },
      byEmployee: [],
      byPhase: [],
    };
  }

  // 1. Build role domain lookup map by user_id
  const roleDomainById = new Map();
  (dynamicRoles || []).forEach((r) => {
    const rId = String(r?._id || r?.id || "");
    if (rId && r?.domain) {
      roleDomainById.set(rId, String(r.domain));
    }
  });

  const userDomainMap = new Map();
  (teamAllocations || []).forEach((alloc) => {
    const uId = String(alloc?.user_id || alloc?.userId || "");
    const rId = String(alloc?.role_id || alloc?.roleId || "");
    if (uId && rId && roleDomainById.has(rId)) {
      userDomainMap.set(uId, roleDomainById.get(rId));
    }
  });

  let totalEstimated = 0;
  let totalActual = 0;

  const empStats = new Map(); // userId -> { estimated: 0, actual: 0 }
  const phaseStats = new Map(); // domain/phase -> { estimated: 0, actual: 0 }

  for (const task of allTasks) {
    if (!task) continue;

    const est = Number(task.estimate_hours !== undefined ? task.estimate_hours : task.estimateHours || 0);
    const actual = Number(
      task.actual_hours !== undefined
        ? task.actual_hours
        : task.actualHours !== undefined
        ? task.actualHours
        : task.logged_hours !== undefined
        ? task.logged_hours
        : task.loggedHours || 0
    );

    totalEstimated += est;
    totalActual += actual;

    // Determine domain / phase
    const explicitPhase = task.phase || task.phaseOrTaskGroup || task.domain;
    let taskDomain = explicitPhase ? String(explicitPhase) : null;

    const assignees = Array.isArray(task.assignee_ids)
      ? task.assignee_ids
      : Array.isArray(task.assigneeIds)
      ? task.assigneeIds
      : task.assignee_id
      ? [task.assignee_id]
      : [];

    if (!taskDomain && assignees.length > 0) {
      for (const aId of assignees) {
        const uId = String(aId);
        if (userDomainMap.has(uId)) {
          taskDomain = userDomainMap.get(uId);
          break;
        }
      }
    }
    if (!taskDomain) taskDomain = "General";

    // Accumulate to phase / domain stats
    const currentPhase = phaseStats.get(taskDomain) || { estimated: 0, actual: 0 };
    currentPhase.estimated += est;
    currentPhase.actual += actual;
    phaseStats.set(taskDomain, currentPhase);

    // Accumulate to employee stats
    if (assignees.length === 0) {
      const uKey = "unassigned";
      const curr = empStats.get(uKey) || { estimated: 0, actual: 0 };
      curr.estimated += est;
      curr.actual += actual;
      empStats.set(uKey, curr);
    } else {
      const perAssigneeEst = est / assignees.length;
      const perAssigneeActual = actual / assignees.length;

      for (const aId of assignees) {
        const uKey = String(aId);
        const curr = empStats.get(uKey) || { estimated: 0, actual: 0 };
        curr.estimated += perAssigneeEst;
        curr.actual += perAssigneeActual;
        empStats.set(uKey, curr);
      }
    }
  }

  const calcVariance = (est, act) => {
    if (est === 0) {
      return act === 0 ? 0 : 100;
    }
    return Math.round(((act - est) / est) * 1000) / 10;
  };

  const overall = {
    totalEstimatedHours: Math.round(totalEstimated * 10) / 10,
    totalActualHours: Math.round(totalActual * 10) / 10,
    variancePct: calcVariance(totalEstimated, totalActual),
  };

  const byEmployee = Array.from(empStats.entries()).map(([userId, stats]) => {
    const roundedEst = Math.round(stats.estimated * 10) / 10;
    const roundedAct = Math.round(stats.actual * 10) / 10;
    return {
      userId,
      estimatedHours: roundedEst,
      actualHours: roundedAct,
      variancePct: calcVariance(roundedEst, roundedAct),
    };
  });

  const byPhase = Array.from(phaseStats.entries()).map(([phaseOrTaskGroup, stats]) => {
    const roundedEst = Math.round(stats.estimated * 10) / 10;
    const roundedAct = Math.round(stats.actual * 10) / 10;
    return {
      phaseOrTaskGroup,
      estimatedHours: roundedEst,
      actualHours: roundedAct,
      variancePct: calcVariance(roundedEst, roundedAct),
    };
  });

  return {
    overall,
    byEmployee,
    byPhase,
  };
}

/**
 * summarizeIncidents(slippageEvents, submissions, directiveChanges, actionRequests)
 *
 * @param {Array<Object>} slippageEvents
 * @param {Array<Object>} submissions
 * @param {Array<Object>} directiveChanges
 * @param {Array<Object>} actionRequests
 * @returns {{
 *   slippageEventsCount: number,
 *   qaRejectionLoopCount: number,
 *   scopeChangesCount: number,
 *   blockerIncidentsCount: number
 * }}
 */
function summarizeIncidents(
  slippageEvents = [],
  submissions = [],
  directiveChanges = [],
  actionRequests = []
) {
  const safeSlippages = Array.isArray(slippageEvents) ? slippageEvents : [];
  const safeSubmissions = Array.isArray(submissions) ? submissions : [];
  const safeDirectives = Array.isArray(directiveChanges) ? directiveChanges : [];
  const safeActionRequests = Array.isArray(actionRequests) ? actionRequests : [];

  // Count slippage events (resolved + unresolved)
  const slippageEventsCount = safeSlippages.length;

  // Count tasks with repeated QA rejections (rejection_count >= 3)
  const loopTaskIds = new Set();
  safeSubmissions.forEach((sub) => {
    const rej = Number(sub?.rejection_count || sub?.rejectionCount || 0);
    if (rej >= 3) {
      loopTaskIds.add(String(sub.task_id || sub.taskId || sub._id || ""));
    }
  });

  safeSlippages.forEach((se) => {
    const isLoop =
      se?.trigger_type === "repeated_qa_rejection" ||
      Number(se?.rejection_count || 0) >= 3;
    if (isLoop && (se?.task_id || se?.taskId)) {
      loopTaskIds.add(String(se.task_id || se.taskId));
    }
  });

  const qaRejectionLoopCount = loopTaskIds.size;

  // Count directive changes / scope changes
  const scopeChangesCount = safeDirectives.length;

  // Count blocker incidents (blocked ActionRequests: postpone attempts + reorder/swap denials)
  let blockerIncidentsCount = 0;
  safeActionRequests.forEach((ar) => {
    const isBlocked =
      ar?.status === "blocked" ||
      ar?.action_type === "postpone" ||
      ar?.actionType === "postpone";
    if (isBlocked) {
      blockerIncidentsCount++;
    }
  });

  return {
    slippageEventsCount,
    qaRejectionLoopCount,
    scopeChangesCount,
    blockerIncidentsCount,
  };
}

/**
 * calculateTeamPerformance(submissionsByEmployee, actionRequestsByEmployee, allTasks, slippageEvents)
 *
 * @param {Record<string, Array<Object>>|Array<Object>} submissionsByEmployee - Submissions map or array
 * @param {Record<string, Array<Object>>|Array<Object>} actionRequestsByEmployee - ActionRequests map or array
 * @param {Array<Object>} allTasks - All tasks for the project
 * @param {Array<Object>} slippageEvents - Slippage events for the project
 * @returns {Array<{
 *   userId: string,
 *   onTimeReliabilityPct: number|null,
 *   firstPassQualityPct: number|null,
 *   tasksCompleted: number
 * }>}
 */
function calculateTeamPerformance(
  submissionsByEmployee = {},
  actionRequestsByEmployee = {},
  allTasks = [],
  slippageEvents = []
) {
  const safeTasks = Array.isArray(allTasks) ? allTasks : [];
  const safeSlippages = Array.isArray(slippageEvents) ? slippageEvents : [];

  // Flatten or normalize submissions
  let allSubs = [];
  if (Array.isArray(submissionsByEmployee)) {
    allSubs = submissionsByEmployee;
  } else if (submissionsByEmployee && typeof submissionsByEmployee === "object") {
    Object.values(submissionsByEmployee).forEach((arr) => {
      if (Array.isArray(arr)) allSubs.push(...arr);
    });
  }

  // Group submissions by employee_id
  const subsByEmp = new Map();
  allSubs.forEach((sub) => {
    const uId = String(sub?.employee_id || sub?.employeeId || sub?.user_id || sub?.userId || "");
    if (!uId) return;
    if (!subsByEmp.has(uId)) subsByEmp.set(uId, []);
    subsByEmp.get(uId).push(sub);
  });

  // Identify all participating employees
  const userIds = new Set();
  if (submissionsByEmployee && typeof submissionsByEmployee === "object" && !Array.isArray(submissionsByEmployee)) {
    Object.keys(submissionsByEmployee).forEach((k) => {
      if (k) userIds.add(String(k));
    });
  }
  if (actionRequestsByEmployee && typeof actionRequestsByEmployee === "object" && !Array.isArray(actionRequestsByEmployee)) {
    Object.keys(actionRequestsByEmployee).forEach((k) => {
      if (k) userIds.add(String(k));
    });
  }
  safeTasks.forEach((t) => {
    const assignees = Array.isArray(t?.assignee_ids)
      ? t.assignee_ids
      : Array.isArray(t?.assigneeIds)
      ? t.assigneeIds
      : t?.assignee_id
      ? [t.assignee_id]
      : [];
    assignees.forEach((aId) => userIds.add(String(aId)));
  });
  subsByEmp.forEach((_, uId) => userIds.add(uId));
  safeSlippages.forEach((se) => {
    const uId = String(se?.user_id || se?.userId || "");
    if (uId) userIds.add(uId);
  });

  // Identify task IDs that triggered a slippage escalation
  const escalatedTaskIds = new Set();
  safeSlippages.forEach((se) => {
    if (se?.level === "escalation" || se?.level === "warning") {
      const tId = String(se?.task_id || se?.taskId || "");
      if (tId) escalatedTaskIds.add(tId);
    }
  });

  const performance = [];

  for (const userId of userIds) {
    // 1. Tasks completed by this employee
    const userCompletedTasks = safeTasks.filter((t) => {
      const isCompleted = t?.status === "completed";
      const assignees = Array.isArray(t?.assignee_ids)
        ? t.assignee_ids
        : Array.isArray(t?.assigneeIds)
        ? t.assigneeIds
        : t?.assignee_id
        ? [t.assignee_id]
        : [];
      return isCompleted && assignees.map(String).includes(userId);
    });

    const tasksCompleted = userCompletedTasks.length;

    // 2. On-Time Reliability: % of completed tasks that completed without a slippage escalation
    let onTimeReliabilityPct = null;
    if (tasksCompleted === 0) {
      // Avoid divide-by-zero explicitly per spec
      onTimeReliabilityPct = 0;
    } else {
      const escalatedCount = userCompletedTasks.filter((t) =>
        escalatedTaskIds.has(String(t._id || t.id))
      ).length;
      const onTimeCount = tasksCompleted - escalatedCount;
      onTimeReliabilityPct = Math.max(0, Math.round((onTimeCount / tasksCompleted) * 1000) / 10);
    }

    // 3. First-Pass Quality: % of submissions approved on first attempt (rejection_count === 0)
    const userSubs = subsByEmp.get(userId) || [];
    const approvedSubs = userSubs.filter((s) => s?.status === "approved");

    let firstPassQualityPct = null;
    if (approvedSubs.length === 0) {
      firstPassQualityPct = 0; // Avoid divide-by-zero explicitly per spec
    } else {
      const firstPassCount = approvedSubs.filter((s) => {
        const rej = Number(s?.rejection_count !== undefined ? s.rejection_count : s?.rejectionCount || 0);
        return rej === 0;
      }).length;
      firstPassQualityPct = Math.round((firstPassCount / approvedSubs.length) * 1000) / 10;
    }

    performance.push({
      userId,
      onTimeReliabilityPct,
      firstPassQualityPct,
      tasksCompleted,
    });
  }

  return performance;
}

module.exports = {
  calculateEstimationAccuracy,
  summarizeIncidents,
  calculateTeamPerformance,
};
