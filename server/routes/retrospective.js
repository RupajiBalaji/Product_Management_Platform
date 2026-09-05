const express = require("express");
const router = express.Router();

const { Project, Task } = require("../models/models");
const Retrospective = require("../models/Retrospective");
const DynamicRole = require("../models/DynamicRole");
const SlippageEvent = require("../models/SlippageEvent");
const Submission = require("../models/Submission");
const ActionRequest = require("../models/ActionRequest");
const AuditLog = require("../models/AuditLog");

const {
  verifyToken,
  requireProductLead,
} = require("../middleware/auth");

const {
  calculateEstimationAccuracy,
  summarizeIncidents,
  calculateTeamPerformance,
} = require("../lib/retrospectiveCalculator");

const { generateLessonsLearned } = require("../lib/lessonsGenerator");

/**
 * Strips confidential financial numbers for non-Product Lead users
 */
function sanitizeRetrospectiveForNonLead(retroObj) {
  if (!retroObj || typeof retroObj !== "object") return retroObj;
  const clone = JSON.parse(JSON.stringify(retroObj));

  const stripConfidentialKeys = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("cost") ||
        lower.includes("budget") ||
        lower.includes("rate") ||
        lower.includes("hourly")
      ) {
        delete obj[key];
      } else if (typeof obj[key] === "object" && obj[key] !== null) {
        stripConfidentialKeys(obj[key]);
      }
    }
  };

  stripConfidentialKeys(clone);
  return clone;
}

// ─── POST /api/projects/:id/complete ──────────────────────────────────────────
// Product Lead only.
// Preconditions: All project tasks must be status === "completed".
// On success: Sets project.status = "completed", marks completed_at,
// generates and locks immutable Retrospective post-mortem, and logs AuditLog.
router.post("/:id/complete", verifyToken, requireProductLead, async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    // 1. Pre-flight check: All tasks must be completed
    const tasks = await Task.find({ project_id: id }).lean();
    const incompleteTasks = tasks.filter((t) => t.status !== "completed");

    if (incompleteTasks.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Cannot complete project: incomplete tasks remain",
        incompleteCount: incompleteTasks.length,
        incompleteTasks: incompleteTasks.map((t) => ({
          id: t._id,
          title: t.title,
          status: t.status,
          assignee_ids: t.assignee_ids,
        })),
      });
    }

    // 2. Fetch dependencies for retrospective calculations
    const [dynamicRoles, slippageEvents, submissions, actionRequests] =
      await Promise.all([
        DynamicRole.find().lean(),
        SlippageEvent.find({ project_id: id }).lean(),
        tasks.length > 0
          ? Submission.find({ task_id: { $in: tasks.map((t) => t._id) } }).lean()
          : [],
        ActionRequest.find({ project_id: id }).lean(),
      ]);

    // 3. Compute telemetry analytics
    const estimationAccuracy = calculateEstimationAccuracy(
      tasks,
      dynamicRoles,
      project.team_allocations || []
    );
    const incidentSummary = summarizeIncidents(
      slippageEvents,
      submissions,
      [],
      actionRequests
    );
    const teamPerformance = calculateTeamPerformance(
      submissions,
      actionRequests,
      tasks,
      slippageEvents
    );

    // 4. Synthesize AI Lessons Learned
    const lessonsLearned = await generateLessonsLearned(
      estimationAccuracy,
      incidentSummary,
      teamPerformance,
      { title: project.title, description: project.description }
    );

    // 5. Success Metrics processing
    // Merge project.success_metrics with optional actual values from req.body.metrics
    const rawMetrics = Array.isArray(req.body.metrics)
      ? req.body.metrics
      : Array.isArray(req.body.success_metrics)
      ? req.body.success_metrics
      : project.success_metrics || [];

    const formattedMetrics = rawMetrics.map((m) => {
      const desc = m.metricDescription || m.description || "Metric";
      const target = m.targetValue || m.target || "Target";
      const actual = m.actualValue !== undefined ? String(m.actualValue).trim() : "";

      let achieved = null;
      if (m.achieved !== undefined && m.achieved !== null && m.achieved !== "") {
        achieved = Boolean(m.achieved);
      } else if (actual.length === 0) {
        achieved = null; // null = not measurable from available data per spec
      }

      return {
        metricDescription: desc,
        targetValue: target,
        actualValue: actual,
        achieved,
      };
    });

    // 6. Update Project State
    const previousStatus = project.status;
    project.status = "completed";
    project.completed_at = new Date();
    await project.save();

    // 7. Save / Lock Immutable Retrospective
    let retro = await Retrospective.findOne({ project_id: id });
    if (!retro) {
      retro = new Retrospective({
        project_id: id,
        generated_at: new Date(),
        estimation_accuracy: estimationAccuracy,
        incident_summary: incidentSummary,
        success_metrics: formattedMetrics,
        lessons_learned: lessonsLearned,
        team_performance: teamPerformance,
        locked: true,
      });
      await retro.save();
    }

    // 8. Immutable Audit Trail
    await AuditLog.record({
      actorId: req.uid,
      action: "PROJECT_COMPLETED",
      entityType: "Project",
      entityId: project._id.toString(),
      before: { status: previousStatus },
      after: {
        status: "completed",
        completed_at: project.completed_at,
        retrospective_id: retro._id,
      },
    });

    const isProductLead = req.userType === "product_lead" || req.userType === "pm";
    const retroResponse = isProductLead
      ? retro.toObject()
      : sanitizeRetrospectiveForNonLead(retro.toObject());

    res.json({
      success: true,
      project,
      retrospective: retroResponse,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/projects/:id/retrospective ──────────────────────────────────────
// Any project member or lead can view the post-mortem retrospective.
// Respects Phase 8 cost-confidentiality for non-Product Lead roles.
router.get("/:id/retrospective", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const isProductLead = req.userType === "product_lead" || req.userType === "pm";
    const isMember =
      isProductLead ||
      req.userType === "lead_architect" ||
      project.created_by === req.uid ||
      (project.member_ids || []).includes(req.uid);

    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: "You are not a member of this project.",
      });
    }

    const retro = await Retrospective.findOne({ project_id: id }).lean();
    if (!retro) {
      return res.status(404).json({
        success: false,
        error: "Retrospective not found. Project may not be completed yet.",
      });
    }

    const responseRetro = isProductLead
      ? retro
      : sanitizeRetrospectiveForNonLead(retro);

    res.json({
      success: true,
      retrospective: responseRetro,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/projects/:id/success-metrics ──────────────────────────────────
// Product Lead can configure/update project success metrics before completion.
router.patch("/:id/success-metrics", verifyToken, requireProductLead, async (req, res) => {
  try {
    const { id } = req.params;
    const { metrics } = req.body;

    if (!Array.isArray(metrics)) {
      return res.status(400).json({
        success: false,
        error: "metrics must be an array of { description, target }",
      });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    if (project.status === "completed") {
      return res.status(409).json({
        success: false,
        error:
          "Success metrics are locked once the project is completed and the retrospective has been generated. This data is now part of the permanent retrospective record.",
      });
    }

    project.success_metrics = metrics.map((m) => ({
      description: String(m.description || "").trim(),
      target: String(m.target || "").trim(),
    })).filter((m) => m.description.length > 0);

    await project.save();

    res.json({
      success: true,
      success_metrics: project.success_metrics,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
