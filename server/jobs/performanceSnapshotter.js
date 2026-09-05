const cron = require("node-cron");
const User = require("../models/User");
const { Project, Task } = require("../models/models");
const Submission = require("../models/Submission");
const SlippageEvent = require("../models/SlippageEvent");
const DynamicRole = require("../models/DynamicRole");
const PerformanceSnapshot = require("../models/PerformanceSnapshot");
const Notification = require("../models/Notification");
const {
  calculateTeamPerformance,
  calculateEstimationAccuracy,
} = require("../lib/retrospectiveCalculator");
const {
  detectTrend,
  generateTrendAlert,
  deriveEstimationAccuracy,
} = require("../lib/growthTrajectory");

/**
 * Normalizes a date to the standard week-ending date (Sunday 23:59:59.999 UTC)
 */
function getWeekEndingSunday(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 is Sunday
  const diffToSunday = day === 0 ? 0 : 7 - day;
  d.setUTCDate(d.getUTCDate() + diffToSunday);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * runWeeklyPerformanceSnapshot(options)
 *
 * Runs once weekly (or on-demand):
 * 1. For every employee, computes on-time reliability, first-pass quality,
 *    and estimation accuracy across the trailing week.
 * 2. Saves or updates a PerformanceSnapshot record.
 * 3. Runs detectTrend against that employee's full history for each metric.
 * 4. If generateTrendAlert returns shouldAlert, dispatches a Notification to Product Leads.
 *
 * @param {{ weekEnding?: Date, dryRun?: boolean }} [options={}]
 * @returns {Promise<{ processedEmployees: number, snapshotsSaved: number, alertsGenerated: number }>}
 */
async function runWeeklyPerformanceSnapshot(options = {}) {
  const weekEndingDate = options.weekEnding
    ? new Date(options.weekEnding)
    : getWeekEndingSunday();
  const dryRun = Boolean(options.dryRun);

  // Trailing 7 days window
  const weekStartDate = new Date(weekEndingDate);
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() - 7);
  weekStartDate.setUTCHours(0, 0, 0, 0);

  console.log(
    `📊 [Performance Snapshotter] Computing weekly snapshots for week ending: ${weekEndingDate.toISOString().split("T")[0]}...`
  );

  const [employees, allProjects, dynamicRoles] = await Promise.all([
    User.find({ is_active: { $ne: false } }).lean(),
    Project.find({ status: { $ne: "archived" } }).lean(),
    DynamicRole.find({}).lean(),
  ]);

  // Find product lead users to notify for alerts
  const productLeads = employees.filter(
    (e) => e.user_type === "product_lead" || e.user_type === "pm" || e.user_type === "ceo"
  );
  const leadRecipientIds =
    productLeads.length > 0 ? productLeads.map((pl) => String(pl._id || pl.id)) : ["product_lead"];

  const results = {
    processedEmployees: 0,
    snapshotsSaved: 0,
    alertsGenerated: 0,
  };

  for (const emp of employees) {
    const empId = String(emp._id || emp.id);
    results.processedEmployees++;

    // 1. Fetch tasks assigned to this employee
    const assignedTasks = await Task.find({
      assignee_ids: empId,
    }).lean();

    // Active project IDs for this employee
    const activeProjectIds = [
      ...new Set(assignedTasks.map((t) => String(t.project_id)).filter(Boolean)),
    ];

    // Submissions by this employee
    const empSubmissions = await Submission.find({
      employee_id: empId,
    }).lean();

    // Slippage events for this employee
    const empSlippages = await SlippageEvent.find({
      user_id: empId,
    }).lean();

    // 2. Reuse Phase 11's calculateTeamPerformance
    const teamPerf = calculateTeamPerformance(
      { [empId]: empSubmissions },
      {},
      assignedTasks,
      empSlippages
    );

    const userPerf = teamPerf.find((p) => String(p.userId) === empId) || {
      onTimeReliabilityPct: null,
      firstPassQualityPct: null,
      tasksCompleted: 0,
    };

    // 3. Reuse Phase 11's calculateEstimationAccuracy
    const accuracyRes = calculateEstimationAccuracy(
      assignedTasks,
      dynamicRoles,
      allProjects.flatMap((p) => p.team_allocations || [])
    );

    const empAccuracy = accuracyRes.byEmployee.find((e) => String(e.userId) === empId);
    const rawVariance = empAccuracy ? empAccuracy.variancePct : 0;
    const estAccuracyPct = deriveEstimationAccuracy(rawVariance);

    // Baseline fallback if user has no completed tasks or submissions
    const onTimeReliability =
      userPerf.onTimeReliabilityPct !== null ? userPerf.onTimeReliabilityPct : 100;
    const firstPassQuality =
      userPerf.firstPassQualityPct !== null ? userPerf.firstPassQualityPct : 100;
    const tasksCompleted = userPerf.tasksCompleted || 0;

    if (dryRun) {
      results.snapshotsSaved++;
      continue;
    }

    // 4. Save or update PerformanceSnapshot for this week
    const snapshot = await PerformanceSnapshot.findOneAndUpdate(
      { user_id: empId, week_ending: weekEndingDate },
      {
        $set: {
          on_time_reliability_pct: onTimeReliability,
          first_pass_quality_pct: firstPassQuality,
          estimation_accuracy_pct: estAccuracyPct,
          tasks_completed: tasksCompleted,
          projects_active: activeProjectIds,
        },
      },
      { upsert: true, new: true }
    );
    results.snapshotsSaved++;

    // 5. Fetch full chronological snapshot history for this employee
    const fullHistory = await PerformanceSnapshot.find({ user_id: empId })
      .sort({ week_ending: 1 })
      .lean();

    // 6. Run detectTrend across trailing 12 weeks
    const trendOnTime = detectTrend(fullHistory, "on_time_reliability_pct", 12);
    const trendQuality = detectTrend(fullHistory, "first_pass_quality_pct", 12);
    const trendAccuracy = detectTrend(fullHistory, "estimation_accuracy_pct", 12);

    // 7. Check for meaningful trend alerts
    const alertsToCheck = [
      generateTrendAlert(emp.full_name || "Employee", "on-time delivery", trendOnTime),
      generateTrendAlert(emp.full_name || "Employee", "first-pass quality", trendQuality),
      generateTrendAlert(emp.full_name || "Employee", "estimation accuracy", trendAccuracy),
    ];

    for (const alert of alertsToCheck) {
      if (alert && alert.shouldAlert && alert.message) {
        for (const recipientId of leadRecipientIds) {
          // Avoid duplicate alert notifications for the same week & message
          const existingNotif = await Notification.findOne({
            recipient_id: recipientId,
            entity_id: snapshot._id,
            message: alert.message,
          });

          if (!existingNotif) {
            await Notification.create({
              recipient_id: recipientId,
              title: `Growth Alert: ${emp.full_name}`,
              message: alert.message,
              type: "trend_alert",
              entity_id: snapshot._id,
              entity_type: "PerformanceSnapshot",
              read: false,
              acknowledged: false,
            });
            results.alertsGenerated++;
          }
        }
      }
    }
  }

  console.log(
    `✓ [Performance Snapshotter] Completed: ${results.snapshotsSaved} snapshots saved, ${results.alertsGenerated} alerts generated.`
  );
  return results;
}

/**
 * Initializes the weekly cron schedule (every Sunday at 23:55)
 */
function initPerformanceSnapshotCron() {
  // Cron: '55 23 * * 0' = Every Sunday at 23:55
  cron.schedule("55 23 * * 0", async () => {
    console.log("⏰ [Cron] Starting weekly performance snapshot aggregation...");
    try {
      await runWeeklyPerformanceSnapshot();
    } catch (err) {
      console.error("❌ [Cron] Error running weekly performance snapshotter:", err);
    }
  });
  console.log("📅 [Cron] Performance Snapshotter scheduled (Weekly on Sundays at 23:55).");
}

module.exports = {
  runWeeklyPerformanceSnapshot,
  initPerformanceSnapshotCron,
  getWeekEndingSunday,
};
