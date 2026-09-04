const express = require("express");
const router = express.Router();
const { Task, DailyLog, Project } = require("../models/models");
const AuditLog = require("../models/AuditLog");
const { checkForCycle } = require("../lib/dagValidation");
const { calculateTaskPriority, sortQueueByPriority } = require("../lib/taskPriority");
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

// ─── Helper: Recalculate computed_priority for all tasks in a project ─────────
async function recalculateProjectPriorities(projectId) {
  try {
    const project = await Project.findById(projectId);
    if (!project) return [];

    const allTasks = await Task.find({ project_id: projectId });
    if (allTasks.length === 0) return [];

    const rawTasks = allTasks.map((t) => t.toObject());
    const updatedTasks = [];

    for (const t of allTasks) {
      const priorityInfo = calculateTaskPriority(t.toObject(), rawTasks, project.end_date);
      if (t.computed_priority !== priorityInfo.priority) {
        t.computed_priority = priorityInfo.priority;
        await t.save();
      }
      updatedTasks.push({
        _id: t._id,
        id: t._id,
        title: t.title,
        computed_priority: priorityInfo.priority,
        priority_reasoning: priorityInfo.reasoning,
      });
    }

    return updatedTasks;
  } catch (err) {
    console.error("Error recalculating project priorities:", err);
    return [];
  }
}

// ─── POST /api/tasks/project/:projectId/recalculate-priorities ────────────────
router.post("/project/:projectId/recalculate-priorities", verifyToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const updatedTasks = await recalculateProjectPriorities(req.params.projectId);
    res.json({
      success: true,
      message: `Recalculated priorities for ${updatedTasks.length} tasks`,
      tasks: updatedTasks,
    });
  } catch (err) {
    console.error("Error in recalculate-priorities route:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/tasks/my — Get tasks assigned to current user ───────────────────
router.get("/my", verifyToken, async (req, res) => {
  try {
    const rawTasks = await Task.find({ assignee_ids: req.uid })
      .populate("depends_on", "_id title status")
      .lean();

    // Attach subtask progress
    const taskIds = rawTasks.map((t) => t._id);
    const subtasks = await Task.find({ parent_task_id: { $in: taskIds } }).lean();

    const subtaskMap = new Map();
    for (const sub of subtasks) {
      const pId = String(sub.parent_task_id);
      if (!subtaskMap.has(pId)) subtaskMap.set(pId, []);
      subtaskMap.get(pId).push(sub);
    }

    const tasksWithMeta = rawTasks.map((t) => {
      const children = subtaskMap.get(String(t._id)) || [];
      const subtask_count = children.length;
      const subtask_completed = children.filter((s) => s.status === "completed").length;
      const subtask_progress =
        subtask_count > 0
          ? Math.round((subtask_completed / subtask_count) * 100)
          : t.status === "completed"
          ? 100
          : 0;

      return {
        ...t,
        id: t._id,
        subtask_count,
        subtask_completed,
        subtask_progress,
      };
    });

    const sorted = sortQueueByPriority(tasksWithMeta);
    res.json(sorted);
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

    // Recalculate project priorities on DAG dependency changes
    await recalculateProjectPriorities(task.project_id);

    const populated = await Task.findById(task._id).populate("depends_on", "_id title status");
    return res.json({ success: true, task: populated });
  } catch (err) {
    console.error("Error updating task dependencies:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/tasks/:id/subtasks — Create Subtask ────────────────────────────
router.post("/:id/subtasks", verifyToken, async (req, res) => {
  try {
    const parentTask = await Task.findById(req.params.id);
    if (!parentTask) {
      return res.status(404).json({ success: false, error: "Parent task not found" });
    }

    // Check authorization: caller must be assigned to parent task or elevated role
    const isAssignee = (parentTask.assignee_ids || []).map(String).includes(String(req.uid));
    const isElevated = ["product_lead", "lead_architect", "pm"].includes(req.userType);
    if (!isAssignee && !isElevated) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Only assigned contributors or project leads can decompose this task.",
      });
    }

    const { title, description, estimate_hours, start_date, end_date, acceptance_criteria_override } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: "Subtask title is required" });
    }

    const subtask = new Task({
      project_id: parentTask.project_id,
      parent_task_id: parentTask._id,
      is_subtask: true,
      title: title.trim(),
      description: (description || "").trim(),
      start_date: start_date || parentTask.start_date,
      end_date: end_date || parentTask.end_date,
      assignee_ids: req.body.assignee_ids && req.body.assignee_ids.length > 0 ? req.body.assignee_ids : parentTask.assignee_ids,
      estimate_hours: Math.max(0, Number(estimate_hours) || 0),
      acceptance_criteria_override: acceptance_criteria_override ? acceptance_criteria_override.trim() : null,
      computed_priority: parentTask.computed_priority || "P2",
      status: "active",
    });

    await subtask.save();

    await AuditLog.record({
      actorId: req.uid,
      action: "SUBTASK_CREATED",
      entityType: "Task",
      entityId: subtask._id.toString(),
      before: null,
      after: {
        parent_task_id: parentTask._id.toString(),
        title: subtask.title,
        estimate_hours: subtask.estimate_hours,
      },
    });

    res.status(201).json({ success: true, subtask });
  } catch (err) {
    console.error("Error creating subtask:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/tasks/:id/subtasks — Get Subtasks of a Parent Task ──────────────
router.get("/:id/subtasks", verifyToken, async (req, res) => {
  try {
    const subtasks = await Task.find({ parent_task_id: req.params.id })
      .populate("depends_on", "_id title status")
      .sort({ created_at: 1 });
    res.json({ success: true, subtasks });
  } catch (err) {
    console.error("Error fetching subtasks:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/tasks/:id/progress — Get Task Progress from Subtasks ─────────────
router.get("/:id/progress", verifyToken, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const subtasks = await Task.find({ parent_task_id: task._id });
    const totalSubtasks = subtasks.length;
    const completedSubtasks = subtasks.filter((s) => s.status === "completed").length;

    let progressPct = 0;
    if (totalSubtasks === 0) {
      progressPct = task.status === "completed" ? 100 : 0;
    } else {
      progressPct = Math.round((completedSubtasks / totalSubtasks) * 100);
    }

    res.json({
      success: true,
      taskId: task._id,
      totalSubtasks,
      completedSubtasks,
      progressPct,
      is_subtask: task.is_subtask || false,
      parent_task_id: task.parent_task_id || null,
    });
  } catch (err) {
    console.error("Error getting task progress:", err);
    res.status(500).json({ success: false, error: err.message });
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

// ─── DELETE /api/tasks/:id — Delete task with dependency guard & cascade ───────
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

    // Cascade delete any child sub-tasks
    const subtasks = await Task.find({ parent_task_id: task._id });
    if (subtasks.length > 0) {
      const subtaskIds = subtasks.map((s) => s._id);
      await Task.deleteMany({ _id: { $in: subtaskIds } });
      await DailyLog.deleteMany({ task_id: { $in: subtaskIds } });

      await AuditLog.record({
        actorId: req.uid,
        action: "SUBTASKS_CASCADE_DELETED",
        entityType: "Task",
        entityId: task._id.toString(),
        before: { count: subtasks.length, subtaskIds: subtaskIds.map(String) },
        after: null,
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

    return res.json({
      success: true,
      message: `Task "${task.title}" and ${subtasks.length} subtask(s) deleted successfully.`,
    });
  } catch (err) {
    console.error("Error deleting task:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
