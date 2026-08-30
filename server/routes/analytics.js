const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { Project, Task, DailyLog } = require("../models/models");
const verifyToken = require("../middleware/auth");

// PM Dashboard Overview Aggregation
router.get("/dashboard-summary", verifyToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const [totalProjects, activeProjects, inReviewProjects, completedProjects, totalEmployees, todayLogs] =
      await Promise.all([
        Project.countDocuments(),
        Project.countDocuments({ status: "active" }),
        Project.countDocuments({ status: "in-review" }),
        Project.countDocuments({ status: "completed" }),
        User.countDocuments({ user_type: "employee" }),
        DailyLog.countDocuments({ log_date: today }),
      ]);

    res.json({
      totalProjects,
      activeProjects,
      inReviewProjects,
      completedProjects,
      totalEmployees,
      todayLogs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Employee 360° Analytics Aggregation
router.get("/employee/:userId", verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Employee not found" });

    const [projects, tasks, logs] = await Promise.all([
      Project.find({ member_ids: userId }),
      Task.find({ assignee_ids: userId }).sort({ end_date: 1 }),
      DailyLog.find({ user_id: userId }).sort({ log_date: -1 }),
    ]);

    const totalLogs = logs.length;
    const workedLogs = logs.filter((l) => l.has_worked);
    const noWorkLogs = logs.filter((l) => !l.has_worked);
    const consistencyScore = totalLogs > 0 ? Math.round((workedLogs.length / totalLogs) * 100) : 0;

    const now = new Date().toISOString().split("T")[0];
    const activeTasks = tasks.filter((t) => t.end_date >= now && t.status === "active");

    res.json({
      user,
      projects,
      tasks,
      activeTasks,
      logs,
      totalLogs,
      workedCount: workedLogs.length,
      noWorkCount: noWorkLogs.length,
      consistencyScore,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
