const express = require("express");
const router = express.Router();
const { Task, DailyLog } = require("../models/models");
const AuditLog = require("../models/AuditLog");
const { checkForCycle } = require("../lib/dagValidation");
const { verifyToken, requireProductLead } = require("../middleware/auth");

// ─── GET /api/tasks/project/:projectId — Get tasks by project ────────────────
router.get("/project/:projectId", verifyToken, async (req, res) => {
  try {
    const tasks = await Task.find({ project_id: req.params.projectId })
      .populate("depends_on", "_id title status start_date end_date")
      .sort({ created_at: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tasks/project/:projectId/graph — Lightweight DAG Graph View ─────
router.get("/project/:projectId/graph", verifyToken, async (req, res) => {
  try {
    const tasks = await Task.find(
      { project_id: req.params.projectId },
      "_id title status depends_on start_date end_date assignee_ids estimate_hours logged_hours"
    ).lean();

    const formattedTasks = tasks.map((t) => ({
      _id: t._id,
      id: t._id,
      title: t.title,
      status: t.status,
      depends_on: (t.depends_on || []).map((d) => String(d)),
      start_date: t.start_date,
      end_date: t.end_date,
      assignee_ids: t.assignee_ids || [],
      estimate_hours: t.estimate_hours || 0,
      logged_hours: t.logged_hours || 0,
    }));

    res.json({ success: true, tasks: formattedTasks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/tasks/my — Get tasks assigned to current user ───────────────────
router.get("/my", verifyToken, async (req, res) => {
  try {
    const tasks = await Task.find({ assignee_ids: req.uid })
      .populate("depends_on", "_id title status")
      .sort({ end_date: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tasks/employee/:userId — Tasks for specific employee ────────────
router.get("/employee/:userId", verifyToken, async (req, res) => {
  try {
    const tasks = await Task.find({ assignee_ids: req.params.userId })
      .populate("depends_on", "_id title status")
      .sort({ end_date: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tasks/:id — Get single task ─────────────────────────────────────
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("depends_on", "_id title status start_date end_date");
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/tasks — Create task ────────────────────────────────────────────
router.post("/", verifyToken, async (req, res) => {
  try {
    const {
      project_id,
      title,
      description,
      start_date,
      end_date,
      assignee_ids,
      depends_on,
      estimate_hours,
    } = req.body;

    if (!project_id || !title || !start_date || !end_date) {
      return res.status(400).json({ error: "project_id, title, start_date, end_date required" });
    }

    const task = new Task({
      project_id,
      title: title.trim(),
      description: (description || "").trim(),
      start_date,
      end_date,
      assignee_ids: assignee_ids || [],
      depends_on: depends_on || [],
      estimate_hours: Math.max(0, Number(estimate_hours) || 0),
    });

    await task.save();

    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/tasks/:id/dependencies — Update dependencies with Cycle Check ─
router.patch("/:id/dependencies", verifyToken, async (req, res) => {
  try {
    const { depends_on } = req.body;
    if (!Array.isArray(depends_on)) {
      return res.status(400).json({ success: false, error: "depends_on must be an array of task IDs" });
    }

    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: "Task not found" });

    // Run DAG Cycle Detection
    const cycleResult = await checkForCycle(task._id, depends_on, task.project_id);

    if (cycleResult.hasCycle) {
      // Resolve IDs to human-readable task titles
      const allProjectTasks = await Task.find({ project_id: task.project_id }, "_id title").lean();
      const titleMap = new Map(allProjectTasks.map((t) => [String(t._id), t.title]));

      const readablePath = (cycleResult.path || []).map(
        (id) => titleMap.get(String(id)) || `Task (${id.slice(-6)})`
      );

      return res.status(409).json({
        success: false,
        error: "Circular dependency detected",
        cyclePath: readablePath,
        cycleIds: cycleResult.path,
        message: `This would create a circular dependency: ${readablePath.join(" → ")}. Remove one dependency to continue.`,
      });
    }

    const beforeState = { depends_on: task.depends_on };
    task.depends_on = depends_on;
    await task.save();

    // Sensitive write audit log
    await AuditLog.record({
      actorId: req.uid,
      action: "TASK_DEPENDENCY_UPDATED",
      entityType: "Task",
      entityId: task._id.toString(),
      before: beforeState,
      after: { depends_on: task.depends_on },
    });

    const populated = await Task.findById(task._id).populate("depends_on", "_id title status");
    return res.json({ success: true, task: populated });
  } catch (err) {
    console.error("Error updating task dependencies:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/tasks/:id — General task update ───────────────────────────────
router.patch("/:id", verifyToken, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: "Task not found" });

    const {
      title,
      description,
      start_date,
      end_date,
      assignee_ids,
      status,
      estimate_hours,
      logged_hours,
      depends_on,
    } = req.body;

    // If updating dependencies here, validate cycle too
    if (depends_on !== undefined && Array.isArray(depends_on)) {
      const cycleResult = await checkForCycle(task._id, depends_on, task.project_id);
      if (cycleResult.hasCycle) {
        const allProjectTasks = await Task.find({ project_id: task.project_id }, "_id title").lean();
        const titleMap = new Map(allProjectTasks.map((t) => [String(t._id), t.title]));
        const readablePath = (cycleResult.path || []).map(
          (id) => titleMap.get(String(id)) || `Task (${id.slice(-6)})`
        );

        return res.status(409).json({
          success: false,
          error: "Circular dependency detected",
          cyclePath: readablePath,
          cycleIds: cycleResult.path,
          message: `This would create a circular dependency: ${readablePath.join(" → ")}. Remove one dependency to continue.`,
        });
      }
      task.depends_on = depends_on;
    }

    if (title !== undefined) task.title = title.trim();
    if (description !== undefined) task.description = description.trim();
    if (start_date !== undefined) task.start_date = start_date;
    if (end_date !== undefined) task.end_date = end_date;
    if (assignee_ids !== undefined) task.assignee_ids = assignee_ids;
    if (status !== undefined) task.status = status;
    if (estimate_hours !== undefined) task.estimate_hours = Math.max(0, Number(estimate_hours) || 0);
    if (logged_hours !== undefined) task.logged_hours = Math.max(0, Number(logged_hours) || 0);

    await task.save();

    const populated = await Task.findById(task._id).populate("depends_on", "_id title status");
    return res.json({ success: true, task: populated });
  } catch (err) {
    console.error("Error updating task:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/tasks/:id — Delete task with dependency guard ────────────────
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: "Task not found" });

    // Check if other tasks depend on this task
    const dependentTasks = await Task.find(
      { project_id: task.project_id, depends_on: task._id },
      "_id title"
    ).lean();

    if (dependentTasks.length > 0) {
      const titles = dependentTasks.map((t) => t.title);
      return res.status(409).json({
        success: false,
        error: "Cannot delete task: other tasks depend on it",
        dependentTasks: titles,
        message: `Cannot delete "${task.title}" because it is a prerequisite for: ${titles.map((t) => `"${t}"`).join(", ")}`,
      });
    }

    const beforeState = task.toObject();
    await Task.findByIdAndDelete(req.params.id);

    // Clean up daily logs for this task
    await DailyLog.deleteMany({ task_id: req.params.id });

    // Audit Log
    await AuditLog.record({
      actorId: req.uid,
      action: "TASK_DELETED",
      entityType: "Task",
      entityId: req.params.id,
      before: beforeState,
      after: null,
    });

    return res.json({ success: true, message: `Task "${task.title}" deleted successfully.` });
  } catch (err) {
    console.error("Error deleting task:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
