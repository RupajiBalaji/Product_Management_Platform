const express = require("express");
const router = express.Router();
const { Task, Project } = require("../models/models");
const ActionRequest = require("../models/ActionRequest");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");
const {
  verifyToken,
  requireProductLead,
  requireLeadOrArchitect,
} = require("../middleware/auth");
const {
  evaluateReorder,
  evaluateSwapWithinWeek,
  evaluatePostpone,
} = require("../lib/actionModeRules");
const { generateWithRotatingModels } = require("./ai");

// Helper: Calculate Monday-to-Sunday weekly bounds containing a date
function getWeekBoundsForDate(inputDate) {
  const curr = new Date(inputDate || Date.now());
  const day = curr.getDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = curr.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(curr);
  monday.setDate(diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

// ─── POST /api/actions/reorder ────────────────────────────────────────────────
router.post("/reorder", verifyToken, async (req, res) => {
  try {
    const { task_id, new_position } = req.body;
    if (!task_id || new_position === undefined) {
      return res.status(400).json({
        success: false,
        error: "task_id and new_position (0-indexed integer) are required",
      });
    }

    const task = await Task.findById(task_id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    // Ownership guard: only assigned contributor or lead/architect can reorder
    const isOwner = (task.assignee_ids || []).includes(req.uid);
    const isLeadOrArch = ["product_lead", "lead_architect"].includes(req.user_type);
    if (!isOwner && !isLeadOrArch) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: You may only reorder tasks assigned to you",
      });
    }

    // Fetch all project tasks ordered by order_index and created_at
    const allProjectTasks = await Task.find({ project_id: task.project_id })
      .sort({ order_index: 1, created_at: 1 })
      .lean();

    const evalResult = evaluateReorder(task._id.toString(), Number(new_position), allProjectTasks);

    if (evalResult.approved) {
      // Reorder tasks in database
      const proposed = [...allProjectTasks];
      const curIdx = proposed.findIndex((t) => t._id.toString() === task._id.toString());
      if (curIdx !== -1) {
        const [moved] = proposed.splice(curIdx, 1);
        proposed.splice(Number(new_position), 0, moved);
        await Promise.all(
          proposed.map((t, idx) => Task.findByIdAndUpdate(t._id, { order_index: idx }))
        );
      }

      const actionRequest = await ActionRequest.create({
        employee_id: req.uid,
        task_id: task._id,
        project_id: task.project_id,
        action_type: "reorder",
        status: "auto_approved",
        payload: { new_position: Number(new_position), previous_position: curIdx },
        decision_reasoning: evalResult.reason,
        resolved_at: new Date(),
      });

      return res.json({
        success: true,
        message: evalResult.reason,
        actionRequest,
      });
    } else {
      const actionRequest = await ActionRequest.create({
        employee_id: req.uid,
        task_id: task._id,
        project_id: task.project_id,
        action_type: "reorder",
        status: "blocked",
        payload: { new_position: Number(new_position) },
        decision_reasoning: evalResult.reason,
        resolved_at: new Date(),
      });

      return res.status(409).json({
        success: false,
        error: evalResult.reason,
        actionRequest,
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/actions/swap ───────────────────────────────────────────────────
router.post("/swap", verifyToken, async (req, res) => {
  try {
    const { task_id, target_date } = req.body;
    if (!task_id || !target_date) {
      return res.status(400).json({
        success: false,
        error: "task_id and target_date (YYYY-MM-DD) are required",
      });
    }

    const task = await Task.findById(task_id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const isOwner = (task.assignee_ids || []).includes(req.uid);
    const isLeadOrArch = ["product_lead", "lead_architect"].includes(req.user_type);
    if (!isOwner && !isLeadOrArch) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: You may only swap tasks assigned to you",
      });
    }

    const weekBounds = getWeekBoundsForDate(task.start_date || Date.now());

    // Fetch employee's tasks in this week to calculate workload
    const weekTasks = await Task.find({
      assignee_ids: req.uid,
      start_date: { $gte: weekBounds.start, $lte: weekBounds.end },
      status: "active",
    }).lean();

    const currentWeeklyHours = weekTasks.reduce((acc, t) => acc + (t.estimate_hours || 8), 0);
    const taskHours = task.estimate_hours || 8;

    const evalResult = evaluateSwapWithinWeek(
      { currentWeeklyHours, weeklyCapHours: 40, alreadyContainsTask: true },
      taskHours,
      target_date,
      weekBounds
    );

    if (evalResult.approved) {
      task.start_date = target_date;
      task.end_date = target_date;
      await task.save();

      const actionRequest = await ActionRequest.create({
        employee_id: req.uid,
        task_id: task._id,
        project_id: task.project_id,
        action_type: "swap_within_week",
        status: "auto_approved",
        payload: { target_date, projected_weekly_hours: evalResult.projectedWeeklyHours },
        decision_reasoning: evalResult.reason,
        resolved_at: new Date(),
      });

      return res.json({
        success: true,
        message: evalResult.reason,
        actionRequest,
        task,
      });
    } else {
      const actionRequest = await ActionRequest.create({
        employee_id: req.uid,
        task_id: task._id,
        project_id: task.project_id,
        action_type: "swap_within_week",
        status: "blocked",
        payload: { target_date, projected_weekly_hours: evalResult.projectedWeeklyHours },
        decision_reasoning: evalResult.reason,
        resolved_at: new Date(),
      });

      return res.status(409).json({
        success: false,
        error: evalResult.reason,
        actionRequest,
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/actions/postpone ───────────────────────────────────────────────
router.post("/postpone", verifyToken, async (req, res) => {
  try {
    const { task_id } = req.body;
    if (!task_id) {
      return res.status(400).json({ success: false, error: "task_id is required" });
    }

    const task = await Task.findById(task_id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const evalResult = evaluatePostpone();

    // Always records the attempt as blocked in an ActionRequest for governance auditing
    const actionRequest = await ActionRequest.create({
      employee_id: req.uid,
      task_id: task._id,
      project_id: task.project_id,
      action_type: "postpone",
      status: "blocked",
      payload: req.body,
      decision_reasoning: evalResult.reason,
      resolved_at: new Date(),
    });

    return res.status(403).json({
      success: false,
      error: evalResult.reason,
      actionRequest,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/actions/request-clarification ─────────────────────────────────
router.post("/request-clarification", verifyToken, async (req, res) => {
  try {
    const { task_id, question } = req.body;
    if (!task_id || !question || !question.trim()) {
      return res.status(400).json({
        success: false,
        error: "task_id and a non-empty question are required",
      });
    }

    const task = await Task.findById(task_id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const isOwner = (task.assignee_ids || []).includes(req.uid);
    const isLeadOrArch = ["product_lead", "lead_architect"].includes(req.user_type);
    if (!isOwner && !isLeadOrArch) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: You may only request clarification on tasks assigned to you",
      });
    }

    // Freeze slippage immediately on task while clarification is pending
    task.slippage_frozen = true;
    await task.save();

    const actionRequest = new ActionRequest({
      employee_id: req.uid,
      task_id: task._id,
      project_id: task.project_id,
      action_type: "request_clarification",
      status: "pending_clarification",
      clarification_question: question.trim(),
      slippage_frozen: true,
    });

    // Attempt automatic AI answering from the task description/PRD
    let autoAnswered = false;
    let aiAnswer = "";

    try {
      const prompt = `You are a Project Management Specification Analyst for software deliverables.
Task Title: "${task.title}"
Task Description / Acceptance Criteria:
"""
${task.description || "No description provided."}
"""

A developer asked the following clarification question about this task:
"${question.trim()}"

INSTRUCTIONS:
1. Search the Task Description / Acceptance Criteria text above.
2. If the text clearly and unambiguously answers the question, write a direct, concise 1-3 sentence answer explaining it.
3. If the answer is NOT clearly present in the text above, respond with EXACTLY: NOT_FOUND`;

      const rawResponse = await generateWithRotatingModels(prompt);
      const cleaned = (rawResponse || "").trim();

      if (cleaned && !cleaned.startsWith("NOT_FOUND") && !cleaned.toUpperCase().includes("NOT_FOUND")) {
        autoAnswered = true;
        aiAnswer = cleaned;
      }
    } catch (aiErr) {
      console.warn("⚠️ [Clarification AI] Automatic answering fallback:", aiErr.message);
    }

    if (autoAnswered && aiAnswer) {
      actionRequest.status = "answered";
      actionRequest.clarification_answer = aiAnswer;
      actionRequest.answered_by = null; // System AI answered
      actionRequest.slippage_frozen = false;
      actionRequest.resolved_at = new Date();
      actionRequest.decision_reasoning = "Answered automatically by AI from PRD specification.";
      await actionRequest.save();

      // Append answer to task clarifications and unfreeze slippage
      task.clarifications.push({
        question: question.trim(),
        answer: aiAnswer,
        answered_by: "system",
        answered_at: new Date(),
      });
      task.slippage_frozen = false;
      await task.save();

      return res.json({
        success: true,
        auto_answered: true,
        answer: aiAnswer,
        actionRequest,
        task,
      });
    } else {
      // Left pending for Product Lead escalation
      actionRequest.decision_reasoning = "AI could not find answer in PRD. Escalated to Product Lead; slippage clock paused.";
      await actionRequest.save();

      // Dispatch notification to Product Lead
      const project = await Project.findById(task.project_id);
      const recipientId = project?.created_by || "product_lead";
      await Notification.create({
        recipient_id: recipientId,
        title: `Clarification Needed: ${task.title}`,
        message: `Contributor ${req.uid} asked: "${question.trim()}". Slippage is frozen until answered.`,
        type: "system",
        entity_id: actionRequest._id,
        entity_type: "ActionRequest",
      });

      return res.json({
        success: true,
        auto_answered: false,
        message: "Question submitted. Answer not found in PRD; escalated to Product Lead with slippage paused.",
        actionRequest,
        task,
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/actions/clarifications/pending ─────────────────────────────────
router.get("/clarifications/pending", verifyToken, requireLeadOrArchitect, async (req, res) => {
  try {
    const requests = await ActionRequest.find({
      action_type: "request_clarification",
      status: "pending_clarification",
    })
      .populate("task_id", "title description start_date end_date estimate_hours status")
      .populate("project_id", "title priority")
      .populate("employee_id", "full_name email role_title")
      .sort({ created_at: 1 })
      .lean();

    return res.json({ success: true, requests });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/actions/clarifications/:id/answer ─────────────────────────────
router.post("/clarifications/:id/answer", verifyToken, requireLeadOrArchitect, async (req, res) => {
  try {
    const { answer } = req.body;
    if (!answer || !answer.trim()) {
      return res.status(400).json({ success: false, error: "answer is required" });
    }

    const actionRequest = await ActionRequest.findById(req.params.id);
    if (!actionRequest) {
      return res.status(404).json({ success: false, error: "ActionRequest not found" });
    }

    const beforeState = actionRequest.toObject();

    actionRequest.status = "answered";
    actionRequest.clarification_answer = answer.trim();
    actionRequest.answered_by = req.uid;
    actionRequest.slippage_frozen = false;
    actionRequest.resolved_at = new Date();
    await actionRequest.save();

    // Append answer to Task and unfreeze task slippage
    const task = await Task.findById(actionRequest.task_id);
    if (task) {
      task.clarifications.push({
        question: actionRequest.clarification_question,
        answer: answer.trim(),
        answered_by: req.uid,
        answered_at: new Date(),
      });
      task.slippage_frozen = false;
      await task.save();
    }

    // Record immutable audit log
    await AuditLog.record({
      actorId: req.uid,
      action: "CLARIFICATION_ANSWERED",
      entityType: "ActionRequest",
      entityId: actionRequest._id.toString(),
      before: beforeState,
      after: actionRequest.toObject(),
    });

    return res.json({
      success: true,
      message: "Clarification answered and appended to task successfully.",
      actionRequest,
      task,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/actions/history/:taskId ─────────────────────────────────────────
router.get("/history/:taskId", verifyToken, async (req, res) => {
  try {
    const history = await ActionRequest.find({ task_id: req.params.taskId })
      .populate("employee_id", "full_name email")
      .populate("answered_by", "full_name email")
      .sort({ created_at: -1 })
      .lean();

    return res.json({ success: true, history });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
