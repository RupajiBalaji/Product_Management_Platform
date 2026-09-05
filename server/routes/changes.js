const express = require("express");
const router = express.Router();

const { Project, Task } = require("../models/models");
const User = require("../models/User");
const PRD = require("../models/PRD");
const ChangeTransaction = require("../models/ChangeTransaction");
const AuditLog = require("../models/AuditLog");

const {
  verifyToken,
  requireProductLead,
} = require("../middleware/auth");

const { calculateCostDelta } = require("../lib/costCalculator");
const {
  calculateRollbackImpact,
  computeFieldDiff,
  nextVersion,
} = require("../lib/changeRollback");

const getUserId = (req) =>
  String(req.uid || req.user?._id || req.user?.id || req.user?.uid || "system");

// ─── POST /api/projects/:id/changes/request ───────────────────────────────────
// Product Lead requests scope change consequence preview (Zero DB mutations).
router.post("/projects/:id/changes/request", verifyToken, requireProductLead, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      change_description,
      tasks_to_add = [],
      tasks_to_modify = [],
      hours_delta,
      days_delta,
    } = req.body;

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    // 1. Calculate deltaHours
    let deltaHours = 0;
    if (typeof hours_delta === "number") {
      deltaHours = hours_delta;
    } else {
      // Sum estimates of new tasks
      for (const t of tasks_to_add) {
        deltaHours += Number(t.estimate_hours || 0);
      }
      // Sum estimate deltas of modified tasks
      for (const m of tasks_to_modify) {
        const diff = Number(m.new_estimate_hours || 0) - Number(m.old_estimate_hours || 0);
        deltaHours += diff;
      }
    }

    // 2. Calculate deltaDays
    let deltaDays = 0;
    if (typeof days_delta === "number") {
      deltaDays = days_delta;
    } else {
      // Approximate 8 hours per workday across project velocity
      deltaDays = Math.max(0, Math.ceil(deltaHours / 8));
    }

    // 3. Compute deltaCost using project team's average or contributor rate
    const memberIds = (project.team_allocations || []).map((a) => a.user_id);
    let avgRate = 0;
    if (memberIds.length > 0) {
      const users = await User.find({ _id: { $in: memberIds } }).lean();
      const rates = users.map((u) => Number(u.hourly_cost_rate || 0)).filter((r) => r > 0);
      if (rates.length > 0) {
        avgRate = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
      }
    }
    const costDelta = calculateCostDelta(deltaHours, avgRate);

    // 4. Calculate utilization impact
    const utilizationImpact = [];
    for (const alloc of project.team_allocations || []) {
      const user = await User.findById(alloc.user_id).lean();
      const cap = user?.defaultDailyCapHours || 8;
      const currentHours = alloc.daily_hours_allocated || 8;
      // If tasks_to_add assigns this user, estimate utilization change
      const userAddedHours = tasks_to_add
        .filter((t) => (t.assignee_ids || []).includes(alloc.user_id))
        .reduce((sum, t) => sum + Number(t.estimate_hours || 0), 0);

      const estimatedDailyAdd = userAddedHours > 0 ? Math.min(4, Math.round((userAddedHours / 5) * 10) / 10) : 0;
      const newUtilizationPct = Math.min(200, Math.round(((currentHours + estimatedDailyAdd) / cap) * 100));

      utilizationImpact.push({
        userId: alloc.user_id,
        newUtilizationPct,
      });
    }

    // 5. Gather affected task IDs
    const affectedTaskIds = tasks_to_modify.map((m) => m.taskId).filter(Boolean);

    // Get current PRD version
    const currentPrd = await PRD.findOne({ project_id: id, status: "approved" })
      .sort({ createdAt: -1 })
      .lean();
    const prdVersionBefore = currentPrd ? currentPrd.version : "1.0";
    const prdVersionAfter = nextVersion(prdVersionBefore, false);

    const consequence_summary = {
      deltaHours,
      deltaDays,
      deltaCost: costDelta.costDelta,
      formattedCostDelta: costDelta.formatted,
      affectedTaskIds,
      utilizationImpact,
    };

    res.json({
      success: true,
      preview: {
        project_id: id,
        change_description: change_description || "Proposed scope modification",
        consequence_summary,
        prd_version_before: prdVersionBefore,
        prd_version_after: prdVersionAfter,
        tasks_to_add,
        tasks_to_modify,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/projects/:id/changes/apply ─────────────────────────────────────
// Product Lead applies change transaction, bumps PRD version, and updates tasks.
router.post("/projects/:id/changes/apply", verifyToken, requireProductLead, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      change_description,
      consequence_summary,
      tasks_to_add = [],
      tasks_to_modify = [],
      prd_update = {},
      is_major_version = false,
    } = req.body;

    if (!change_description) {
      return res.status(400).json({ success: false, error: "change_description is required" });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const userId = getUserId(req);

    // 1. Manage PRD version bump
    const currentPrd = await PRD.findOne({ project_id: id, status: "approved" })
      .sort({ createdAt: -1 });

    const prdVersionBefore = currentPrd ? currentPrd.version : "1.0";
    const prdVersionAfter = nextVersion(prdVersionBefore, Boolean(is_major_version));

    let newPrd = null;
    if (currentPrd) {
      const mergedPrd = {
        executive_summary: prd_update.executive_summary || currentPrd.executive_summary,
        scope_in: prd_update.scope_in || [
          ...currentPrd.scope_in,
          `Change: ${change_description}`,
        ],
        scope_out: prd_update.scope_out || currentPrd.scope_out,
        user_stories: prd_update.user_stories || currentPrd.user_stories,
        technical_architecture: prd_update.technical_architecture || currentPrd.technical_architecture,
        team_composition: prd_update.team_composition || currentPrd.team_composition,
      };

      const diffs = computeFieldDiff(currentPrd.toObject(), mergedPrd);

      newPrd = new PRD({
        project_id: id,
        version: prdVersionAfter,
        executive_summary: mergedPrd.executive_summary,
        scope_in: mergedPrd.scope_in,
        scope_out: mergedPrd.scope_out,
        user_stories: mergedPrd.user_stories,
        technical_architecture: mergedPrd.technical_architecture,
        team_composition: mergedPrd.team_composition,
        status: "approved",
        diff_summary: diffs,
        created_by: userId,
      });
      await newPrd.save();

      currentPrd.status = "superseded";
      currentPrd.superseded_by = newPrd._id;
      await currentPrd.save();
    }

    // 2. Create tasks_added
    const createdTaskIds = [];
    for (const t of tasks_to_add) {
      const newTask = new Task({
        project_id: id,
        title: t.title || "New Scope Item",
        description: t.description || `Created via scope change: ${change_description}`,
        start_date: t.start_date || new Date().toISOString().split("T")[0],
        end_date: t.end_date || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
        assignee_ids: t.assignee_ids || [],
        status: t.status || "active",
        estimate_hours: Number(t.estimate_hours || 8),
        logged_hours: 0,
      });
      await newTask.save();
      createdTaskIds.push(newTask._id);
    }

    // 3. Update tasks_modified with snapshots
    const modifiedRecords = [];
    for (const m of tasks_to_modify) {
      const existingTask = await Task.findById(m.taskId);
      if (!existingTask) continue;

      const beforeSnapshot = {
        title: existingTask.title,
        description: existingTask.description,
        estimate_hours: existingTask.estimate_hours,
        status: existingTask.status,
        assignee_ids: existingTask.assignee_ids,
      };

      // Apply modifications
      if (m.title !== undefined) existingTask.title = m.title;
      if (m.description !== undefined) existingTask.description = m.description;
      if (m.estimate_hours !== undefined) existingTask.estimate_hours = Number(m.estimate_hours);
      if (m.assignee_ids !== undefined) existingTask.assignee_ids = m.assignee_ids;

      const afterSnapshot = {
        title: existingTask.title,
        description: existingTask.description,
        estimate_hours: existingTask.estimate_hours,
        status: existingTask.status,
        assignee_ids: existingTask.assignee_ids,
      };

      await existingTask.save();

      modifiedRecords.push({
        taskId: existingTask._id,
        before: beforeSnapshot,
        after: afterSnapshot,
      });
    }

    // 4. Create ChangeTransaction
    const changeTx = new ChangeTransaction({
      project_id: id,
      requested_by: userId,
      change_description,
      consequence_summary: {
        deltaHours: consequence_summary?.deltaHours || 0,
        deltaDays: consequence_summary?.deltaDays || 0,
        deltaCost: consequence_summary?.deltaCost || 0,
        affectedTaskIds: modifiedRecords.map((m) => m.taskId),
        utilizationImpact: consequence_summary?.utilizationImpact || [],
      },
      prd_version_before: prdVersionBefore,
      prd_version_after: prdVersionAfter,
      tasks_added: createdTaskIds,
      tasks_modified: modifiedRecords,
      status: "applied",
      applied_at: new Date(),
    });
    await changeTx.save();

    await AuditLog.record({
      actorId: userId,
      action: "SCOPE_CHANGE_APPLIED",
      entityType: "ChangeTransaction",
      entityId: changeTx._id.toString(),
      projectId: id,
      after: {
        change_description,
        prd_version_before: prdVersionBefore,
        prd_version_after: prdVersionAfter,
        tasksAddedCount: createdTaskIds.length,
        tasksModifiedCount: modifiedRecords.length,
      },
    });

    res.status(201).json({
      success: true,
      changeTransaction: changeTx,
      prd: newPrd,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/projects/:id/changes ────────────────────────────────────────────
// List all ChangeTransactions for a project (Change Log)
router.get("/projects/:id/changes", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const changes = await ChangeTransaction.find({ project_id: id })
      .sort({ applied_at: -1 })
      .lean();

    res.json({
      success: true,
      changes,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/changes/:id/rollback-preview ───────────────────────────────────
// Product Lead previews impact of rolling back a change transaction (No DB mutations).
router.post("/changes/:id/rollback-preview", verifyToken, requireProductLead, async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await ChangeTransaction.findById(id).lean();
    if (!tx) {
      return res.status(404).json({ success: false, error: "Change transaction not found" });
    }

    if (tx.status === "rolled_back") {
      return res.status(400).json({
        success: false,
        error: "This change transaction has already been rolled back.",
      });
    }

    // Fetch live tasks for the project
    const tasks = await Task.find({ project_id: tx.project_id }).lean();

    // Fetch all active transactions on this project
    const activeTx = await ChangeTransaction.find({
      project_id: tx.project_id,
      status: "applied",
    }).lean();

    const impact = calculateRollbackImpact(tx, tasks, activeTx);

    res.json({
      success: true,
      changeTransaction: tx,
      impact,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/changes/:id/rollback ───────────────────────────────────────────
// Product Lead executes rollback.
// Requires confirmed: true if orphanedWork is present.
// Rejects if conflictingTasks are present.
router.post("/changes/:id/rollback", verifyToken, requireProductLead, async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmed } = req.body;

    const tx = await ChangeTransaction.findById(id);
    if (!tx) {
      return res.status(404).json({ success: false, error: "Change transaction not found" });
    }

    if (tx.status === "rolled_back") {
      return res.status(400).json({
        success: false,
        error: "This change transaction has already been rolled back.",
      });
    }

    // 1. Fetch live tasks and active transactions
    const tasks = await Task.find({ project_id: tx.project_id });
    const activeTx = await ChangeTransaction.find({
      project_id: tx.project_id,
      status: "applied",
    }).lean();

    const impact = calculateRollbackImpact(tx.toObject(), tasks, activeTx);

    // 2. Hard block if conflicting tasks exist
    if (!impact.canRollback || impact.conflictingTasks.length > 0) {
      tx.rollback_blocked_reason = impact.blockReason;
      await tx.save();

      return res.status(409).json({
        success: false,
        error: impact.blockReason || "Rollback is blocked due to conflicting task modifications.",
        conflictingTasks: impact.conflictingTasks,
      });
    }

    // 3. Warning gate: if orphaned completed work exists, require explicit confirmation
    if (impact.orphanedWork.length > 0 && confirmed !== true) {
      return res.status(400).json({
        success: false,
        requiresConfirmation: true,
        error: `${impact.orphanedWork.length} task(s) completed under this scope change would be orphaned. Explicit confirmation required.`,
        orphanedWork: impact.orphanedWork,
      });
    }

    // 4. Revert tasks_added: completed tasks become archived, incomplete are deleted
    for (const addedId of tx.tasks_added || []) {
      const task = tasks.find((t) => t._id.toString() === addedId.toString());
      if (!task) continue;

      if (task.status === "completed") {
        task.title = `[Orphaned Archive] ${task.title}`;
        task.status = "completed";
        await task.save();
      } else {
        await Task.deleteOne({ _id: task._id });
      }
    }

    // 5. Revert tasks_modified: restore to 'before' snapshot
    for (const mod of tx.tasks_modified || []) {
      const task = await Task.findById(mod.taskId);
      if (!task) continue;

      const before = mod.before || {};
      if (before.title !== undefined) task.title = before.title;
      if (before.description !== undefined) task.description = before.description;
      if (before.estimate_hours !== undefined) task.estimate_hours = before.estimate_hours;
      if (before.assignee_ids !== undefined) task.assignee_ids = before.assignee_ids;

      await task.save();
    }

    // 6. Revert PRD to prd_version_before
    const targetPrd = await PRD.findOne({
      project_id: tx.project_id,
      version: tx.prd_version_before,
    });

    if (targetPrd) {
      // Supersede current approved PRD
      await PRD.updateMany(
        { project_id: tx.project_id, status: "approved" },
        { status: "superseded" }
      );
      targetPrd.status = "approved";
      targetPrd.superseded_by = null;
      await targetPrd.save();
    }

    const userId = getUserId(req);

    // 7. Update transaction status
    tx.status = "rolled_back";
    tx.rolled_back_at = new Date();
    tx.rolled_back_by = userId;
    tx.rollback_blocked_reason = null;
    await tx.save();

    await AuditLog.record({
      actorId: userId,
      action: "SCOPE_CHANGE_ROLLED_BACK",
      entityType: "ChangeTransaction",
      entityId: tx._id.toString(),
      projectId: tx.project_id.toString(),
      before: { status: "applied", prd_version: tx.prd_version_after },
      after: { status: "rolled_back", prd_version: tx.prd_version_before },
    });

    res.json({
      success: true,
      message: "Scope change successfully rolled back.",
      changeTransaction: tx,
      revertedPrdVersion: tx.prd_version_before,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
