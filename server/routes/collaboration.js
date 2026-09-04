const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const TeamChannel = require("../models/TeamChannel");
const DirectMessage = require("../models/DirectMessage");
const { Project, Task } = require("../models/models");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { verifyToken } = require("../middleware/auth");
const {
  canViewThread,
  canAccessDirectMessage,
  sortParticipantIds,
} = require("../lib/chatVisibility");
const { detectDependencyReference } = require("../lib/threadMonitor");

/**
 * Helper: Find or lazily initialize TeamChannel for a project.
 */
async function ensureTeamChannel(projectId) {
  let channel = await TeamChannel.findOne({ project_id: projectId });
  if (!channel) {
    channel = await TeamChannel.create({
      project_id: projectId,
      threads: [
        {
          topic: "General Team Discussions",
          created_by: "system",
          messages: [
            {
              author_id: "system",
              content: "Welcome to the Project Collaboration Channel. Deliberate on implementations, dependencies, and architecture here.",
              created_at: new Date(),
            },
          ],
          linked_task_id: null,
          created_at: new Date(),
        },
      ],
    });
  }
  return channel;
}

/**
 * Resolves effective visibility tier for a user in a project.
 */
function resolveVisibilityTier(user, project) {
  const userType = user?.user_type || user?.role;
  if (userType === "product_lead" || userType === "pm" || userType === "lead_architect") {
    return "full";
  }

  // Look for custom tier in project team allocations if defined
  const alloc = (project?.team_allocations || []).find(
    (a) => String(a.user_id) === String(user?._id || user?.id)
  );
  if (alloc?.visibility_tier) {
    return alloc.visibility_tier;
  }

  // Default for contributors: own_plus_dependency (see own tasks and direct dependency network)
  return "own_plus_dependency";
}

// ─── GET /api/projects/:id/channel ───────────────────────────────────────────
// Fetch project team channel, filtering threads through canViewThread
router.get("/projects/:id/channel", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const isMember =
      (project.member_ids || []).map(String).includes(req.uid) ||
      String(project.created_by) === req.uid ||
      req.userType === "product_lead" ||
      req.userType === "pm";

    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: "Access denied: You are not assigned to this project.",
      });
    }

    const channel = await ensureTeamChannel(project._id);
    const tasks = await Task.find({ project_id: id }).lean();
    const visibilityTier = resolveVisibilityTier(req.user, project);

    // Filter threads user is authorized to view
    const visibleThreads = (channel.threads || []).filter((thread) => {
      const access = canViewThread(req.user, thread, visibilityTier, tasks);
      return access.allowed;
    });

    // Populate user details for authors in messages
    const allAuthorIds = new Set();
    visibleThreads.forEach((t) => {
      allAuthorIds.add(t.created_by);
      (t.messages || []).forEach((m) => allAuthorIds.add(m.author_id));
    });

    const authors = await User.find(
      { _id: { $in: Array.from(allAuthorIds) } },
      "full_name role_title photo_url"
    ).lean();
    const authorMap = new Map(authors.map((a) => [String(a._id), a]));

    const enrichedThreads = visibleThreads.map((t) => {
      const creator = authorMap.get(String(t.created_by));
      const linkedTask = t.linked_task_id
        ? tasks.find((tk) => String(tk._id) === String(t.linked_task_id))
        : null;

      return {
        id: String(t._id),
        _id: t._id,
        topic: t.topic,
        created_by: t.created_by,
        creator_name: creator?.full_name || (t.created_by === "system" ? "System Bot" : "Team Member"),
        creator_role_title: creator?.role_title || "Contributor",
        creator_photo_url: creator?.photo_url || "",
        linked_task_id: t.linked_task_id,
        linked_task_title: linkedTask?.title || null,
        flagged_for_review: Boolean(t.flagged_for_review),
        flagged_reason: t.flagged_reason || null,
        suggested_resolution: t.suggested_resolution || null,
        created_at: t.created_at,
        messages: (t.messages || []).map((m) => {
          const author = authorMap.get(String(m.author_id));
          return {
            id: String(m._id),
            _id: m._id,
            author_id: m.author_id,
            author_name: author?.full_name || (m.author_id === "system" ? "System Bot" : "Team Member"),
            author_role_title: author?.role_title || "Contributor",
            author_photo_url: author?.photo_url || "",
            content: m.content,
            created_at: m.created_at,
          };
        }),
      };
    });

    res.json({
      success: true,
      channel: {
        id: String(channel._id),
        _id: channel._id,
        project_id: String(project._id),
        project_title: project.title,
        visibility_tier: visibilityTier,
        threads: enrichedThreads,
      },
    });
  } catch (err) {
    console.error("GET /api/projects/:id/channel error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/projects/:id/channel/threads ──────────────────────────────────
// Create a new topic thread (optionally linked to a task)
router.post("/projects/:id/channel/threads", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { topic, linked_task_id, initial_message } = req.body;

    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return res.status(400).json({ success: false, error: "Topic title is required." });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const isMember =
      (project.member_ids || []).map(String).includes(req.uid) ||
      String(project.created_by) === req.uid ||
      req.userType === "product_lead" ||
      req.userType === "pm";

    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: "Access denied: You are not assigned to this project.",
      });
    }

    const tasks = await Task.find({ project_id: id }).lean();
    const visibilityTier = resolveVisibilityTier(req.user, project);

    // If linking to a task, ensure the creator has permission to view that task
    if (linked_task_id) {
      const tempThread = { topic, linked_task_id };
      const access = canViewThread(req.user, tempThread, visibilityTier, tasks);
      if (!access.allowed) {
        return res.status(403).json({
          success: false,
          error: `Cannot create thread for task: ${access.reason}`,
        });
      }
    }

    const channel = await ensureTeamChannel(project._id);

    const newThread = {
      _id: new mongoose.Types.ObjectId(),
      topic: topic.trim(),
      created_by: req.uid,
      linked_task_id: linked_task_id ? new mongoose.Types.ObjectId(linked_task_id) : null,
      messages: [],
      flagged_for_review: false,
      created_at: new Date(),
    };

    if (initial_message && typeof initial_message === "string" && initial_message.trim()) {
      newThread.messages.push({
        _id: new mongoose.Types.ObjectId(),
        author_id: req.uid,
        content: initial_message.trim(),
        created_at: new Date(),
      });
    }

    channel.threads.push(newThread);
    await channel.save();

    await AuditLog.record({
      actorId: req.uid,
      action: "CHANNEL_THREAD_CREATED",
      entityType: "TeamChannel",
      entityId: String(channel._id),
      after: {
        threadId: String(newThread._id),
        topic: newThread.topic,
        linked_task_id: newThread.linked_task_id ? String(newThread.linked_task_id) : null,
      },
    });

    res.status(201).json({
      success: true,
      message: "Thread created successfully.",
      thread: {
        id: String(newThread._id),
        _id: newThread._id,
        topic: newThread.topic,
        created_by: newThread.created_by,
        linked_task_id: newThread.linked_task_id,
        messages: newThread.messages,
        created_at: newThread.created_at,
      },
    });
  } catch (err) {
    console.error("POST /api/projects/:id/channel/threads error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/projects/:id/channel/threads/:threadId/messages ──────────────
// Post a message to an existing thread, guarded by canViewThread
router.post("/projects/:id/channel/threads/:threadId/messages", verifyToken, async (req, res) => {
  try {
    const { id, threadId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ success: false, error: "Message content cannot be empty." });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const channel = await ensureTeamChannel(project._id);
    const thread = channel.threads.id(threadId);
    if (!thread) {
      return res.status(404).json({ success: false, error: "Thread not found" });
    }

    const tasks = await Task.find({ project_id: id }).lean();
    const visibilityTier = resolveVisibilityTier(req.user, project);

    // Verify visibility access
    const access = canViewThread(req.user, thread, visibilityTier, tasks);
    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        error: `Access denied: ${access.reason}`,
      });
    }

    // Run dependency reference detection
    const taskTitles = tasks.map((t) => t.title);
    const depDetection = detectDependencyReference(content, taskTitles);

    const newMsg = {
      _id: new mongoose.Types.ObjectId(),
      author_id: req.uid,
      content: content.trim(),
      created_at: new Date(),
    };

    thread.messages.push(newMsg);
    await channel.save();

    // Fetch author details
    const author = await User.findById(req.uid, "full_name role_title photo_url").lean();

    res.status(201).json({
      success: true,
      message: {
        id: String(newMsg._id),
        _id: newMsg._id,
        author_id: newMsg.author_id,
        author_name: author?.full_name || "Team Member",
        author_role_title: author?.role_title || "Contributor",
        author_photo_url: author?.photo_url || "",
        content: newMsg.content,
        created_at: newMsg.created_at,
      },
      dependencyDetection: depDetection,
    });
  } catch (err) {
    console.error("POST /api/projects/:id/channel/threads/:threadId/messages error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/projects/:id/dm/:otherUserId ────────────────────────────────────
// Fetch or lazily initialize a 1-on-1 DirectMessage within project boundary
router.get("/projects/:id/dm/:otherUserId", verifyToken, async (req, res) => {
  try {
    const { id, otherUserId } = req.params;

    if (req.uid === otherUserId) {
      return res.status(400).json({ success: false, error: "Cannot initiate DM with yourself." });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const isMember =
      (project.member_ids || []).map(String).includes(req.uid) ||
      String(project.created_by) === req.uid ||
      req.userType === "product_lead" ||
      req.userType === "pm";

    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: "Access denied: You are not assigned to this project.",
      });
    }

    const otherUser = await User.findById(otherUserId, "full_name role_title photo_url").lean();
    if (!otherUser) {
      return res.status(404).json({ success: false, error: "Participant user not found." });
    }

    const otherIsMember =
      (project.member_ids || []).map(String).includes(otherUserId) ||
      String(project.created_by) === otherUserId;

    if (!otherIsMember) {
      return res.status(400).json({
        success: false,
        error: "Target user is not a member of this project.",
      });
    }

    const sortedIds = sortParticipantIds(req.uid, otherUserId);

    let dm = await DirectMessage.findOne({
      project_id: project._id,
      participant_ids: sortedIds,
    });

    if (!dm) {
      dm = await DirectMessage.create({
        project_id: project._id,
        participant_ids: sortedIds,
        messages: [],
      });
    }

    if (!canAccessDirectMessage(req.uid, dm)) {
      return res.status(403).json({ success: false, error: "Unauthorized access to DM." });
    }

    // Mark incoming unread messages as read
    let updatedRead = false;
    (dm.messages || []).forEach((m) => {
      if (String(m.author_id) === String(otherUserId) && !m.read_at) {
        m.read_at = new Date();
        updatedRead = true;
      }
    });

    if (updatedRead) {
      await dm.save();
    }

    // Enrich messages with author names
    const currentUser = await User.findById(req.uid, "full_name role_title photo_url").lean();
    const authorMap = new Map([
      [String(currentUser?._id), currentUser],
      [String(otherUser._id), otherUser],
    ]);

    const enrichedMessages = (dm.messages || []).map((m) => {
      const author = authorMap.get(String(m.author_id));
      return {
        id: String(m._id),
        _id: m._id,
        author_id: m.author_id,
        author_name: author?.full_name || "Team Member",
        author_role_title: author?.role_title || "Contributor",
        author_photo_url: author?.photo_url || "",
        content: m.content,
        created_at: m.created_at,
        read_at: m.read_at,
      };
    });

    res.json({
      success: true,
      dm: {
        id: String(dm._id),
        _id: dm._id,
        project_id: String(project._id),
        project_title: project.title,
        participant_ids: dm.participant_ids,
        other_user: {
          id: String(otherUser._id),
          full_name: otherUser.full_name,
          role_title: otherUser.role_title,
          photo_url: otherUser.photo_url || "",
        },
        messages: enrichedMessages,
      },
    });
  } catch (err) {
    console.error("GET /api/projects/:id/dm/:otherUserId error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/projects/:id/dm/:otherUserId/messages ──────────────────────────
// Post a 1-on-1 DM message
router.post("/projects/:id/dm/:otherUserId/messages", verifyToken, async (req, res) => {
  try {
    const { id, otherUserId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ success: false, error: "Message content cannot be empty." });
    }

    if (req.uid === otherUserId) {
      return res.status(400).json({ success: false, error: "Cannot message yourself." });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const isMember =
      (project.member_ids || []).map(String).includes(req.uid) ||
      String(project.created_by) === req.uid ||
      req.userType === "product_lead" ||
      req.userType === "pm";

    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: "Access denied: You are not assigned to this project.",
      });
    }

    const otherIsMember =
      (project.member_ids || []).map(String).includes(otherUserId) ||
      String(project.created_by) === otherUserId;

    if (!otherIsMember) {
      return res.status(400).json({
        success: false,
        error: "Target user is not a member of this project.",
      });
    }

    const sortedIds = sortParticipantIds(req.uid, otherUserId);

    let dm = await DirectMessage.findOne({
      project_id: project._id,
      participant_ids: sortedIds,
    });

    if (!dm) {
      dm = await DirectMessage.create({
        project_id: project._id,
        participant_ids: sortedIds,
        messages: [],
      });
    }

    if (!canAccessDirectMessage(req.uid, dm)) {
      return res.status(403).json({ success: false, error: "Unauthorized access to DM." });
    }

    const newMsg = {
      _id: new mongoose.Types.ObjectId(),
      author_id: req.uid,
      content: content.trim(),
      created_at: new Date(),
      read_at: null,
    };

    dm.messages.push(newMsg);
    await dm.save();

    const author = await User.findById(req.uid, "full_name role_title photo_url").lean();

    res.status(201).json({
      success: true,
      message: {
        id: String(newMsg._id),
        _id: newMsg._id,
        author_id: newMsg.author_id,
        author_name: author?.full_name || "Team Member",
        author_role_title: author?.role_title || "Contributor",
        author_photo_url: author?.photo_url || "",
        content: newMsg.content,
        created_at: newMsg.created_at,
        read_at: newMsg.read_at,
      },
    });
  } catch (err) {
    console.error("POST /api/projects/:id/dm/:otherUserId/messages error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = {
  router,
  ensureTeamChannel,
};
