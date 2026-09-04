const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { Project, Task } = require("../models/models");
const { verifyToken, requirePM } = require("../middleware/auth");

// Get workforce directory with cross-project workload analysis
router.get("/employees", verifyToken, async (req, res) => {
  try {
    const employees = await User.find({ user_type: { $in: ["employee", "lead_architect"] } }).sort({ created_at: -1 }).lean();

    // Enrich with projects assigned
    const enriched = await Promise.all(
      employees.map(async (emp) => {
        const assignedProjects = await Project.find({ member_ids: emp._id }, "title status priority").lean();
        const activeTasksCount = await Task.countDocuments({ assignee_ids: emp._id, status: "active" });

        return {
          ...emp,
          id: emp._id,
          assignedProjects,
          projectCount: assignedProjects.length,
          activeTasksCount,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get overall workforce stats
router.get("/workforce-stats", verifyToken, async (req, res) => {
  try {
    const totalEmployees = await User.countDocuments({ user_type: { $in: ["employee", "lead_architect"] } });
    const employees = await User.find({ user_type: { $in: ["employee", "lead_architect"] } }, "_id").lean();

    let unallocatedCount = 0;
    let multiProjectCount = 0;

    for (const emp of employees) {
      const projCount = await Project.countDocuments({ member_ids: emp._id });
      if (projCount === 0) unallocatedCount++;
      if (projCount > 1) multiProjectCount++;
    }

    res.json({
      totalEmployees,
      unallocatedCount,
      multiProjectCount,
      activeCount: totalEmployees - unallocatedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get own profile
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.uid);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single user
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create employee
router.post("/create-employee", verifyToken, requirePM, async (req, res) => {
  try {
    const { uid, email, full_name, role_title, user_type } = req.body;
    if (!email || !full_name) {
      return res.status(400).json({ error: "email and full_name are required" });
    }
    const targetType = ["lead_architect", "employee"].includes(user_type) ? user_type : "employee";
    const generatedId = uid || `emp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const user = new User({
      _id: generatedId,
      email: email.toLowerCase().trim(),
      full_name: full_name.trim(),
      role_title: role_title ? role_title.trim() : (targetType === "lead_architect" ? "Lead Architect" : "Team Member"),
      user_type: targetType,
    });
    await user.save();
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete / Remove employee from company directory
router.delete("/:id", verifyToken, requirePM, async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);

    // Remove from all projects and tasks
    await Project.updateMany({ member_ids: id }, { $pull: { member_ids: id } });
    await Task.updateMany({ assignee_ids: id }, { $pull: { assignee_ids: id } });

    res.json({ success: true, message: "Employee removed from directory and all project allocations." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
