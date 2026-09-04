const cron = require("node-cron");
const { Task, DailyLog } = require("../models/models");
const Notification = require("../models/Notification");

/**
 * Mid-day nudge job for mission-critical (P0) tasks.
 * Checks if any P0 task assigned to an employee has 0 logged hours or no progress today.
 * Dispatches a critical Notification to that employee.
 * Idempotent: guarantees only 1 notification per task per employee per day.
 *
 * @param {string} [todayStr] - Optional date in YYYY-MM-DD format (defaults to current UTC/local day)
 * @returns {Promise<{ scannedTasks: number, nudgesSent: number, skippedAlreadyLogged: number, skippedAlreadyNudged: number }>}
 */
async function runMiddayPriorityNudge(todayStr) {
  const today = todayStr || new Date().toISOString().split("T")[0];
  console.log(`⏰ [P0 Nudge Engine] Checking for unlogged P0 tasks on date: ${today}...`);

  // Find all active P0 tasks
  const p0Tasks = await Task.find({
    computed_priority: "P0",
    status: { $nin: ["completed", "done"] },
  }).lean();

  const results = {
    scannedTasks: p0Tasks.length,
    nudgesSent: 0,
    skippedAlreadyLogged: 0,
    skippedAlreadyNudged: 0,
  };

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  for (const task of p0Tasks) {
    const assigneeIds = Array.isArray(task.assignee_ids) ? task.assignee_ids : [];

    for (const employeeId of assigneeIds) {
      if (!employeeId) continue;

      // 1. Check if the employee already logged work on this task today
      const existingLog = await DailyLog.findOne({
        task_id: task._id,
        user_id: employeeId,
        log_date: today,
        has_worked: true,
      }).lean();

      if (existingLog) {
        results.skippedAlreadyLogged++;
        continue;
      }

      // 2. Idempotency check: did we already nudge this employee for this task today?
      const existingNotification = await Notification.findOne({
        recipient_id: employeeId,
        type: "midday_p0_nudge",
        entity_id: task._id,
        created_at: { $gte: dayStart, $lte: dayEnd },
      }).lean();

      if (existingNotification) {
        results.skippedAlreadyNudged++;
        continue;
      }

      // 3. Dispatch critical P0 midday nudge
      await Notification.create({
        recipient_id: employeeId,
        title: `URGENT: Mission-Critical Task [${task.title}] has no logged activity today`,
        message: `Task "${task.title}" is flagged P0 (blocking downstream deliverables or on the critical path). Please update your progress or flag blockers immediately.`,
        type: "midday_p0_nudge",
        entity_id: task._id,
        entity_type: "Task",
      });

      results.nudgesSent++;
      console.log(`⚠️ [P0 Nudge] Dispatched midday nudge to user ${employeeId} for task "${task.title}"`);
    }
  }

  console.log(`✅ [P0 Nudge Engine] Completed. Nudges sent: ${results.nudgesSent}`);
  return results;
}

/**
 * Starts the daily node-cron schedule at 12:00 PM ('0 12 * * *').
 */
function startPriorityNudgeCron() {
  console.log("⏰ [P0 Nudge Engine] Initializing midday cron schedule ('0 12 * * *')...");
  return cron.schedule("0 12 * * *", async () => {
    try {
      await runMiddayPriorityNudge();
    } catch (err) {
      console.error("❌ [Cron] Failed to run midday priority nudge:", err);
    }
  });
}

module.exports = {
  runMiddayPriorityNudge,
  startPriorityNudgeCron,
};
