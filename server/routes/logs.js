const express = require("express");
const router = express.Router();
const { DailyLog, Task } = require("../models/models");
const verifyToken = require("../middleware/auth");

// Get logs for a specific project
router.get("/project/:projectId", verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    // Query directly with project_id or via task fallback
    let logs = await DailyLog.find({ project_id: projectId }).sort({ log_date: -1 });
    if (logs.length === 0) {
      const tasks = await Task.find({ project_id: projectId });
      const taskIds = tasks.map((t) => t._id);
      logs = await DailyLog.find({ task_id: { $in: taskIds } }).sort({ log_date: -1 });
    }
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get logs by employee ID
router.get("/employee/:userId", verifyToken, async (req, res) => {
  try {
    const logs = await DailyLog.find({ user_id: req.params.userId }).sort({ log_date: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get logs for a specific task
router.get("/task/:taskId", verifyToken, async (req, res) => {
  try {
    const logs = await DailyLog.find({ task_id: req.params.taskId }).sort({ log_date: 1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single daily log for a task + user + date
router.get("/task/:taskId/date/:logDate", verifyToken, async (req, res) => {
  try {
    const log = await DailyLog.findOne({
      task_id: req.params.taskId,
      user_id: req.uid,
      log_date: req.params.logDate,
    });
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit / Upsert daily log
router.post("/", verifyToken, async (req, res) => {
  try {
    const { task_id, log_date, work_text, has_worked, no_work_reason } = req.body;
    if (!task_id || !log_date || typeof has_worked !== "boolean") {
      return res.status(400).json({ error: "task_id, log_date, and has_worked are required" });
    }

    // Resolve task and project_id
    const task = await Task.findById(task_id);
    const projectId = task ? task.project_id : null;

    const log = await DailyLog.findOneAndUpdate(
      { task_id, user_id: req.uid, log_date },
      {
        task_id,
        project_id: projectId,
        user_id: req.uid,
        log_date,
        work_text: has_worked ? (work_text || "") : "",
        has_worked,
        no_work_reason: !has_worked ? (no_work_reason || "") : "",
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
