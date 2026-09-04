/**
 * Task Priority Calculation Engine (Phase 7)
 * Pure logic functions with ZERO database imports.
 * Implements Critical Path Method (CPM) longest-path slack analysis,
 * downstream dependency blocker counting, milestone deadline proximity,
 * and priority queue sorting (P0/P1/P2).
 */

function toId(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (val._id) return String(val._id);
  if (val.id && typeof val.id === "string") return val.id;
  if (typeof val.toString === "function") return val.toString();
  return String(val);
}

/**
 * Calculates Critical Path slack for all tasks in a dependency DAG using the Critical Path Method (CPM).
 * Edge weights are based on task estimate_hours (defaulting to 1 if 0/undefined).
 *
 * @param {Array<Object>} allTasks - Array of task objects with _id, depends_on, estimate_hours
 * @returns {Map<string, { es: number, ef: number, ls: number, lf: number, slack: number, isCritical: boolean }>}
 */
function calculateCriticalPathSlack(allTasks) {
  const result = new Map();
  if (!Array.isArray(allTasks) || allTasks.length === 0) {
    return result;
  }

  const tasksMap = new Map();
  const forwardAdj = new Map(); // prereq -> dependents
  const backwardAdj = new Map(); // dependent -> prereqs

  for (const t of allTasks) {
    const id = toId(t);
    tasksMap.set(id, t);
    forwardAdj.set(id, []);
    backwardAdj.set(id, []);
  }

  // Populate adjacency lists
  for (const t of allTasks) {
    const id = toId(t);
    const prereqs = Array.isArray(t.depends_on) ? t.depends_on : [];
    for (const p of prereqs) {
      const pId = toId(p);
      if (tasksMap.has(pId) && pId !== id) {
        forwardAdj.get(pId).push(id);
        backwardAdj.get(id).push(pId);
      }
    }
  }

  // Duration helper
  const getDuration = (t) => {
    const hours = Number(t?.estimate_hours);
    return !isNaN(hours) && hours > 0 ? hours : 1;
  };

  // 1. Forward Pass: Earliest Start (ES) and Earliest Finish (EF)
  const inDegree = new Map();
  for (const id of tasksMap.keys()) {
    inDegree.set(id, backwardAdj.get(id).length);
  }

  const queue = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder = [];
  const es = new Map();
  const ef = new Map();

  for (const id of tasksMap.keys()) {
    es.set(id, 0);
    ef.set(id, getDuration(tasksMap.get(id)));
  }

  while (queue.length > 0) {
    const u = queue.shift();
    topoOrder.push(u);

    const uEF = ef.get(u);
    for (const v of forwardAdj.get(u)) {
      if (uEF > es.get(v)) {
        es.set(v, uEF);
        ef.set(v, uEF + getDuration(tasksMap.get(v)));
      }
      inDegree.set(v, inDegree.get(v) - 1);
      if (inDegree.get(v) === 0) {
        queue.push(v);
      }
    }
  }

  // Find max project completion time
  let maxProjectTime = 0;
  for (const finishTime of ef.values()) {
    if (finishTime > maxProjectTime) {
      maxProjectTime = finishTime;
    }
  }

  // 2. Backward Pass: Latest Finish (LF) and Latest Start (LS)
  const ls = new Map();
  const lf = new Map();

  for (const id of tasksMap.keys()) {
    lf.set(id, maxProjectTime);
    ls.set(id, maxProjectTime - getDuration(tasksMap.get(id)));
  }

  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const u = topoOrder[i];
    const dependents = forwardAdj.get(u);

    if (dependents.length > 0) {
      let minDependentLS = Infinity;
      for (const v of dependents) {
        const vLS = ls.get(v);
        if (vLS < minDependentLS) {
          minDependentLS = vLS;
        }
      }
      lf.set(u, minDependentLS);
      ls.set(u, minDependentLS - getDuration(tasksMap.get(u)));
    }
  }

  // 3. Compute Slack = LS - ES (or LF - EF)
  for (const id of tasksMap.keys()) {
    const taskES = es.get(id);
    const taskEF = ef.get(id);
    const taskLS = ls.get(id);
    const taskLF = lf.get(id);
    const slack = Math.max(0, taskLS - taskES);
    const isCritical = slack <= 0.001;

    result.set(id, {
      es: taskES,
      ef: taskEF,
      ls: taskLS,
      lf: taskLF,
      slack,
      isCritical,
    });
  }

  return result;
}

/**
 * Counts the number of downstream tasks (direct and transitive) that depend on this task
 * and are not yet completed (status !== "completed").
 */
function getDownstreamBlocked(task, allTasks) {
  const targetId = toId(task);
  if (!targetId || !Array.isArray(allTasks)) {
    return { count: 0, blockedTasks: [] };
  }

  const forwardMap = new Map();
  for (const t of allTasks) {
    const id = toId(t);
    const prereqs = Array.isArray(t.depends_on) ? t.depends_on : [];
    for (const p of prereqs) {
      const pId = toId(p);
      if (!forwardMap.has(pId)) {
        forwardMap.set(pId, []);
      }
      forwardMap.get(pId).push(t);
    }
  }

  const visited = new Set();
  const queue = [...(forwardMap.get(targetId) || [])];
  const blockedTasks = [];

  while (queue.length > 0) {
    const curr = queue.shift();
    const currId = toId(curr);

    if (!visited.has(currId)) {
      visited.add(currId);
      if (curr.status !== "completed") {
        blockedTasks.push(curr);
      }
      const nextDependents = forwardMap.get(currId) || [];
      for (const nxt of nextDependents) {
        if (!visited.has(toId(nxt))) {
          queue.push(nxt);
        }
      }
    }
  }

  return {
    count: blockedTasks.length,
    blockedTasks,
  };
}

/**
 * Calculates priority (P0, P1, P2) for a task according to the governance rules:
 * - P0: isOnCriticalPath === true OR downstreamBlockedCount >= 2
 * - P1: downstreamBlockedCount === 1 OR daysUntilMilestone <= 3
 * - P2: everything else
 */
function calculateTaskPriority(task, allTasksWithDependencies = [], milestoneDeadline = null, todayDate = null) {
  if (!task) {
    return {
      priority: "P2",
      reasoning: "P2 — Standard priority (no task data provided)",
      isOnCriticalPath: false,
      downstreamBlockedCount: 0,
      daysUntilMilestone: 999,
    };
  }

  const taskId = toId(task);

  // 1. Critical Path Analysis
  const cpmMap = calculateCriticalPathSlack(allTasksWithDependencies);
  const cpmInfo = cpmMap.get(taskId);
  const isOnCriticalPath = cpmInfo ? cpmInfo.isCritical : false;

  // 2. Downstream Blocked Tasks Analysis
  const { count: downstreamBlockedCount, blockedTasks } = getDownstreamBlocked(task, allTasksWithDependencies);

  // 3. Days Until Milestone
  const deadlineStr = milestoneDeadline || task.end_date || task.start_date;
  let daysUntilMilestone = 999;

  if (deadlineStr) {
    const targetDate = new Date(deadlineStr);
    const baseDate = todayDate ? new Date(todayDate) : new Date();

    if (!isNaN(targetDate.getTime()) && !isNaN(baseDate.getTime())) {
      const targetMidnight = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
      const baseMidnight = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate()));
      const diffMs = targetMidnight.getTime() - baseMidnight.getTime();
      daysUntilMilestone = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }
  }

  // 4. Priority Rules (First match wins)
  let priority = "P2";
  let reasoning = "";

  const blockedNames = blockedTasks
    .map((t) => t.title || `Task (${toId(t).slice(-4)})`)
    .slice(0, 3)
    .join(", ");
  const moreCount = blockedTasks.length > 3 ? ` and ${blockedTasks.length - 3} more` : "";

  if (isOnCriticalPath || downstreamBlockedCount >= 2) {
    priority = "P0";
    if (isOnCriticalPath && downstreamBlockedCount >= 2) {
      reasoning = `P0 — Critical path task (zero slack) blocking ${downstreamBlockedCount} downstream tasks (${blockedNames}${moreCount})`;
    } else if (isOnCriticalPath) {
      reasoning = "P0 — Critical path milestone with zero slack; any delay impacts project delivery deadline";
    } else {
      reasoning = `P0 — High blocker impact: blocking ${downstreamBlockedCount} downstream tasks (${blockedNames}${moreCount})`;
    }
  } else if (downstreamBlockedCount === 1 || daysUntilMilestone <= 3) {
    priority = "P1";
    if (downstreamBlockedCount === 1 && daysUntilMilestone <= 3) {
      const blockedName = blockedTasks[0]?.title || "downstream task";
      reasoning = `P1 — Urgent deadline (${daysUntilMilestone} day${daysUntilMilestone === 1 ? "" : "s"} remaining) and blocking "${blockedName}"`;
    } else if (downstreamBlockedCount === 1) {
      const blockedName = blockedTasks[0]?.title || "downstream task";
      reasoning = `P1 — Single dependency blocker: required before "${blockedName}" can start`;
    } else {
      reasoning = `P1 — Urgent milestone deadline: due in ${daysUntilMilestone} day${daysUntilMilestone === 1 ? "" : "s"}`;
    }
  } else {
    priority = "P2";
    reasoning = `P2 — Normal execution priority (${daysUntilMilestone} days until due, ${downstreamBlockedCount} blockers)`;
  }

  return {
    priority,
    reasoning,
    isOnCriticalPath,
    downstreamBlockedCount,
    daysUntilMilestone,
  };
}

/**
 * Pure sort function for daily task queues:
 * - P0 first, then P1, then P2
 * - Within same priority, sorted by daysUntilMilestone ascending (soonest deadline first)
 */
function sortQueueByPriority(tasks) {
  if (!Array.isArray(tasks)) return [];

  const priorityWeight = {
    P0: 3,
    P1: 2,
    P2: 1,
  };

  return [...tasks].sort((a, b) => {
    const prioA = priorityWeight[a.computed_priority || a.priority] || 1;
    const prioB = priorityWeight[b.computed_priority || b.priority] || 1;

    if (prioB !== prioA) {
      return prioB - prioA;
    }

    const daysA = typeof a.daysUntilMilestone === "number" ? a.daysUntilMilestone : (a.end_date ? new Date(a.end_date).getTime() : 999999);
    const daysB = typeof b.daysUntilMilestone === "number" ? b.daysUntilMilestone : (b.end_date ? new Date(b.end_date).getTime() : 999999);

    return daysA - daysB;
  });
}

module.exports = {
  calculateCriticalPathSlack,
  getDownstreamBlocked,
  calculateTaskPriority,
  sortQueueByPriority,
};
