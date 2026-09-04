/**
 * Phase 3 — Global Capacity Registry + Priority-Weighted Conflict Resolution
 *
 * This module is the single source of truth for employee capacity calculations.
 * It is PURE COMPUTATION — it never writes any database records.
 * All writes (when forced overrides happen) are handled in the route layer.
 */

const { Project } = require("../models/models");
const User = require("../models/User");
const DynamicRole = require("../models/DynamicRole");

// ─── Priority ordering (P1 beats P2 beats P3) ────────────────────────────────
const PRIORITY_WEIGHT = { P1: 3, P2: 2, P3: 1 };

/**
 * Resolve the daily cap for a user in a specific project.
 * Resolution order:
 *   1. team_allocation.role_id → DynamicRole.defaultDailyCapHours
 *   2. User.defaultDailyCapHours
 *   3. Hard fallback: 8
 */
async function resolveUserDailyCap(userId) {
  const user = await User.findById(userId).lean();
  return user?.defaultDailyCapHours || 8;
}

/**
 * getEmployeeGlobalAllocation(userId)
 *
 * Returns the complete picture of how many daily hours this user is committed to
 * across ALL active projects. Frozen/archived projects are excluded.
 *
 * Returns:
 * {
 *   userId,
 *   totalDailyHours,
 *   dailyCap,
 *   utilizationPct,
 *   isOverAllocated,
 *   projects: [{ projectId, projectTitle, priority, dailyHours }]
 * }
 */
async function getEmployeeGlobalAllocation(userId) {
  const activeProjects = await Project.find({
    status: { $in: ["active", "in-review"] },
    "team_allocations.user_id": String(userId),
  }).lean();

  const dailyCap = await resolveUserDailyCap(userId);

  const projects = [];
  let totalDailyHours = 0;

  for (const proj of activeProjects) {
    const alloc = (proj.team_allocations || []).find(
      (a) => String(a.user_id) === String(userId)
    );
    if (!alloc) continue;

    const hours = alloc.daily_hours || 0;
    totalDailyHours += hours;

    // Normalize legacy priorities gracefully
    const priority = normalizePriorityServer(proj.priority);

    projects.push({
      projectId: String(proj._id),
      projectTitle: proj.title,
      priority,
      dailyHours: hours,
    });
  }

  const utilizationPct = dailyCap > 0 ? Math.round((totalDailyHours / dailyCap) * 100) : 0;

  return {
    userId: String(userId),
    totalDailyHours,
    dailyCap,
    utilizationPct,
    isOverAllocated: totalDailyHours > dailyCap,
    projects,
  };
}

/**
 * checkCapacityConflict(userId, proposedProjectId, proposedDailyHours)
 *
 * Checks whether adding/updating an allocation would exceed the user's daily cap.
 * Excludes the proposedProjectId from the existing total (handles update case).
 *
 * Returns:
 *   { hasConflict: false }
 *   OR
 *   { hasConflict: true, currentTotal, proposedTotal, dailyCap, overflowHours, conflictingProjects }
 */
async function checkCapacityConflict(userId, proposedProjectId, proposedDailyHours, overrideAllocation = null) {
  const allocation = overrideAllocation || (await getEmployeeGlobalAllocation(userId));

  // Exclude the project being updated (for update-in-place scenario)
  const existingExcluding = allocation.projects.filter(
    (p) => String(p.projectId) !== String(proposedProjectId)
  );

  const currentTotal = existingExcluding.reduce((sum, p) => sum + p.dailyHours, 0);
  const proposedTotal = currentTotal + proposedDailyHours;
  const { dailyCap } = allocation;

  if (proposedTotal <= dailyCap) {
    return { hasConflict: false };
  }

  const overflowHours = proposedTotal - dailyCap;

  return {
    hasConflict: true,
    currentTotal,
    proposedDailyHours,
    proposedTotal,
    dailyCap,
    overflowHours: parseFloat(overflowHours.toFixed(2)),
    conflictingProjects: existingExcluding, // All existing allocations contributing to the conflict
  };
}

/**
 * resolveConflictByPriority(userId, proposedProjectId, proposedPriority, proposedDailyHours, overrideAllocation)
 *
 * SUGGESTION ONLY — no writes.
 *
 * Given a proposed project (with a priority and daily hours), examines which existing
 * allocations could be reduced to make room, following the rule:
 *   - Only lower-priority projects may be reduced
 *   - P1 incoming beats P2/P3 existing → suggest reducing P2/P3
 *   - P2 incoming beats P3 existing → suggest reducing P3
 *   - P3 incoming: no lower-priority projects to reduce → must reduce proposed request
 *   - Equal priority: not auto-resolvable, flag for manual product_lead decision
 *
 * Returns:
 * {
 *   resolvable: boolean,
 *   reason: string,          // Human-readable explanation
 *   reductions: [{
 *     projectId, projectTitle, currentHours, suggestedHours, reduceBy, priority
 *   }]
 * }
 */
async function resolveConflictByPriority(userId, proposedProjectId, proposedPriority, proposedDailyHours, overrideAllocation = null) {
  const conflict = await checkCapacityConflict(userId, proposedProjectId, proposedDailyHours, overrideAllocation);

  if (!conflict.hasConflict) {
    return { resolvable: true, reason: "No conflict — no resolution needed.", reductions: [] };
  }

  const incomingWeight = PRIORITY_WEIGHT[normalizePriorityServer(proposedPriority)] || 2;
  const existingProjects = conflict.conflictingProjects || [];

  // Find projects with strictly LOWER priority than incoming
  const lowerPriorityProjects = existingProjects.filter((p) => {
    const existingWeight = PRIORITY_WEIGHT[normalizePriorityServer(p.priority)] || 2;
    return existingWeight < incomingWeight;
  });

  // Find projects with equal priority
  const equalPriorityProjects = existingProjects.filter((p) => {
    const existingWeight = PRIORITY_WEIGHT[normalizePriorityServer(p.priority)] || 2;
    return existingWeight === incomingWeight;
  });

  if (lowerPriorityProjects.length === 0 && equalPriorityProjects.length > 0) {
    return {
      resolvable: false,
      reason: `Conflict involves projects with equal priority (${normalizePriorityServer(proposedPriority)}). ` +
        `This cannot be automatically resolved — manual Product Lead decision required.`,
      reductions: [],
    };
  }

  if (lowerPriorityProjects.length === 0) {
    // Incoming is lower or equal priority and there is nothing to displace
    return {
      resolvable: false,
      reason: `The incoming project (${normalizePriorityServer(proposedPriority)}) has equal or lower priority ` +
        `than all existing allocations. The overflow of ${conflict.overflowHours} hrs/day must be resolved ` +
        `by reducing the proposed allocation for this project instead.`,
      reductions: [],
    };
  }

  // Greedily suggest reductions from the lowest priority projects first
  const sorted = [...lowerPriorityProjects].sort(
    (a, b) => (PRIORITY_WEIGHT[normalizePriorityServer(a.priority)] || 0) - (PRIORITY_WEIGHT[normalizePriorityServer(b.priority)] || 0)
  );

  const reductions = [];
  let remainingOverflow = conflict.overflowHours;

  for (const proj of sorted) {
    if (remainingOverflow <= 0) break;

    const reduceBy = Math.min(proj.dailyHours, remainingOverflow);
    const suggestedHours = parseFloat((proj.dailyHours - reduceBy).toFixed(2));

    reductions.push({
      projectId: proj.projectId,
      projectTitle: proj.projectTitle,
      currentHours: proj.dailyHours,
      suggestedHours,
      reduceBy: parseFloat(reduceBy.toFixed(2)),
      priority: normalizePriorityServer(proj.priority),
    });

    remainingOverflow -= reduceBy;
  }

  const fullyResolvable = remainingOverflow <= 0;

  return {
    resolvable: fullyResolvable,
    reason: fullyResolvable
      ? `Reducing the ${reductions.length} lower-priority project(s) listed below will free enough capacity.`
      : `Partially resolvable — even after reducing all lower-priority allocations, ${parseFloat(remainingOverflow.toFixed(2))} hrs/day overflow remains. ` +
        `Product Lead must decide how to handle the residual.`,
    reductions,
  };
}

/**
 * getDashboardCapacity()
 *
 * Returns capacity snapshot for ALL active users (for the portfolio dashboard).
 * Shape: [{ userId, name, email, totalDailyHours, dailyCap, utilizationPct, isOverAllocated }]
 */
async function getDashboardCapacity() {
  const users = await User.find({ status: "active" }).lean();

  const results = await Promise.all(
    users.map(async (u) => {
      const alloc = await getEmployeeGlobalAllocation(String(u._id));
      return {
        userId: String(u._id),
        name: u.full_name,
        email: u.email,
        roleTitle: u.role_title,
        userType: u.user_type,
        totalDailyHours: alloc.totalDailyHours,
        dailyCap: alloc.dailyCap,
        utilizationPct: alloc.utilizationPct,
        isOverAllocated: alloc.isOverAllocated,
        projectCount: alloc.projects.length,
      };
    })
  );

  return results;
}

// ─── Internal helper ─────────────────────────────────────────────────────────

function normalizePriorityServer(priority) {
  if (!priority) return "P2";
  if (priority === "P1" || priority === "P2" || priority === "P3") return priority;
  // Legacy values
  if (priority === "critical") return "P1";
  if (priority === "high") return "P1";
  if (priority === "medium") return "P2";
  if (priority === "low") return "P3";
  return "P2";
}

module.exports = {
  getEmployeeGlobalAllocation,
  checkCapacityConflict,
  resolveConflictByPriority,
  getDashboardCapacity,
  normalizePriorityServer,
};
