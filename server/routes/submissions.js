const express = require("express");
const router = express.Router();
const Submission = require("../models/Submission");
const { Task, Project } = require("../models/models");
const DynamicRole = require("../models/DynamicRole");
const AuditLog = require("../models/AuditLog");
const { verifyToken, requireLeadOrArchitect } = require("../middleware/auth");
const { evaluateSubmission } = require("../lib/qaEvaluator");

// ─── POST /api/submissions — Employee submits deliverable ────────────────────
router.post("/", verifyToken, async (req, res) => {
  try {
    const { task_id, artifact_url, artifact_type } = req.body;

    if (!task_id) {
      return res.status(400).json({ success: false, error: "task_id is required" });
    }
    if (!artifact_url || !artifact_url.trim()) {
      return res.status(400).json({ success: false, error: "artifact_url is required" });
    }

    const task = await Task.findById(task_id).populate("project_id");
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    // Determine evaluation mode from assignee's DynamicRole on the project
    let evaluationMode = "objective";
    const project = task.project_id;
    if (project && project.team_allocations) {
      const alloc = project.team_allocations.find((a) => String(a.user_id) === String(req.uid));
      if (alloc && alloc.role_id) {
        const role = await DynamicRole.findById(alloc.role_id).lean();
        if (role?.evaluationMode) {
          evaluationMode = role.evaluationMode;
        }
      }
    }

    const submission = new Submission({
      task_id,
      employee_id: req.uid,
      artifact_url: artifact_url.trim(),
      artifact_type: artifact_type || "pr_link",
      status: "pending_review",
      evaluation_mode: evaluationMode,
    });

    await submission.save();

    // Trigger evaluation asynchronously without blocking the 202 response
    setImmediate(async () => {
      try {
        await evaluateSubmission(submission, task);
      } catch (evalErr) {
        console.error("Async evaluation error:", evalErr);
      }
    });

    return res.status(202).json({
      success: true,
      submissionId: submission._id,
      status: "pending_review",
      evaluation_mode: evaluationMode,
      message: "Submission received. Definition-of-Done evaluation queued.",
    });
  } catch (err) {
    console.error("Error creating submission:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/submissions/pending-review — Review queue for leads ────────────
router.get("/pending-review", verifyToken, requireLeadOrArchitect, async (req, res) => {
  try {
    const submissions = await Submission.find({ status: "pending_review" })
      .populate({
        path: "task_id",
        populate: { path: "project_id", select: "title priority" },
      })
      .populate("employee_id", "full_name email role_title")
      .sort({ created_at: -1 })
      .lean();

    return res.json({ success: true, submissions });
  } catch (err) {
    console.error("Error fetching pending reviews:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/submissions/task/:taskId — All submissions for a task ──────────
router.get("/task/:taskId", verifyToken, async (req, res) => {
  try {
    const submissions = await Submission.find({ task_id: req.params.taskId })
      .populate("employee_id", "full_name email role_title")
      .populate("reviewed_by", "full_name email")
      .sort({ created_at: -1 })
      .lean();

    return res.json({ success: true, submissions });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/submissions/:id — Fetch single submission with verdict ─────────
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate({
        path: "task_id",
        populate: { path: "project_id", select: "title priority" },
      })
      .populate("employee_id", "full_name email role_title")
      .populate("reviewed_by", "full_name email")
      .lean();

    if (!submission) {
      return res.status(404).json({ success: false, error: "Submission not found" });
    }

    return res.json({ success: true, submission });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/submissions/:id/human-review — Lead sign-off for subjective/fallback ─
router.post("/:id/human-review", verifyToken, requireLeadOrArchitect, async (req, res) => {
  try {
    const { decision, notes } = req.body;

    if (!decision || !["approved", "rejected"].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: "Decision must be either 'approved' or 'rejected'",
      });
    }

    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ success: false, error: "Submission not found" });
    }

    const beforeState = submission.toObject();

    submission.status = decision;
    submission.reviewed_by = req.uid;
    submission.reviewed_at = new Date();

    if (decision === "rejected") {
      submission.rejection_count = (submission.rejection_count || 0) + 1;
      if (notes) {
        submission.ai_verdict = {
          passed: false,
          missing_items: [notes],
          reasoning: notes,
        };
      }
    } else if (decision === "approved") {
      submission.ai_verdict = {
        passed: true,
        missing_items: [],
        reasoning: notes || "Approved by reviewer sign-off.",
      };

      // Mark linked task as completed
      await Task.findByIdAndUpdate(submission.task_id, { status: "completed" });
    }

    await submission.save();

    // Audit Log recording
    await AuditLog.record({
      actorId: req.uid,
      action: "SUBMISSION_HUMAN_REVIEW",
      entityType: "Submission",
      entityId: submission._id.toString(),
      before: beforeState,
      after: submission.toObject(),
    });

    return res.json({
      success: true,
      message: `Submission marked as ${decision}`,
      submission,
    });
  } catch (err) {
    console.error("Error updating human review:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
