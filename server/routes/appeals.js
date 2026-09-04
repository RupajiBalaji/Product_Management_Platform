const express = require("express");
const router = express.Router();
const Appeal = require("../models/Appeal");
const Submission = require("../models/Submission");
const { Task } = require("../models/models");
const AuditLog = require("../models/AuditLog");
const { verifyToken, requireLeadOrArchitect } = require("../middleware/auth");

// ─── POST /api/appeals — Employee creates appeal for rejected submission ─────
router.post("/", verifyToken, async (req, res) => {
  try {
    const { submission_id, justification } = req.body;

    if (!submission_id) {
      return res.status(400).json({ success: false, error: "submission_id is required" });
    }
    if (!justification || !justification.trim()) {
      return res.status(400).json({ success: false, error: "justification is required" });
    }

    const submission = await Submission.findById(submission_id);
    if (!submission) {
      return res.status(404).json({ success: false, error: "Submission not found" });
    }

    // Ownership check: must own the submission
    if (String(submission.employee_id) !== String(req.uid)) {
      return res.status(403).json({
        success: false,
        error: "You can only submit an appeal for your own submission",
      });
    }

    // Status check: must be in rejected status
    if (submission.status !== "rejected") {
      return res.status(400).json({
        success: false,
        error: "Appeals can only be submitted for rejected submissions",
      });
    }

    // Check for existing pending appeal
    const existingPending = await Appeal.findOne({ submission_id, status: "pending" });
    if (existingPending) {
      return res.status(409).json({
        success: false,
        error: "An appeal is already pending review for this submission",
      });
    }

    const appeal = new Appeal({
      submission_id,
      employee_id: req.uid,
      justification: justification.trim(),
      status: "pending",
    });

    await appeal.save();

    return res.status(201).json({
      success: true,
      message: "Appeal submitted successfully and queued for architectural review",
      appeal,
    });
  } catch (err) {
    console.error("Error creating appeal:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/appeals/pending — Review queue for product_lead / lead_architect ─
router.get("/pending", verifyToken, requireLeadOrArchitect, async (req, res) => {
  try {
    const appeals = await Appeal.find({ status: "pending" })
      .populate({
        path: "submission_id",
        populate: {
          path: "task_id",
          populate: { path: "project_id", select: "title priority" },
        },
      })
      .populate("employee_id", "full_name email role_title")
      .sort({ created_at: -1 })
      .lean();

    return res.json({ success: true, appeals });
  } catch (err) {
    console.error("Error fetching pending appeals:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/appeals/:id — Side-by-side review payload ────────────────────────
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const appeal = await Appeal.findById(req.params.id)
      .populate({
        path: "submission_id",
        populate: {
          path: "task_id",
          populate: { path: "project_id", select: "title priority" },
        },
      })
      .populate("employee_id", "full_name email role_title")
      .populate("reviewer_id", "full_name email")
      .lean();

    if (!appeal) {
      return res.status(404).json({ success: false, error: "Appeal not found" });
    }

    return res.json({ success: true, appeal });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/appeals/:id/resolve — Reviewer overrides or upholds rejection ───
router.post("/:id/resolve", verifyToken, requireLeadOrArchitect, async (req, res) => {
  try {
    const { decision, notes } = req.body;

    if (!decision || !["overridden", "upheld"].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: "Decision must be either 'overridden' or 'upheld'",
      });
    }

    const appeal = await Appeal.findById(req.params.id);
    if (!appeal) {
      return res.status(404).json({ success: false, error: "Appeal not found" });
    }

    const beforeAppealState = appeal.toObject();

    appeal.status = decision;
    appeal.reviewer_id = req.uid;
    appeal.reviewer_notes = (notes || "").trim();
    appeal.resolved_at = new Date();
    await appeal.save();

    // If overridden, flip linked Submission to approved
    let linkedSubmission = null;
    if (decision === "overridden") {
      linkedSubmission = await Submission.findById(appeal.submission_id);
      if (linkedSubmission) {
        const beforeSubState = linkedSubmission.toObject();
        linkedSubmission.status = "approved";
        linkedSubmission.reviewed_by = req.uid;
        linkedSubmission.reviewed_at = new Date();
        linkedSubmission.ai_verdict = {
          passed: true,
          missing_items: [],
          reasoning: `Rejection overridden by reviewer. Justification accepted: "${notes || appeal.justification}"`,
        };
        await linkedSubmission.save();

        // Also mark task as completed
        await Task.findByIdAndUpdate(linkedSubmission.task_id, { status: "completed" });
      }
    }

    // Audit Log recording
    await AuditLog.record({
      actorId: req.uid,
      action: "APPEAL_RESOLVED",
      entityType: "Appeal",
      entityId: appeal._id.toString(),
      before: beforeAppealState,
      after: {
        appeal: appeal.toObject(),
        submissionStatus: linkedSubmission ? linkedSubmission.status : "unchanged",
      },
    });

    return res.json({
      success: true,
      message: `Appeal marked as ${decision}`,
      appeal,
      submission: linkedSubmission,
    });
  } catch (err) {
    console.error("Error resolving appeal:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
