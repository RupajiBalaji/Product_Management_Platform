const express = require("express");
const router = express.Router();
const { Task } = require("../models/models");
const verifyToken = require("../middleware/auth");

// Get tasks by project
router.get("/project/:projectId", verifyToken, async (req, res) => {
  try {
    const tasks = await Task.find({ project_id: req.params.projectId }).sort({ created_at: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get tasks assigned to current user
router.get("/my", verifyToken, async (req, res) => {
  try {
    const tasks = await Task.find({ assignee_ids: req.uid }).sort({ end_date: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get tasks assigned to a specific employee (PM view)
router.get("/employee/:userId", verifyToken, async (req, res) => {
  try {
    const tasks = await Task.find({ assignee_ids: req.params.userId }).sort({ end_date: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single task
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create task
router.post("/", verifyToken, async (req, res) => {
  try {
    const { project_id, title, description, start_date, end_date, assignee_ids } = req.body;
    if (!project_id || !title || !start_date || !end_date) {
      return res.status(400).json({ error: "project_id, title, start_date, end_date required" });
    }
    const task = new Task({ project_id, title, description, start_date, end_date, assignee_ids: assignee_ids || [] });
    await task.save();
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
