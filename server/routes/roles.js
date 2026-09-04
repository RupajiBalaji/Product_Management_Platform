const express = require("express");
const router = express.Router();
const DynamicRole = require("../models/DynamicRole");
const AuditLog = require("../models/AuditLog");
const { verifyToken, requireProductLead } = require("../middleware/auth");

// ─── GET /api/roles — List all dynamic roles ──────────────────────────────────
router.get("/", verifyToken, async (req, res) => {
  try {
    const roles = await DynamicRole.find().sort({ domain: 1, title: 1 }).lean();
    return res.json({ success: true, roles });
  } catch (err) {
    console.error("Error fetching dynamic roles:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/roles/:id — Get a single dynamic role ───────────────────────────
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const role = await DynamicRole.findById(req.params.id).lean();
    if (!role) {
      return res.status(404).json({ success: false, error: "Role not found" });
    }
    return res.json({ success: true, role });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/roles — Create new role (Product Lead only) ────────────────────
router.post("/", verifyToken, requireProductLead, async (req, res) => {
  try {
    const { title, domain, description, skillTags, defaultDailyCapHours, orgScoped, evaluationMode } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: "Role title is required" });
    }
    if (!domain || !domain.trim()) {
      return res.status(400).json({ success: false, error: "Domain is required" });
    }

    const existing = await DynamicRole.findOne({ title: title.trim() });
    if (existing) {
      return res.status(409).json({ success: false, error: "A role with this title already exists" });
    }

    const parsedSkills = Array.isArray(skillTags)
      ? skillTags.map((s) => String(s).trim()).filter(Boolean)
      : typeof skillTags === "string"
      ? skillTags.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const role = new DynamicRole({
      title: title.trim(),
      domain: domain.trim(),
      description: (description || "").trim(),
      skillTags: parsedSkills,
      defaultDailyCapHours: Number(defaultDailyCapHours) || 8,
      createdBy: req.uid,
      orgScoped: orgScoped !== undefined ? Boolean(orgScoped) : true,
      evaluationMode: evaluationMode === "subjective" ? "subjective" : "objective",
    });

    await role.save();

    // Audit Log recording (Sensitive Collection)
    await AuditLog.record({
      actorId: req.uid,
      action: "DYNAMIC_ROLE_CREATED",
      entityType: "DynamicRole",
      entityId: role._id.toString(),
      before: null,
      after: role.toObject(),
    });

    return res.status(201).json({
      success: true,
      message: "Dynamic role created successfully",
      role,
    });
  } catch (err) {
    console.error("Error creating dynamic role:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/roles/:id — Update existing role (Product Lead only) ────────────
router.put("/:id", verifyToken, requireProductLead, async (req, res) => {
  try {
    const role = await DynamicRole.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ success: false, error: "Role not found" });
    }

    const beforeState = role.toObject();
    const { title, domain, description, skillTags, defaultDailyCapHours, orgScoped, evaluationMode } = req.body;

    if (title && title.trim() !== role.title) {
      const duplicate = await DynamicRole.findOne({ title: title.trim(), _id: { $ne: role._id } });
      if (duplicate) {
        return res.status(409).json({ success: false, error: "Another role with this title already exists" });
      }
      role.title = title.trim();
    }

    if (domain) role.domain = domain.trim();
    if (description !== undefined) role.description = description.trim();
    if (defaultDailyCapHours !== undefined) {
      role.defaultDailyCapHours = Math.max(1, Math.min(24, Number(defaultDailyCapHours) || 8));
    }
    if (orgScoped !== undefined) role.orgScoped = Boolean(orgScoped);
    if (evaluationMode && ["objective", "subjective"].includes(evaluationMode)) {
      role.evaluationMode = evaluationMode;
    }

    if (skillTags !== undefined) {
      role.skillTags = Array.isArray(skillTags)
        ? skillTags.map((s) => String(s).trim()).filter(Boolean)
        : typeof skillTags === "string"
        ? skillTags.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    }

    await role.save();

    // Audit Log recording (Sensitive Collection)
    await AuditLog.record({
      actorId: req.uid,
      action: "DYNAMIC_ROLE_UPDATED",
      entityType: "DynamicRole",
      entityId: role._id.toString(),
      before: beforeState,
      after: role.toObject(),
    });

    return res.json({
      success: true,
      message: "Dynamic role updated successfully",
      role,
    });
  } catch (err) {
    console.error("Error updating dynamic role:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/roles/:id — Delete role (Product Lead only) ──────────────────
router.delete("/:id", verifyToken, requireProductLead, async (req, res) => {
  try {
    const role = await DynamicRole.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ success: false, error: "Role not found" });
    }

    const beforeState = role.toObject();
    await DynamicRole.findByIdAndDelete(req.params.id);

    // Audit Log recording (Sensitive Collection)
    await AuditLog.record({
      actorId: req.uid,
      action: "DYNAMIC_ROLE_DELETED",
      entityType: "DynamicRole",
      entityId: req.params.id,
      before: beforeState,
      after: null,
    });

    return res.json({
      success: true,
      message: `Role '${role.title}' deleted successfully`,
    });
  } catch (err) {
    console.error("Error deleting dynamic role:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
