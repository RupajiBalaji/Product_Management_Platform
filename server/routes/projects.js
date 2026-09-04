const express = require("express");
const router = express.Router();
const { Project, Task, DailyLog } = require("../models/models");
const User = require("../models/User");
const DynamicRole = require("../models/DynamicRole");
const AuditLog = require("../models/AuditLog");
const { verifyToken, requirePM, requireProductLead } = require("../middleware/auth");

// Get all projects with member counts
router.get("/", verifyToken, async (req, res) => {
  try {
    const projects = await Project.find().sort({ priority: -1, created_at: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get projects for logged-in employee (supports multiple project memberships)
router.get("/my", verifyToken, async (req, res) => {
  try {
    const projects = await Project.find({ member_ids: req.uid }).sort({ priority: -1, created_at: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single project with populated member details and cross-project workloads
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Fetch assigned member user objects
    const members = await User.find({ _id: { $in: project.member_ids } }).lean();

    // Map allocations by user_id
    const allocationsByUser = new Map();
    (project.team_allocations || []).forEach((alloc) => {
      allocationsByUser.set(String(alloc.user_id), alloc);
    });

    // Populate dynamic roles
    const roleIds = (project.team_allocations || [])
      .map((a) => a.role_id)
      .filter(Boolean);
    const dynamicRoles = await DynamicRole.find({ _id: { $in: roleIds } }).lean();
    const rolesById = new Map();
    dynamicRoles.forEach((r) => rolesById.set(r._id.toString(), r));

    // Enrich each member with role, allocation, and cross-project workloads
    const enrichedMembers = await Promise.all(
      members.map(async (m) => {
        const alloc = allocationsByUser.get(String(m._id));
        const role = alloc?.role_id ? rolesById.get(alloc.role_id.toString()) : null;
        const totalProjectsAssigned = await Project.countDocuments({ member_ids: m._id });
        const activeTasksInThisProject = await Task.countDocuments({
          project_id: project._id,
          assignee_ids: m._id,
          status: "active",
        });
        return {
          ...m,
          id: m._id,
          dynamicRole: role || null,
          role_title: role?.title || m.role_title,
          allocatedDailyHours: alloc?.daily_hours || role?.defaultDailyCapHours || 8,
          totalProjectsAssigned,
          activeTasksInThisProject,
        };
      })
    );

    res.json({ ...project.toObject(), members: enrichedMembers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create project with priority option
router.post("/", verifyToken, requirePM, async (req, res) => {
  try {
    const { title, description, member_ids, priority = "medium" } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });

    const project = new Project({
      title,
      description: description || "",
      priority,
      member_ids: member_ids || [],
      created_by: req.uid,
    });
    await project.save();
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update project status
router.patch("/:id/status", verifyToken, requirePM, async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update project priority (High, Critical, Medium, Low)
router.patch("/:id/priority", verifyToken, requirePM, async (req, res) => {
  try {
    const { priority } = req.body;
    if (!["low", "medium", "high", "critical"].includes(priority)) {
      return res.status(400).json({ error: "Invalid priority value" });
    }
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { priority },
      { new: true }
    );
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add/update member on project team with DynamicRole and daily hours
router.post("/:id/members", verifyToken, requireProductLead, async (req, res) => {
  try {
    const { userId, roleId, dailyHours } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    let dynamicRole = null;
    if (roleId) {
      dynamicRole = await DynamicRole.findById(roleId);
    }

    const hours = Number(dailyHours) || dynamicRole?.defaultDailyCapHours || 8;

    if (!project.team_allocations) project.team_allocations = [];

    const existingIdx = project.team_allocations.findIndex((a) => String(a.user_id) === String(userId));
    if (existingIdx >= 0) {
      if (roleId !== undefined) project.team_allocations[existingIdx].role_id = roleId || null;
      if (dailyHours !== undefined) project.team_allocations[existingIdx].daily_hours = hours;
    } else {
      project.team_allocations.push({
        user_id: userId,
        role_id: roleId || null,
        daily_hours: hours,
        allocated_at: new Date(),
      });
    }

    if (!project.member_ids.includes(userId)) {
      project.member_ids.push(userId);
    }

    await project.save();

    await AuditLog.record({
      actorId: req.uid,
      action: "PROJECT_MEMBER_ALLOCATED",
      entityType: "Project",
      entityId: project._id.toString(),
      after: { userId, roleId, dailyHours: hours },
    });

    const members = await User.find({ _id: { $in: project.member_ids } }).lean();
    const allocationsByUser = new Map();
    (project.team_allocations || []).forEach((alloc) => {
      allocationsByUser.set(String(alloc.user_id), alloc);
    });

    const roleIds = (project.team_allocations || []).map((a) => a.role_id).filter(Boolean);
    const dynamicRoles = await DynamicRole.find({ _id: { $in: roleIds } }).lean();
    const rolesById = new Map();
    dynamicRoles.forEach((r) => rolesById.set(r._id.toString(), r));

    const enrichedMembers = members.map((m) => {
      const alloc = allocationsByUser.get(String(m._id));
      const role = alloc?.role_id ? rolesById.get(alloc.role_id.toString()) : null;
      return {
        ...m,
        id: m._id,
        dynamicRole: role || null,
        role_title: role?.title || m.role_title,
        allocatedDailyHours: alloc?.daily_hours || role?.defaultDailyCapHours || 8,
      };
    });

    res.json({ ...project.toObject(), members: enrichedMembers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove member from project team
router.delete("/:id/members/:userId", verifyToken, requireProductLead, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const project = await Project.findById(id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    project.member_ids = project.member_ids.filter((m) => String(m) !== String(userId));
    if (project.team_allocations) {
      project.team_allocations = project.team_allocations.filter((a) => String(a.user_id) !== String(userId));
    }
    await project.save();

    await AuditLog.record({
      actorId: req.uid,
      action: "PROJECT_MEMBER_REMOVED",
      entityType: "Project",
      entityId: project._id.toString(),
      after: { userId },
    });

    // Also unassign member from tasks in this project
    await Task.updateMany(
      { project_id: id },
      { $pull: { assignee_ids: userId } }
    );

    const members = await User.find({ _id: { $in: project.member_ids } });
    res.json({ ...project.toObject(), members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
