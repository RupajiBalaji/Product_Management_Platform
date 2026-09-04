/**
 * Phase 10 — Visibility-Scoped Access Engine for Project Collaboration Chat
 * Pure logic module with ZERO database calls.
 *
 * Enforces Gantt visibility tiers on project threads:
 *   - "full": Can view all threads and task-linked discussions.
 *   - "own_data_only": Can only view general threads or threads linked to directly assigned tasks.
 *   - "own_plus_dependency": Can view general threads, directly assigned task threads,
 *     OR threads linked to direct prerequisites / dependents in the project DAG.
 */

/**
 * Normalizes task ID to string
 */
function normalizeId(val) {
  if (!val) return "";
  if (typeof val === "object") {
    return String(val._id || val.id || "");
  }
  return String(val);
}

/**
 * Evaluates whether a user is authorized to view a specific channel thread.
 *
 * @param {Object|string} user - User object or user ID string
 * @param {Object} thread - Channel thread document/object
 * @param {string} [userVisibilityTier="full"] - Visibility tier: "full" | "own_data_only" | "own_plus_dependency"
 * @param {Array<Object>} [taskDependencyGraph=[]] - List of project tasks with id, assignee_ids, depends_on
 * @returns {{ allowed: boolean, reason: string }}
 */
function canViewThread(user, thread, userVisibilityTier = "full", taskDependencyGraph = []) {
  if (!thread) {
    return { allowed: false, reason: "Thread does not exist." };
  }

  const userId = normalizeId(typeof user === "object" ? user._id || user.id : user);
  const userType = typeof user === "object" ? user.user_type || user.role : null;

  // 1. If thread has no linked task, it's a general team channel thread accessible to all project members
  if (!thread.linked_task_id) {
    return {
      allowed: true,
      reason: "General team channel thread without linked task is accessible to all project members.",
    };
  }

  const linkedTaskId = normalizeId(thread.linked_task_id);

  // 2. Product Leads and Lead Architects automatically have full visibility
  let effectiveTier = userVisibilityTier;
  if (userType === "product_lead" || userType === "pm" || userType === "lead_architect") {
    effectiveTier = "full";
  }

  // 3. Full visibility tier can view any task-linked thread
  if (effectiveTier === "full") {
    return {
      allowed: true,
      reason: "Full visibility tier allows viewing all task-linked threads.",
    };
  }

  // Normalize task graph into an array of clean objects
  const tasks = Array.isArray(taskDependencyGraph) ? taskDependencyGraph : [];
  const taskMap = new Map();

  tasks.forEach((t) => {
    const tId = normalizeId(t._id || t.id);
    const assignees = (t.assignee_ids || []).map(normalizeId);
    const deps = (t.depends_on || []).map(normalizeId);
    taskMap.set(tId, { id: tId, assignee_ids: assignees, depends_on: deps });
  });

  const linkedTask = taskMap.get(linkedTaskId);
  const isDirectlyAssigned = linkedTask?.assignee_ids?.includes(userId) || false;

  // 4. "own_data_only" tier: directly assigned tasks only
  if (effectiveTier === "own_data_only") {
    if (isDirectlyAssigned) {
      return {
        allowed: true,
        reason: "User is directly assigned to the linked task.",
      };
    }
    return {
      allowed: false,
      reason: "Own-data-only visibility tier restricts viewing to directly assigned tasks.",
    };
  }

  // 5. "own_plus_dependency" tier: directly assigned OR direct prerequisite/dependent
  if (effectiveTier === "own_plus_dependency") {
    if (isDirectlyAssigned) {
      return {
        allowed: true,
        reason: "User is directly assigned to the linked task.",
      };
    }

    // Find all tasks assigned to the user
    const userTasks = [];
    for (const t of taskMap.values()) {
      if (t.assignee_ids.includes(userId)) {
        userTasks.push(t);
      }
    }

    // Case A: Is linkedTask a direct prerequisite of any userTask?
    // (i.e. userTask depends on linkedTask)
    const isPrerequisite = userTasks.some((ut) => ut.depends_on.includes(linkedTaskId));
    if (isPrerequisite) {
      return {
        allowed: true,
        reason: "Linked task is a direct prerequisite of user's assigned task.",
      };
    }

    // Case B: Is linkedTask a direct dependent of any userTask?
    // (i.e. linkedTask depends on userTask)
    if (linkedTask) {
      const isDependent = userTasks.some((ut) => linkedTask.depends_on.includes(ut.id));
      if (isDependent) {
        return {
          allowed: true,
          reason: "Linked task directly depends on user's assigned task.",
        };
      }
    }

    return {
      allowed: false,
      reason: "Linked task is outside user's assignment and direct dependency network.",
    };
  }

  return {
    allowed: false,
    reason: `Unknown or unauthorized visibility tier: '${effectiveTier}'.`,
  };
}

/**
 * Validates whether a user can access a DirectMessage channel.
 * Must be one of the participant_ids.
 *
 * @param {string} userId - Requester User ID
 * @param {Object} dm - DirectMessage document or object
 * @returns {boolean}
 */
function canAccessDirectMessage(userId, dm) {
  if (!userId || !dm || !Array.isArray(dm.participant_ids)) return false;
  const uid = normalizeId(userId);
  return dm.participant_ids.map(normalizeId).includes(uid);
}

/**
 * Sorts two participant user IDs for consistent unique DM channel lookup.
 *
 * @param {string} userA
 * @param {string} userB
 * @returns {string[]}
 */
function sortParticipantIds(userA, userB) {
  return [normalizeId(userA), normalizeId(userB)].sort();
}

module.exports = {
  canViewThread,
  canAccessDirectMessage,
  sortParticipantIds,
};
