const express = require("express");
const router = express.Router();

const { Project, Task, DailyLog } = require("../models/models");
const User = require("../models/User");
const SlippageEvent = require("../models/SlippageEvent");
const Appeal = require("../models/Appeal");
const Submission = require("../models/Submission");
const ActionRequest = require("../models/ActionRequest");
const AuditLog = require("../models/AuditLog");

const {
  verifyToken,
  requireLeadOrArchitect,
  requireProductLead,
} = require("../middleware/auth");

const {
  calculateProjectCost,
  calculateBudgetBurn,
  calculateProjectHealth,
} = require("../lib/costCalculator");

const {
  getEmployeeGlobalAllocation,
  normalizePriorityServer,
} = require("../lib/capacityRegistry");

// ─── GET /api/portfolio/dashboard ─────────────────────────────────────────────
// Executive Multi-Project Portfolio Dashboard
// Access: product_lead and lead_architect
// NOTE: Confidential financial fields (budget, cost rates) are strictly
// omitted when requester is NOT a product_lead.
router.get("/dashboard", verifyToken, requireLeadOrArchitect, async (req, res) => {
  try {
    const isProductLead = req.userType === "product_lead" || req.userType === "pm";

    // 1. Portfolio-level aggregated pending actions
    const [totalUnresolvedSlippage, totalPendingAppeals, totalPendingClarifications] =
      await Promise.all([
        SlippageEvent.countDocuments({ resolved: false }),
        Appeal.countDocuments({ status: "pending" }),
        ActionRequest.countDocuments({ status: "pending_clarification" }),
      ]);

    const summary = {
      unresolvedSlippage: totalUnresolvedSlippage,
      pendingAppeals: totalPendingAppeals,
      pendingClarifications: totalPendingClarifications,
      totalPendingActions:
        totalUnresolvedSlippage + totalPendingAppeals + totalPendingClarifications,
    };

    // 2. Fetch projects (active, in-review, completed, frozen, archived)
    const projects = await Project.find({
      status: { $in: ["active", "in-review", "completed", "frozen", "archived"] },
    })
      .sort({ created_at: -1 })
      .lean();

    summary.totalProjects = projects.length;

    // 3. Process each project
    const projectCards = await Promise.all(
      projects.map(async (proj) => {
        const projectId = proj._id;

        // Fetch project tasks
        const tasks = await Task.find({ project_id: projectId }).lean();
        const taskIds = tasks.map((t) => t._id);

        // Fetch pending action counts for this project
        const [projSlippageEvents, projSubmissions, projClarificationsCount] =
          await Promise.all([
            SlippageEvent.find({ project_id: projectId, resolved: false }).lean(),
            Submission.find({ task_id: { $in: taskIds } }, "_id").lean(),
            ActionRequest.countDocuments({
              project_id: projectId,
              status: "pending_clarification",
            }),
          ]);

        const submissionIds = projSubmissions.map((s) => s._id);
        const projPendingAppealsCount =
          submissionIds.length > 0
            ? await Appeal.countDocuments({
                submission_id: { $in: submissionIds },
                status: "pending",
              })
            : 0;

        const pendingActions = {
          unresolvedSlippage: projSlippageEvents.length,
          pendingAppeals: projPendingAppealsCount,
          pendingClarifications: projClarificationsCount,
          total:
            projSlippageEvents.length +
            projPendingAppealsCount +
            projClarificationsCount,
        };

        // Task statistics for health & burn calculation
        const totalEstimatedHours = tasks.reduce(
          (sum, t) => sum + (Number(t.estimate_hours) || 0),
          0
        );
        const totalHoursCompleted = tasks
          .filter((t) => t.status === "completed")
          .reduce((sum, t) => sum + (Number(t.estimate_hours) || 0), 0);
        const tasksOverEstimate = tasks.filter((t) => {
          const est = Number(t.estimate_hours) || 0;
          const logged = Number(t.logged_hours) || 0;
          return est > 0 && logged >= est * 1.5;
        });

        // Actual hours logged by user
        const dailyLogs =
          taskIds.length > 0
            ? await DailyLog.find({ task_id: { $in: taskIds } }).lean()
            : [];
        const actualHoursLoggedByUser = {};
        dailyLogs.forEach((log) => {
          const uId = String(log.user_id);
          actualHoursLoggedByUser[uId] =
            (actualHoursLoggedByUser[uId] || 0) + (Number(log.hours) || 0);
        });

        // If no DailyLogs exist yet but tasks have logged_hours, attribute to assignees
        if (dailyLogs.length === 0) {
          tasks.forEach((t) => {
            const logged = Number(t.logged_hours) || 0;
            if (logged > 0 && Array.isArray(t.assignee_ids) && t.assignee_ids.length > 0) {
              const perAssignee = logged / t.assignee_ids.length;
              t.assignee_ids.forEach((aId) => {
                const uId = String(aId);
                actualHoursLoggedByUser[uId] =
                  (actualHoursLoggedByUser[uId] || 0) + perAssignee;
              });
            }
          });
        }

        // Fetch team members with cost rates
        const memberIds = (proj.member_ids || []).map(String);
        const members =
          memberIds.length > 0
            ? await User.find({ _id: { $in: memberIds } }).lean()
            : [];
        const hourlyRates = {};
        members.forEach((m) => {
          hourlyRates[String(m._id)] = Number(m.hourly_cost_rate) || 0;
        });

        // Determine authorized budgeted cost
        let budgetedCost = proj.budgeted_cost;
        if (budgetedCost === null || budgetedCost === undefined) {
          const calculated = calculateProjectCost(proj.team_allocations, hourlyRates);
          budgetedCost = calculated.totalBudgetedCost;
        }

        // Budget Burn calculation
        const budgetBurn = calculateBudgetBurn(
          budgetedCost,
          actualHoursLoggedByUser,
          hourlyRates,
          1.0,
          totalEstimatedHours,
          totalHoursCompleted
        );

        // Health calculation
        const health = calculateProjectHealth(
          projSlippageEvents,
          tasksOverEstimate,
          budgetBurn.status
        );

        const projectItem = {
          id: String(proj._id),
          _id: proj._id,
          title: proj.title,
          description: proj.description || "",
          priority: normalizePriorityServer(proj.priority),
          status: proj.status,
          totalTasks: tasks.length,
          completedTasks: tasks.filter((t) => t.status === "completed").length,
          pendingActions,
          health,
        };

        // CONFIDENTIAL: Only attach budget snapshot if requester is product_lead
        if (isProductLead) {
          projectItem.budget = {
            budgetedCost: budgetBurn.actualCostBurned + budgetBurn.remainingBudget,
            actualCostBurned: budgetBurn.actualCostBurned,
            remainingBudget: budgetBurn.remainingBudget,
            projectedFinalCost: budgetBurn.projectedFinalCost,
            burnPct: budgetBurn.burnPct,
            status: budgetBurn.status,
          };
        }

        return projectItem;
      })
    );

    res.json({
      success: true,
      summary,
      projects: projectCards,
    });
  } catch (err) {
    console.error("GET /api/portfolio/dashboard error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/portfolio/utilization-heatmap ──────────────────────────────────
// Returns a flat list of employee allocations suitable for a stacked heatmap visualization
// Access: product_lead and lead_architect
router.get(
  "/utilization-heatmap",
  verifyToken,
  requireLeadOrArchitect,
  async (req, res) => {
    try {
      // Find all contributors and lead architects
      const employees = await User.find({
        user_type: { $in: ["employee", "lead_architect"] },
        status: "active",
      })
        .sort({ full_name: 1 })
        .lean();

      const heatmap = await Promise.all(
        employees.map(async (emp) => {
          const alloc = await getEmployeeGlobalAllocation(emp._id);

          const projectSegments = (alloc.projects || []).map((p) => ({
            projectId: p.projectId,
            title: p.projectTitle,
            dailyHours: p.dailyHours,
            priority: p.priority,
          }));

          return {
            userId: String(emp._id),
            name: emp.full_name || emp.email,
            role_title: emp.role_title,
            projects: projectSegments,
            totalDailyHours: alloc.totalDailyHours,
            dailyCap: alloc.dailyCap,
            utilizationPct: alloc.utilizationPct,
            isOverAllocated: alloc.isOverAllocated,
          };
        })
      );

      res.json({
        success: true,
        heatmap,
      });
    } catch (err) {
      console.error("GET /api/portfolio/utilization-heatmap error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── GET /api/portfolio/projects/:id/budget ──────────────────────────────────
// Full budget burn detail for a single project
// Access: product_lead only (403 for lead_architect and employee)
router.get(
  "/projects/:id/budget",
  verifyToken,
  requireProductLead,
  async (req, res) => {
    try {
      const { id } = req.params;
      const proj = await Project.findById(id).lean();
      if (!proj) {
        return res.status(404).json({ success: false, error: "Project not found" });
      }

      const tasks = await Task.find({ project_id: id }).lean();
      const taskIds = tasks.map((t) => t._id);

      const totalEstimatedHours = tasks.reduce(
        (sum, t) => sum + (Number(t.estimate_hours) || 0),
        0
      );
      const totalHoursCompleted = tasks
        .filter((t) => t.status === "completed")
        .reduce((sum, t) => sum + (Number(t.estimate_hours) || 0), 0);

      const dailyLogs =
        taskIds.length > 0
          ? await DailyLog.find({ task_id: { $in: taskIds } }).lean()
          : [];

      const actualHoursLoggedByUser = {};
      dailyLogs.forEach((log) => {
        const uId = String(log.user_id);
        actualHoursLoggedByUser[uId] =
          (actualHoursLoggedByUser[uId] || 0) + (Number(log.hours) || 0);
      });

      // Fallback if logs empty
      if (dailyLogs.length === 0) {
        tasks.forEach((t) => {
          const logged = Number(t.logged_hours) || 0;
          if (logged > 0 && Array.isArray(t.assignee_ids)) {
            const per = logged / (t.assignee_ids.length || 1);
            t.assignee_ids.forEach((aId) => {
              const uId = String(aId);
              actualHoursLoggedByUser[uId] =
                (actualHoursLoggedByUser[uId] || 0) + per;
            });
          }
        });
      }

      const memberIds = (proj.member_ids || []).map(String);
      const members =
        memberIds.length > 0
          ? await User.find({ _id: { $in: memberIds } }).lean()
          : [];

      const hourlyRates = {};
      members.forEach((m) => {
        hourlyRates[String(m._id)] = Number(m.hourly_cost_rate) || 0;
      });

      let budgetedCost = proj.budgeted_cost;
      const initialCostEst = calculateProjectCost(proj.team_allocations, hourlyRates);
      if (budgetedCost === null || budgetedCost === undefined) {
        budgetedCost = initialCostEst.totalBudgetedCost;
      }

      const burn = calculateBudgetBurn(
        budgetedCost,
        actualHoursLoggedByUser,
        hourlyRates,
        1.0,
        totalEstimatedHours,
        totalHoursCompleted
      );

      // Construct detailed member breakdown
      const memberBreakdown = members.map((m) => {
        const uId = String(m._id);
        const rate = Number(m.hourly_cost_rate) || 0;
        const hoursLogged = Math.round((actualHoursLoggedByUser[uId] || 0) * 10) / 10;
        const cost = Math.round(hoursLogged * rate * 100) / 100;
        const alloc = (proj.team_allocations || []).find(
          (a) => String(a.user_id) === uId
        );

        return {
          userId: uId,
          name: m.full_name || m.email,
          role_title: m.role_title,
          rate,
          hoursLogged,
          dailyHoursAllocated: alloc?.daily_hours || 0,
          costBurned: cost,
        };
      });

      res.json({
        success: true,
        projectId: String(proj._id),
        projectTitle: proj.title,
        budgetedCost,
        actualCostBurned: burn.actualCostBurned,
        remainingBudget: burn.remainingBudget,
        projectedFinalCost: burn.projectedFinalCost,
        burnPct: burn.burnPct,
        status: burn.status,
        totalEstimatedHours,
        totalHoursCompleted,
        teamAllocations: initialCostEst.breakdown,
        memberBreakdown,
      });
    } catch (err) {
      console.error("GET /api/portfolio/projects/:id/budget error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── PATCH /api/portfolio/users/:id/cost-rate ────────────────────────────────
// Update employee hourly cost rate
// Access: product_lead only
// Records sensitive AuditLog event
router.patch(
  "/users/:id/cost-rate",
  verifyToken,
  requireProductLead,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { hourly_cost_rate } = req.body;

      if (hourly_cost_rate === undefined || hourly_cost_rate === null || isNaN(Number(hourly_cost_rate))) {
        return res.status(400).json({
          success: false,
          error: "hourly_cost_rate must be a valid positive number",
        });
      }

      const rateNum = Math.max(0, Number(hourly_cost_rate));
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const previousRate = user.hourly_cost_rate || 0;
      user.hourly_cost_rate = rateNum;
      await user.save();

      // Record sensitive compensation audit log
      await AuditLog.record({
        actorId: req.uid,
        action: "COST_RATE_UPDATED",
        entityType: "User",
        entityId: String(user._id),
        before: { hourly_cost_rate: previousRate },
        after: { hourly_cost_rate: rateNum },
      });

      res.json({
        success: true,
        message: `Hourly cost rate updated to $${rateNum}/hr.`,
        user: {
          id: user._id,
          email: user.email,
          full_name: user.full_name,
          hourly_cost_rate: user.hourly_cost_rate,
        },
      });
    } catch (err) {
      console.error("PATCH /api/portfolio/users/:id/cost-rate error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

module.exports = router;
