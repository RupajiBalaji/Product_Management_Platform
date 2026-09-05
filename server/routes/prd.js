const express = require("express");
const router = express.Router();

const { Project } = require("../models/models");
const PRD = require("../models/PRD");
const CreationThread = require("../models/CreationThread");
const AuditLog = require("../models/AuditLog");

const {
  verifyToken,
  requireProductLead,
} = require("../middleware/auth");

const { generatePRDSynthesis } = require("../lib/prdGenerator");
const { computeFieldDiff, nextVersion } = require("../lib/changeRollback");

const getUserId = (req) =>
  String(req.uid || req.user?._id || req.user?.id || req.user?.uid || "system");

// ─── POST /api/projects/:id/prd/generate ──────────────────────────────────────
// Product Lead only.
// Generates PRD v1.0 draft using project intent and Phase 9 creation deliberation chat.
router.post("/projects/:id/prd/generate", verifyToken, requireProductLead, async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    // Check if an approved PRD already exists
    const existingApproved = await PRD.findOne({ project_id: id, status: "approved" }).lean();
    if (existingApproved) {
      return res.status(409).json({
        success: false,
        error: "An approved PRD already exists for this project. To modify it, update via PATCH to trigger a version bump.",
        currentVersion: existingApproved.version,
      });
    }

    // Fetch Phase 9 creation deliberation messages if any
    const creationThread = await CreationThread.findOne({ project_id: id }).lean();
    const creationMessages = creationThread?.messages || [];

    // Optional injectable AI client for tests
    const aiClient = req.aiClient;

    const synthesized = await generatePRDSynthesis(
      {
        title: project.title,
        description: project.description,
        executive_intent: project.executive_intent || project.description,
        priority: project.priority,
      },
      creationMessages,
      aiClient
    );

    // Build team composition from current project team_allocations
    const teamComposition = (project.team_allocations || []).map((alloc) => ({
      userId: alloc.user_id,
      roleId: alloc.role_id,
    }));

    const userId = String(req.uid || req.user?._id || req.user?.id || req.user?.uid || "system");

    // Check if a draft v1.0 already exists; update it or create new
    let prd = await PRD.findOne({ project_id: id, version: "1.0", status: "draft" });
    if (prd) {
      prd.executive_summary = synthesized.executive_summary;
      prd.scope_in = synthesized.scope_in;
      prd.scope_out = synthesized.scope_out;
      prd.user_stories = synthesized.user_stories;
      prd.technical_architecture = synthesized.technical_architecture;
      prd.team_composition = teamComposition;
      prd.created_by = userId;
      await prd.save();
    } else {
      prd = new PRD({
        project_id: id,
        version: "1.0",
        executive_summary: synthesized.executive_summary,
        scope_in: synthesized.scope_in,
        scope_out: synthesized.scope_out,
        user_stories: synthesized.user_stories,
        technical_architecture: synthesized.technical_architecture,
        team_composition: teamComposition,
        status: "draft",
        created_by: userId,
      });
      await prd.save();
    }

    await AuditLog.record({
      actorId: userId,
      action: "PRD_GENERATED",
      entityType: "PRD",
      entityId: prd._id.toString(),
      projectId: id,
      after: { version: prd.version, status: prd.status },
    });

    res.status(201).json({
      success: true,
      prd,
    });
  } catch (err) {
    console.error("PRD generate error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/projects/:id/prd/approve ────────────────────────────────────────
// Product Lead only.
// Approves the latest draft PRD, superseding any prior approved PRDs.
router.post("/projects/:id/prd/approve", verifyToken, requireProductLead, async (req, res) => {
  try {
    const { id } = req.params;
    const { prdId } = req.body;

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    // Locate target PRD
    const targetQuery = prdId
      ? { _id: prdId, project_id: id }
      : { project_id: id, status: "draft" };

    const targetPRD = await PRD.findOne(targetQuery).sort({ createdAt: -1 });
    if (!targetPRD) {
      return res.status(404).json({ success: false, error: "No draft PRD found to approve" });
    }

    const userId = getUserId(req);

    // Supersede any previously approved PRDs
    const priorApproved = await PRD.find({
      project_id: id,
      status: "approved",
      _id: { $ne: targetPRD._id },
    });

    for (const prior of priorApproved) {
      prior.status = "superseded";
      prior.superseded_by = targetPRD._id;
      await prior.save();
    }

    targetPRD.status = "approved";
    await targetPRD.save();

    await AuditLog.record({
      actorId: userId,
      action: "PRD_APPROVED",
      entityType: "PRD",
      entityId: targetPRD._id.toString(),
      projectId: id,
      after: { version: targetPRD.version, status: "approved" },
    });

    res.json({
      success: true,
      prd: targetPRD,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/prd/:id ───────────────────────────────────────────────────────
// Product Lead only.
// If status is "draft", updates in place.
// If status is "approved", creates a NEW bumped version (e.g. 1.0 -> 1.1),
// marks old as superseded, computes field diff, and marks new as approved.
router.patch("/prd/:id", verifyToken, requireProductLead, async (req, res) => {
  try {
    const { id } = req.params;
    const existingPrd = await PRD.findById(id);
    if (!existingPrd) {
      return res.status(404).json({ success: false, error: "PRD not found" });
    }

    const userId = getUserId(req);

    const {
      executive_summary,
      scope_in,
      scope_out,
      user_stories,
      technical_architecture,
      team_composition,
      isMajorVersion,
    } = req.body;

    const payload = {
      executive_summary: executive_summary !== undefined ? executive_summary : existingPrd.executive_summary,
      scope_in: Array.isArray(scope_in) ? scope_in : existingPrd.scope_in,
      scope_out: Array.isArray(scope_out) ? scope_out : existingPrd.scope_out,
      user_stories: Array.isArray(user_stories) ? user_stories : existingPrd.user_stories,
      technical_architecture: technical_architecture !== undefined ? technical_architecture : existingPrd.technical_architecture,
      team_composition: Array.isArray(team_composition) ? team_composition : existingPrd.team_composition,
    };

    if (existingPrd.status === "draft") {
      // Draft mode: update in place
      Object.assign(existingPrd, payload);
      await existingPrd.save();

      await AuditLog.record({
        actorId: userId,
        action: "PRD_DRAFT_UPDATED",
        entityType: "PRD",
        entityId: existingPrd._id.toString(),
        projectId: existingPrd.project_id.toString(),
        after: { version: existingPrd.version },
      });

      return res.json({
        success: true,
        prd: existingPrd,
        versionBumped: false,
      });
    }

    // Approved mode: NEVER mutate in place! Create bumped version and supersede old
    const newVer = nextVersion(existingPrd.version, Boolean(isMajorVersion));
    const diffs = computeFieldDiff(existingPrd.toObject(), payload);

    const newPrd = new PRD({
      project_id: existingPrd.project_id,
      version: newVer,
      executive_summary: payload.executive_summary,
      scope_in: payload.scope_in,
      scope_out: payload.scope_out,
      user_stories: payload.user_stories,
      technical_architecture: payload.technical_architecture,
      team_composition: payload.team_composition,
      status: "approved",
      superseded_by: null,
      diff_summary: diffs,
      created_by: userId,
    });
    await newPrd.save();

    // Mark previous as superseded
    existingPrd.status = "superseded";
    existingPrd.superseded_by = newPrd._id;
    await existingPrd.save();

    await AuditLog.record({
      actorId: userId,
      action: "PRD_VERSION_BUMPED",
      entityType: "PRD",
      entityId: newPrd._id.toString(),
      projectId: existingPrd.project_id.toString(),
      before: { version: existingPrd.version },
      after: { version: newPrd.version, diffCount: diffs.length },
    });

    res.json({
      success: true,
      prd: newPrd,
      versionBumped: true,
      previousVersion: existingPrd.version,
      diffs,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/projects/:id/prd/versions ───────────────────────────────────────
// List all PRD versions for a project
router.get("/projects/:id/prd/versions", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const versions = await PRD.find({ project_id: id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      versions,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/prd/:id ─────────────────────────────────────────────────────────
// Fetch single PRD version in full
router.get("/prd/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const prd = await PRD.findById(id).lean();
    if (!prd) {
      return res.status(404).json({ success: false, error: "PRD not found" });
    }

    res.json({
      success: true,
      prd,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
