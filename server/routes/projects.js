const express = require("express");
const router = express.Router();
const { Project, Task, DailyLog } = require("../models/models");
const User = require("../models/User");
const { verifyToken, requirePM } = require("../middleware/auth");

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

    // Enrich each member with their total project count across company
    const enrichedMembers = await Promise.all(
      members.map(async (m) => {
        const totalProjectsAssigned = await Project.countDocuments({ member_ids: m._id });
        const activeTasksInThisProject = await Task.countDocuments({
          project_id: project._id,
          assignee_ids: m._id,
          status: "active",
        });
        return {
          ...m,
          id: m._id,
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

// Add member to project team
router.post("/:id/members", verifyToken, requirePM, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    if (!project.member_ids.includes(userId)) {
      project.member_ids.push(userId);
      await project.save();
    }

    const members = await User.find({ _id: { $in: project.member_ids } });
    res.json({ ...project.toObject(), members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove member from project team
router.delete("/:id/members/:userId", verifyToken, requirePM, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const project = await Project.findById(id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    project.member_ids = project.member_ids.filter((m) => m !== userId);
    await project.save();

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
