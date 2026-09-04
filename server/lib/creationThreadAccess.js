/**
 * Pure Logic Module: Creation Thread Scoped Access & Allowlist Sanitization (Phase 9)
 *
 * Enforces role-based permissions and strict data allowlisting for SME invites during
 * project intake/creation.
 * STRICT REQUIREMENT: Zero database dependencies (100% pure computational logic).
 */

/**
 * canAccessCreationThread(user, thread, project)
 * Evaluates whether a user is authorized to read or contribute to a project creation thread.
 *
 * Rules:
 *  - product_lead / pm: always allowed (sovereign access)
 *  - lead_architect: allowed if assigned to project (created_by, member_ids, or team_allocations)
 *  - invited_expert (any contributor/architect in invited_experts):
 *      allowed ONLY if user_id matches an active invite (revoked_at is falsy)
 *      AND thread.status === "active"
 *
 * @param {{ _id?: string, id?: string, uid?: string, user_type?: string, userType?: string }} user
 * @param {{ status?: string, invited_experts?: Array<{ user_id?: any, revoked_at?: any }> }} thread
 * @param {{ created_by?: any, member_ids?: any[], team_allocations?: any[] }} project
 * @returns {{ allowed: boolean, reason: string }}
 */
function canAccessCreationThread(user, thread, project) {
  if (!user) {
    return { allowed: false, reason: "Authentication required: missing user context." };
  }

  const userId = String(user._id || user.id || user.uid || "");
  const userRole = String(user.user_type || user.userType || "employee").toLowerCase();

  if (!userId) {
    return { allowed: false, reason: "Authentication required: missing user identifier." };
  }

  // 1. Product Lead sovereign authority
  if (userRole === "product_lead" || userRole === "pm") {
    return { allowed: true, reason: "Product Lead has full sovereign thread access." };
  }

  const threadStatus = String(thread?.status || "active").toLowerCase();
  const isFinalized = threadStatus === "finalized";

  // 2. Check if user is an assigned Lead Architect on this project
  if (userRole === "lead_architect" && project) {
    const creatorId = String(project.created_by?._id || project.created_by || "");
    const isCreator = creatorId === userId;

    const memberList = Array.isArray(project.member_ids)
      ? project.member_ids.map((m) => String(m?._id || m))
      : [];
    const isMember = memberList.includes(userId);

    const allocList = Array.isArray(project.team_allocations)
      ? project.team_allocations.map((a) => String(a?.user_id?._id || a?.user_id))
      : [];
    const isAllocated = allocList.includes(userId);

    if (isCreator || isMember || isAllocated) {
      return {
        allowed: true,
        reason: "Lead Architect has access to assigned project creation thread.",
      };
    }
  }

  // 3. Check Invited Expert status (defense-in-depth: checks both active invite and active thread status)
  if (isFinalized) {
    return {
      allowed: false,
      reason: "Creation thread is finalized. Expert deliberation access is revoked.",
    };
  }

  const expertsList = Array.isArray(thread?.invited_experts) ? thread.invited_experts : [];
  const activeInvite = expertsList.find((exp) => {
    const expUserId = String(exp?.user_id?._id || exp?.user_id || "");
    return expUserId === userId && !exp?.revoked_at;
  });

  if (activeInvite) {
    return { allowed: true, reason: "Active invited expert access granted." };
  }

  // Check if user was previously invited but revoked
  const revokedInvite = expertsList.find((exp) => {
    const expUserId = String(exp?.user_id?._id || exp?.user_id || "");
    return expUserId === userId && exp?.revoked_at;
  });

  if (revokedInvite) {
    return { allowed: false, reason: "Expert invitation has been revoked." };
  }

  if (userRole === "lead_architect") {
    return { allowed: false, reason: "Lead Architect is not assigned to this project." };
  }

  return { allowed: false, reason: "User is not an invited expert on this creation thread." };
}

/**
 * filterThreadDataForExpert(threadOrProject)
 * Strictly allowlists only clarification conversation messages and basic project title/intent.
 * Guaranteed to omit all budget, compensation rates, and internal resource allocation fields.
 *
 * @param {Record<string, any>} data - Raw thread or project object containing potentially sensitive fields
 * @returns {Record<string, any>} Sanitized object with ONLY allowlisted fields present as keys
 */
function filterThreadDataForExpert(data) {
  if (!data || typeof data !== "object") {
    return {};
  }

  const raw = typeof data.toObject === "function" ? data.toObject() : data;
  const sanitized = {};

  // Strict allowlist fields
  if (raw._id !== undefined) sanitized._id = raw._id;
  if (raw.id !== undefined) sanitized.id = raw.id;
  if (raw.project_id !== undefined) sanitized.project_id = raw.project_id;
  if (raw.title !== undefined) sanitized.title = raw.title;
  if (raw.project_title !== undefined) sanitized.project_title = raw.project_title;
  if (raw.description !== undefined) sanitized.description = raw.description;
  if (raw.intent !== undefined) sanitized.intent = raw.intent;
  if (raw.status !== undefined) sanitized.status = raw.status;
  if (raw.created_at !== undefined) sanitized.created_at = raw.created_at;
  if (raw.updated_at !== undefined) sanitized.updated_at = raw.updated_at;

  // Sanitized messages array (allowlist message attributes)
  if (Array.isArray(raw.messages)) {
    sanitized.messages = raw.messages.map((msg) => {
      const msgObj = typeof msg?.toObject === "function" ? msg.toObject() : msg;
      const cleanMsg = {};
      if (msgObj?._id !== undefined) cleanMsg._id = msgObj._id;
      if (msgObj?.id !== undefined) cleanMsg.id = msgObj.id;
      if (msgObj?.author_id !== undefined) cleanMsg.author_id = msgObj.author_id;
      if (msgObj?.author_name !== undefined) cleanMsg.author_name = msgObj.author_name;
      if (msgObj?.author_role_at_time !== undefined) {
        cleanMsg.author_role_at_time = msgObj.author_role_at_time;
      }
      if (msgObj?.content !== undefined) cleanMsg.content = msgObj.content;
      if (msgObj?.created_at !== undefined) cleanMsg.created_at = msgObj.created_at;
      return cleanMsg;
    });
  }

  // Sanitized uploaded documents if present
  if (Array.isArray(raw.uploaded_documents)) {
    sanitized.uploaded_documents = raw.uploaded_documents.map((doc) => {
      const docObj = typeof doc?.toObject === "function" ? doc.toObject() : doc;
      return {
        title: docObj?.title || "",
        url: docObj?.url || "",
        uploaded_at: docObj?.uploaded_at,
      };
    });
  }

  return sanitized;
}

module.exports = {
  canAccessCreationThread,
  filterThreadDataForExpert,
};
