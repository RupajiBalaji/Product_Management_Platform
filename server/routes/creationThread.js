const express = require("express");
const router = express.Router();

const CreationThread = require("../models/CreationThread");
const { Project } = require("../models/models");
const User = require("../models/User");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");

const { verifyToken, requireProductLead } = require("../middleware/auth");
const {
  canAccessCreationThread,
  filterThreadDataForExpert,
} = require("../lib/creationThreadAccess");

/**
 * Helper: Find or auto-initialize CreationThread for a project
 */
async function getOrCreateThread(projectId) {
  let thread = await CreationThread.findOne({ project_id: projectId });
  if (!thread) {
    thread = await CreationThread.create({
      project_id: projectId,
      status: "active",
      messages: [],
      invited_experts: [],
    });
  }
  return thread;
}

/**
 * Helper: Finalize thread and revoke all active expert invites
 */
async function finalizeCreationThreadHelper(projectId, actorId) {
  const thread = await CreationThread.findOne({ project_id: projectId });
  if (!thread) return null;

  const now = new Date();
  thread.status = "finalized";

  let revokedCount = 0;
  (thread.invited_experts || []).forEach((inv) => {
    if (!inv.revoked_at) {
      inv.revoked_at = now;
      revokedCount++;
    }
  });

  await thread.save();

  await AuditLog.record({
    actorId: actorId || "system",
    action: "CREATION_THREAD_FINALIZED",
    entityType: "CreationThread",
    entityId: String(thread._id),
    after: { status: "finalized", revokedExpertsCount: revokedCount },
  });

  return thread;
}

router.get(["/creation-threads/my-invitations", "/my-invitations"], verifyToken, async (req, res) => {
  try {
    const activeThreads = await CreationThread.find({
      status: "active",
      invited_experts: {
        $elemMatch: {
          user_id: req.uid,
          revoked_at: null,
        },
      },
    })
      .populate("project_id", "title description priority status created_at")
      .lean();

    const invitations = activeThreads
      .filter((t) => t.project_id) // ensure project exists
      .map((t) => {
        const myInvite = (t.invited_experts || []).find(
          (inv) => String(inv.user_id) === req.uid && !inv.revoked_at
        );
        return {
          threadId: String(t._id),
          projectId: String(t.project_id._id),
          projectTitle: t.project_id.title,
          projectDescription: t.project_id.description || "",
          priority: t.project_id.priority,
          invitedAt: myInvite?.invited_at || t.created_at,
          status: t.status,
        };
      });

    res.json({ success: true, invitations });
  } catch (err) {
    console.error("GET /api/creation-threads/my-invitations error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/projects/:id/creation-thread ───────────────────────────────────
// Fetch project creation deliberation thread. Filtered via allowlist for invited experts.
router.get("/projects/:id/creation-thread", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const thread = await getOrCreateThread(project._id);

    // Scoped Access Check (Pure Logic)
    const access = canAccessCreationThread(req.user, thread, project);
    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        error: access.reason,
        code: "CREATION_THREAD_ACCESS_DENIED",
      });
    }

    // Enrich messages with author names and avatars
    const authorIds = [...new Set((thread.messages || []).map((m) => m.author_id))];
    const authors = await User.find({ _id: { $in: authorIds } }, "full_name role_title photo_url").lean();
    const authorMap = new Map(authors.map((a) => [String(a._id), a]));

    const enrichedMessages = (thread.messages || []).map((m) => {
      const author = authorMap.get(String(m.author_id));
      return {
        id: String(m._id),
        _id: m._id,
        author_id: m.author_id,
        author_name: author?.full_name || "Team Member",
        author_role_title: author?.role_title || "Contributor",
        author_photo_url: author?.photo_url || "",
        author_role_at_time: m.author_role_at_time,
        content: m.content,
        created_at: m.created_at,
      };
    });

    const isProductLead = req.userType === "product_lead" || req.userType === "pm";
    const isLeadArchitect = req.userType === "lead_architect";
    const isAssignedArchitect =
      isLeadArchitect &&
      (String(project.created_by) === req.uid ||
        (project.member_ids || []).map(String).includes(req.uid));

    // Base thread DTO
    const threadData = {
      id: String(thread._id),
      _id: thread._id,
      project_id: String(project._id),
      project_title: project.title,
      title: project.title,
      description: project.description,
      intent: project.description,
      status: thread.status,
      created_at: thread.created_at,
      updated_at: thread.updated_at,
      messages: enrichedMessages,
    };

    // If Product Lead or Assigned Lead Architect, include full invited_experts roster
    if (isProductLead || isAssignedArchitect) {
      // Enrich invited experts with user details
      const expertUserIds = (thread.invited_experts || []).map((e) => e.user_id);
      const expertUsers = await User.find(
        { _id: { $in: expertUserIds } },
        "full_name email role_title"
      ).lean();
      const expertUserMap = new Map(expertUsers.map((u) => [String(u._id), u]));

      threadData.invited_experts = (thread.invited_experts || []).map((exp) => {
        const u = expertUserMap.get(String(exp.user_id));
        return {
          user_id: exp.user_id,
          user_name: u?.full_name || exp.user_id,
          user_email: u?.email || "",
          user_role_title: u?.role_title || "Expert",
          invited_by: exp.invited_by,
          invited_at: exp.invited_at,
          revoked_at: exp.revoked_at,
          isActive: !exp.revoked_at,
        };
      });

      return res.json({
        success: true,
        thread: threadData,
      });
    }

    // Requester is an Invited Expert -> STRICT ALLOWLIST FILTERING
    const filtered = filterThreadDataForExpert(threadData);
    return res.json({
      success: true,
      thread: filtered,
    });
  } catch (err) {
    console.error("GET /api/projects/:id/creation-thread error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/projects/:id/creation-thread/messages ──────────────────────────
// Post a deliberation message to the creation thread
router.post("/projects/:id/creation-thread/messages", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: "Message content cannot be empty." });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const thread = await getOrCreateThread(project._id);

    // Scoped Access Check
    const access = canAccessCreationThread(req.user, thread, project);
    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        error: access.reason,
        code: "CREATION_THREAD_ACCESS_DENIED",
      });
    }

    // Determine author role snapshot at message time
    let roleSnapshot = "contributor";
    const userRole = req.userType;
    if (userRole === "product_lead" || userRole === "pm") {
      roleSnapshot = "product_lead";
    } else if (
      userRole === "lead_architect" &&
      (String(project.created_by) === req.uid || (project.member_ids || []).map(String).includes(req.uid))
    ) {
      roleSnapshot = "lead_architect";
    } else {
      const isInvited = (thread.invited_experts || []).some(
        (exp) => String(exp.user_id) === req.uid && !exp.revoked_at
      );
      if (isInvited) {
        roleSnapshot = "invited_expert";
      } else {
        roleSnapshot = req.user?.role_title || "contributor";
      }
    }

    const newMessage = {
      author_id: req.uid,
      author_role_at_time: roleSnapshot,
      content: content.trim(),
      created_at: new Date(),
    };

    thread.messages.push(newMessage);
    await thread.save();

    const savedMsg = thread.messages[thread.messages.length - 1];

    res.status(201).json({
      success: true,
      message: {
        id: String(savedMsg._id),
        _id: savedMsg._id,
        author_id: savedMsg.author_id,
        author_name: req.user?.full_name || "Team Member",
        author_role_title: req.user?.role_title || "Contributor",
        author_role_at_time: savedMsg.author_role_at_time,
        content: savedMsg.content,
        created_at: savedMsg.created_at,
      },
    });
  } catch (err) {
    console.error("POST /api/projects/:id/creation-thread/messages error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/projects/:id/creation-thread/invite-expert ─────────────────────
// Product Lead invites an employee as a Subject Matter Expert (SME)
router.post(
  "/projects/:id/creation-thread/invite-expert",
  verifyToken,
  requireProductLead,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ success: false, error: "user_id is required." });
      }

      const project = await Project.findById(id).lean();
      if (!project) {
        return res.status(404).json({ success: false, error: "Project not found" });
      }

      const expertUser = await User.findById(user_id);
      if (!expertUser) {
        return res.status(404).json({ success: false, error: "Expert user not found" });
      }

      const thread = await getOrCreateThread(project._id);

      if (thread.status === "finalized") {
        return res.status(400).json({
          success: false,
          error: "Cannot invite experts to a finalized creation thread.",
        });
      }

      // Check if user already has an active invitation
      const existingActive = (thread.invited_experts || []).find(
        (exp) => String(exp.user_id) === String(user_id) && !exp.revoked_at
      );

      if (existingActive) {
        return res.status(400).json({
          success: false,
          error: "User is already an active invited expert on this thread.",
        });
      }

      // Add invite
      thread.invited_experts.push({
        user_id: String(user_id),
        invited_by: req.uid,
        invited_at: new Date(),
        revoked_at: null,
      });

      await thread.save();

      // Record sensitive governance AuditLog
      await AuditLog.record({
        actorId: req.uid,
        action: "SME_EXPERT_INVITED",
        entityType: "CreationThread",
        entityId: String(thread._id),
        after: {
          user_id: String(user_id),
          user_name: expertUser.full_name,
          project_id: String(project._id),
        },
      });

      // Dispatch Notification to invited expert
      await Notification.create({
        recipient_id: String(user_id),
        type: "sme_invite",
        title: "Subject Matter Expert Invitation",
        message: `You have been invited by ${req.user?.full_name || "Product Lead"} to provide expert guidance on project "${project.title}".`,
        entity_id: project._id,
        entity_type: "Project",
      });

      res.status(201).json({
        success: true,
        message: `Invited ${expertUser.full_name} as Subject Matter Expert.`,
        expert: {
          user_id: String(expertUser._id),
          name: expertUser.full_name,
          role_title: expertUser.role_title,
          invited_at: new Date(),
        },
      });
    } catch (err) {
      console.error("POST /api/projects/:id/creation-thread/invite-expert error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── POST /api/projects/:id/creation-thread/revoke-expert ─────────────────────
// Product Lead revokes an SME's thread access
router.post(
  "/projects/:id/creation-thread/revoke-expert",
  verifyToken,
  requireProductLead,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ success: false, error: "user_id is required." });
      }

      const project = await Project.findById(id).lean();
      if (!project) {
        return res.status(404).json({ success: false, error: "Project not found" });
      }

      const thread = await getOrCreateThread(project._id);

      const invite = (thread.invited_experts || []).find(
        (exp) => String(exp.user_id) === String(user_id) && !exp.revoked_at
      );

      if (!invite) {
        return res.status(404).json({
          success: false,
          error: "No active expert invitation found for this user.",
        });
      }

      invite.revoked_at = new Date();
      await thread.save();

      await AuditLog.record({
        actorId: req.uid,
        action: "SME_EXPERT_REVOKED",
        entityType: "CreationThread",
        entityId: String(thread._id),
        after: { user_id: String(user_id), project_id: String(project._id) },
      });

      res.json({
        success: true,
        message: `Expert access revoked for user ${user_id}.`,
      });
    } catch (err) {
      console.error("POST /api/projects/:id/creation-thread/revoke-expert error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── POST /api/projects/:id/creation-thread/finalize ──────────────────────────
// Finalizes creation deliberation and revokes all active expert invites
router.post(
  "/projects/:id/creation-thread/finalize",
  verifyToken,
  requireProductLead,
  async (req, res) => {
    try {
      const { id } = req.params;
      const project = await Project.findById(id).lean();
      if (!project) {
        return res.status(404).json({ success: false, error: "Project not found" });
      }

      const thread = await finalizeCreationThreadHelper(project._id, req.uid);
      if (!thread) {
        return res.status(404).json({ success: false, error: "Creation thread not found." });
      }

      res.json({
        success: true,
        message: "Creation thread finalized. All expert invitations have been revoked.",
        thread: {
          id: String(thread._id),
          status: thread.status,
        },
      });
    } catch (err) {
      console.error("POST /api/projects/:id/creation-thread/finalize error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

module.exports = router;
module.exports.finalizeCreationThreadHelper = finalizeCreationThreadHelper;
