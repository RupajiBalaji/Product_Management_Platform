/**
 * Phase 12 — Pure Logic Change Rollback & PRD Versioning Engine
 *
 * ZERO DATABASE CALLS.
 * All data is passed in as pure JavaScript objects/arrays.
 */

/**
 * Normalizes task collection into a dictionary mapped by string taskId.
 * Accepts either an Array of tasks or an Object map.
 */
function normalizeTaskMap(currentTaskStates) {
  const map = {};
  if (!currentTaskStates) return map;

  if (Array.isArray(currentTaskStates)) {
    for (const t of currentTaskStates) {
      if (!t) continue;
      const id = String(t._id || t.id || t.taskId || "");
      if (id) map[id] = t;
    }
  } else if (typeof currentTaskStates === "object") {
    for (const [key, val] of Object.entries(currentTaskStates)) {
      if (!val) continue;
      const id = String(val._id || val.id || key);
      map[id] = val;
    }
  }
  return map;
}

/**
 * Normalizes ID string
 */
function toIdStr(val) {
  if (!val) return "";
  if (typeof val === "object" && val._id) return String(val._id);
  if (typeof val === "object" && val.id) return String(val.id);
  return String(val);
}

/**
 * Deep equality check for snapshot comparison
 */
function isEquivalent(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") {
    // Treat numbers/strings cleanly (e.g. 10 vs 10)
    return String(a) === String(b);
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEquivalent(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const k of keysA) {
    if (!isEquivalent(a[k], b[k])) return false;
  }
  return true;
}

/**
 * calculateRollbackImpact(changeTransaction, currentTaskStates, laterActiveTransactions = [])
 *
 * Assesses the feasibility, risks, and orphaned work implications of rolling back
 * a specific ChangeTransaction.
 *
 * Rules:
 * 1. For each taskId in tasks_added:
 *    - If status === "completed", classify as orphanedWork (warning case, requires explicit user confirmation).
 *    - Orphaned work alone does NOT set canRollback: false.
 * 2. For each entry in tasks_modified:
 *    - Compare currentTaskStates against entry.after snapshot.
 *    - If diverged, flag as a conflict requiring manual review.
 * 3. Later active transactions:
 *    - If a newer transaction (applied after this one) modified the same task,
 *      rolling back the older one while the newer one is active is blocked.
 * 4. canRollback is false if conflictingTasks.length > 0.
 *
 * @param {Object} changeTransaction - The ChangeTransaction to rollback
 * @param {Array|Object} currentTaskStates - Live tasks
 * @param {Array} [laterActiveTransactions=[]] - Other transactions with status === "applied"
 * @returns {{ canRollback: boolean, orphanedWork: Array, conflictingTasks: Array, hoursToBeFreed: number, blockReason: string|null }}
 */
function calculateRollbackImpact(
  changeTransaction,
  currentTaskStates,
  laterActiveTransactions = []
) {
  const taskMap = normalizeTaskMap(currentTaskStates);
  const txAddedIds = (changeTransaction?.tasks_added || []).map(toIdStr);
  const txModified = changeTransaction?.tasks_modified || [];

  const orphanedWork = [];
  const conflictingTasks = [];
  let hoursToBeFreed = 0;

  // 1. Check tasks added
  for (const taskId of txAddedIds) {
    const current = taskMap[taskId];
    if (!current) continue;

    const isCompleted =
      current.status === "completed" ||
      (Number(current.logged_hours || 0) > 0 && current.status === "completed");

    if (isCompleted) {
      orphanedWork.push({
        taskId,
        title: current.title || "Untitled Task",
        hoursCompleted: Number(current.logged_hours || current.actual_hours || 0),
      });
    } else {
      hoursToBeFreed += Number(current.estimate_hours || 0);
    }
  }

  // 2. Check tasks modified for state divergence
  for (const mod of txModified) {
    const taskId = toIdStr(mod.taskId);
    const current = taskMap[taskId];

    if (!current) {
      conflictingTasks.push({
        taskId,
        reason: "Modified task no longer exists in project workspace.",
      });
      continue;
    }

    const afterSnapshot = mod.after || {};
    // Compare essential fields that were recorded in the 'after' snapshot
    for (const key of Object.keys(afterSnapshot)) {
      if (key === "_id" || key === "updatedAt" || key === "__v") continue;
      const currVal = current[key];
      const afterVal = afterSnapshot[key];

      if (afterVal !== undefined && !isEquivalent(currVal, afterVal)) {
        conflictingTasks.push({
          taskId,
          reason: `Task state has diverged from post-change snapshot (field "${key}" was modified).`,
        });
        break;
      }
    }

    // If estimate hours was expanded in this change, revert delta adds to hoursToBeFreed
    const beforeEst = Number(mod.before?.estimate_hours || 0);
    const afterEst = Number(mod.after?.estimate_hours || 0);
    if (afterEst > beforeEst) {
      hoursToBeFreed += afterEst - beforeEst;
    }
  }

  // 3. Check for subsequent active change transactions modifying the same tasks
  const myTxId = toIdStr(changeTransaction?._id);
  const myAppliedTime = changeTransaction?.applied_at
    ? new Date(changeTransaction.applied_at).getTime()
    : 0;

  for (const laterTx of laterActiveTransactions) {
    const laterId = toIdStr(laterTx._id);
    if (laterId === myTxId) continue;
    if (laterTx.status !== "applied") continue;

    const laterAppliedTime = laterTx.applied_at
      ? new Date(laterTx.applied_at).getTime()
      : Infinity;

    // Only consider transactions applied AFTER this one (or passed as later transactions)
    if (laterAppliedTime >= myAppliedTime) {
      const laterTouched = [
        ...(laterTx.tasks_added || []).map(toIdStr),
        ...(laterTx.tasks_modified || []).map((m) => toIdStr(m.taskId)),
      ];

      const myTouched = [
        ...txAddedIds,
        ...txModified.map((m) => toIdStr(m.taskId)),
      ];

      for (const tId of myTouched) {
        if (laterTouched.includes(tId)) {
          const alreadyFlagged = conflictingTasks.some((c) => c.taskId === tId);
          if (!alreadyFlagged) {
            conflictingTasks.push({
              taskId: tId,
              reason: `Task was modified by subsequent active change transaction (${laterTx.change_description || laterId}). Rollback the newer transaction first.`,
            });
          }
        }
      }
    }
  }

  const hasConflicts = conflictingTasks.length > 0;
  const canRollback = !hasConflicts;

  let blockReason = null;
  if (hasConflicts) {
    blockReason = `Rollback is blocked due to ${conflictingTasks.length} task conflict(s) with subsequent modifications.`;
  }

  return {
    canRollback,
    orphanedWork,
    conflictingTasks,
    hoursToBeFreed,
    blockReason,
  };
}

/**
 * computeFieldDiff(oldObj, newObj)
 *
 * Analyzes top-level fields between two PRD versions and returns an array of diff items.
 *
 * @param {Object} oldObj - Pre-change object
 * @param {Object} newObj - Post-change object
 * @returns {Array<{ field: string, before: any, after: any }>}
 */
function computeFieldDiff(oldObj = {}, newObj = {}) {
  const diffs = [];
  const fieldsToCheck = [
    "executive_summary",
    "scope_in",
    "scope_out",
    "user_stories",
    "technical_architecture",
    "team_composition",
  ];

  for (const field of fieldsToCheck) {
    const before = oldObj[field];
    const after = newObj[field];

    if (!isEquivalent(before, after)) {
      diffs.push({
        field,
        before: before !== undefined ? before : null,
        after: after !== undefined ? after : null,
      });
    }
  }

  return diffs;
}

/**
 * nextVersion(currentVersion, isMajor)
 *
 * Increments semver version string.
 * Example:
 *   nextVersion("1.0") -> "1.1"
 *   nextVersion("1.0", true) -> "2.0"
 *   nextVersion("1.9") -> "1.10"
 */
function nextVersion(currentVersion = "1.0", isMajor = false) {
  const parts = String(currentVersion).split(".").map((n) => parseInt(n, 10) || 0);
  let major = parts[0] || 1;
  let minor = parts[1] || 0;

  if (isMajor) {
    major += 1;
    minor = 0;
  } else {
    minor += 1;
  }

  return `${major}.${minor}`;
}

module.exports = {
  calculateRollbackImpact,
  computeFieldDiff,
  nextVersion,
  normalizeTaskMap,
  isEquivalent,
};
