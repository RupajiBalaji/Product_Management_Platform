const cron = require("node-cron");
const { Project, Task, DailyLog } = require("../models/models");
const Submission = require("../models/Submission");
const SlippageEvent = require("../models/SlippageEvent");
const Notification = require("../models/Notification");
const User = require("../models/User");
const {
  calculatePartialWorkStreak,
  calculateRepeatedRejectionLoop,
  buildEscalationAlert,
} = require("../lib/slippageDetection");

/**
 * Executes automated slippage & QA rejection loop detection.
 * Can be called programmatically, via cron, or via internal REST endpoint.
 */
async function runSlippageCheck() {
  console.log("🔍 [Slippage Engine] Running automated slippage & QA rejection check...");

  const activeProjects = await Project.find({
    status: { $in: ["active", "in-review"] },
  }).lean();

  const results = {
    projectsScanned: activeProjects.length,
    partialWorkStreaksDetected: 0,
    rejectionLoopsDetected: 0,
    newEventsCreated: 0,
  };

  const fallbackLead = await User.findOne({ user_type: "product_lead" }).lean();
  const defaultLeadId = fallbackLead ? fallbackLead.uid : "product_lead";

  for (const project of activeProjects) {
    const projectLeadId = project.created_by || defaultLeadId;

    // Collect all employees assigned to this project
    const memberIds = new Set(project.member_ids || []);
    if (Array.isArray(project.team_allocations)) {
      project.team_allocations.forEach((alloc) => {
        if (alloc.user_id) memberIds.add(alloc.user_id);
      });
    }

    const tasks = await Task.find({ project_id: project._id }).lean();
    const taskIds = tasks.map((t) => t._id);

    // ─── 1. Check Partial Work Streaks per Assigned Employee ───────────────
    for (const employeeId of memberIds) {
      const submissions = await Submission.find({
        employee_id: employeeId,
        task_id: { $in: taskIds },
      })
        .sort({ created_at: -1 })
        .limit(10)
        .lean();

      const dailyLogs = await DailyLog.find({
        user_id: employeeId,
        project_id: project._id,
      })
        .sort({ log_date: -1 })
        .limit(10)
        .lean();

      const recentWorkEntries = [];

      if (submissions.length > 0) {
        submissions.forEach((sub) => {
          recentWorkEntries.push({
            date: sub.created_at,
            hours_logged: 8,
            hours_estimated: 8,
            is_complete: sub.status === "approved",
          });
        });
      } else if (dailyLogs.length > 0) {
        dailyLogs.forEach((log) => {
          recentWorkEntries.push({
            date: log.log_date,
            hours_logged: 8,
            hours_estimated: 8,
            is_complete: !log.has_worked || log.no_work_reason ? false : false,
          });
        });
      }

      const { streakDays, level } = calculatePartialWorkStreak(recentWorkEntries);

      if (level === "escalation" || streakDays >= 3) {
        results.partialWorkStreaksDetected++;

        // Avoid duplicate alerts for same user+project+trigger_type
        const existingEvent = await SlippageEvent.findOne({
          user_id: employeeId,
          project_id: project._id,
          trigger_type: "partial_work_streak",
          resolved: false,
        });

        if (!existingEvent) {
          const employeeUser = await User.findOne({ uid: employeeId }).lean();
          const employeeName = employeeUser ? employeeUser.full_name : employeeId;

          const alertData = buildEscalationAlert("partial_work_streak", {
            employee_id: employeeId,
            employee_name: employeeName,
            project_id: project._id,
            project_title: project.title,
            streakDays,
            level: "escalation",
            cumulative_slippage_hours: streakDays * 4,
          });

          const newEvent = await SlippageEvent.create({
            user_id: employeeId,
            project_id: project._id,
            trigger_type: "partial_work_streak",
            day_count: streakDays,
            level: "escalation",
            cumulative_slippage_hours: alertData.cumulative_slippage_hours,
            downstream_impact: alertData.downstream_impact,
            resolution_options_presented: alertData.resolution_options,
            resolved: false,
          });

          results.newEventsCreated++;

          await Notification.create({
            recipient_id: projectLeadId,
            title: `3-Day Slippage Escalation: ${employeeName}`,
            message: alertData.downstream_impact,
            type: "slippage_escalation",
            entity_id: newEvent._id,
            entity_type: "SlippageEvent",
          });
        }
      }
    }

    // ─── 2. Check Repeated QA Rejection Loops per Task with 3+ Submissions ─
    for (const task of tasks) {
      const taskSubmissions = await Submission.find({ task_id: task._id })
        .sort({ created_at: 1 })
        .lean();

      if (taskSubmissions.length >= 3) {
        const { rejectionStreak, triggersAlert } = calculateRepeatedRejectionLoop(taskSubmissions);

        if (triggersAlert) {
          results.rejectionLoopsDetected++;

          const primaryAssignee =
            (task.assignee_ids && task.assignee_ids[0]) ||
            taskSubmissions[taskSubmissions.length - 1].employee_id;

          const existingEvent = await SlippageEvent.findOne({
            task_id: task._id,
            project_id: project._id,
            trigger_type: "repeated_qa_rejection",
            resolved: false,
          });

          if (!existingEvent) {
            const employeeUser = await User.findOne({ uid: primaryAssignee }).lean();
            const employeeName = employeeUser ? employeeUser.full_name : primaryAssignee;

            const alertData = buildEscalationAlert("repeated_qa_rejection", {
              task_id: task._id,
              task_title: task.title,
              project_id: project._id,
              project_title: project.title,
              employee_id: primaryAssignee,
              employee_name: employeeName,
              rejectionStreak,
              submissions: taskSubmissions,
              total_hours_consumed: task.logged_hours || rejectionStreak * 4,
            });

            const newEvent = await SlippageEvent.create({
              user_id: primaryAssignee,
              project_id: project._id,
              task_id: task._id,
              trigger_type: "repeated_qa_rejection",
              rejection_count: rejectionStreak,
              level: "escalation",
              cumulative_slippage_hours: alertData.total_hours_consumed,
              downstream_impact: alertData.downstream_impact,
              resolution_options_presented: alertData.resolution_options,
              resolved: false,
            });

            results.newEventsCreated++;

            await Notification.create({
              recipient_id: projectLeadId,
              title: `QA Rejection Loop Escalation: ${task.title}`,
              message: alertData.downstream_impact,
              type: "qa_rejection_loop",
              entity_id: newEvent._id,
              entity_type: "SlippageEvent",
            });
          }
        }
      }
    }
  }

  console.log(`✅ [Slippage Engine] Check finished. New events created: ${results.newEventsCreated}`);
  return results;
}

/**
 * Initializes the node-cron scheduled job (runs daily at 00:05).
 */
function startSlippageCron() {
  console.log("⏰ [Slippage Engine] Initializing daily cron schedule ('5 0 * * *')...");
  return cron.schedule("5 0 * * *", async () => {
    try {
      await runSlippageCheck();
    } catch (err) {
      console.error("❌ [Cron] Failed to run automated slippage check:", err);
    }
  });
}

module.exports = {
  runSlippageCheck,
  startSlippageCron,
};
