const express = require("express");
const router = express.Router();
const SlippageEvent = require("../models/SlippageEvent");
const AuditLog = require("../models/AuditLog");
const {
  verifyToken,
  requireProductLead,
  requireLeadOrArchitect,
} = require("../middleware/auth");
const { runSlippageCheck } = require("../jobs/slippageChecker");

// ─── GET /api/slippage/escalations — Active unresolved escalations for PM Dashboard
router.get("/escalations", verifyToken, requireLeadOrArchitect, async (req, res) => {
  try {
    const events = await SlippageEvent.find({ resolved: false })
      .populate("project_id", "title priority status")
      .populate("task_id", "title estimate_hours logged_hours status")
      .populate("user_id", "full_name email role_title")
      .sort({ created_at: -1 })
      .lean();

    return res.json({ success: true, events });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/slippage/project/:projectId — Unresolved events for a project ───
router.get("/project/:projectId", verifyToken, requireLeadOrArchitect, async (req, res) => {
  try {
    const events = await SlippageEvent.find({
      project_id: req.params.projectId,
      resolved: false,
    })
      .populate("task_id", "title estimate_hours logged_hours status")
      .populate("user_id", "full_name email role_title")
      .sort({ created_at: -1 })
      .lean();

    return res.json({ success: true, events });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/slippage/employee/:userId — Employee's own or lead-viewed slippage
router.get("/employee/:userId", verifyToken, async (req, res) => {
  try {
    const isSelf = req.uid === req.params.userId;
    const isLeadOrArch = ["product_lead", "lead_architect"].includes(req.user_type);

    if (!isSelf && !isLeadOrArch) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: You may only view your own slippage history",
      });
    }

    const events = await SlippageEvent.find({ user_id: req.params.userId })
      .populate("project_id", "title priority")
      .populate("task_id", "title status")
      .populate("resolved_by", "full_name email")
      .sort({ created_at: -1 })
      .lean();

    return res.json({ success: true, events });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/slippage/:id/resolve — Product Lead resolves escalation ────────
router.post("/:id/resolve", verifyToken, requireProductLead, async (req, res) => {
  try {
    const { resolution_chosen } = req.body;
    if (!resolution_chosen) {
      return res.status(400).json({
        success: false,
        error: "resolution_chosen is required to resolve a slippage event",
      });
    }

    const slippageEvent = await SlippageEvent.findById(req.params.id);
    if (!slippageEvent) {
      return res.status(404).json({ success: false, error: "Slippage event not found" });
    }

    const beforeState = slippageEvent.toObject();

    slippageEvent.resolved = true;
    slippageEvent.resolved_by = req.uid;
    slippageEvent.resolution_chosen = resolution_chosen;
    slippageEvent.resolved_at = new Date();
    await slippageEvent.save();

    await AuditLog.record({
      actorId: req.uid,
      action: "SLIPPAGE_EVENT_RESOLVED",
      entityType: "SlippageEvent",
      entityId: slippageEvent._id.toString(),
      before: beforeState,
      after: slippageEvent.toObject(),
    });

    return res.json({
      success: true,
      message: `Slippage event marked as resolved via '${resolution_chosen}'`,
      slippageEvent,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/internal/run-slippage-check — Trigger check manually ───────────
// Exposes the check protected by an internal secret header (or Product Lead token)
router.post("/run-check", async (req, res) => {
  try {
    const secretHeader = req.headers["x-internal-secret"];
    const expectedSecret = process.env.INTERNAL_SECRET || "autonomous-pm-internal-secret";

    if (secretHeader !== expectedSecret) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized: Invalid or missing x-internal-secret header",
      });
    }

    const results = await runSlippageCheck();
    return res.json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
