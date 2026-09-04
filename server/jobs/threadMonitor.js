const cron = require("node-cron");
const TeamChannel = require("../models/TeamChannel");
const { Project } = require("../models/models");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const { detectUnresolvedDisagreement } = require("../lib/threadMonitor");

/**
 * Periodically scans TeamChannel threads across all projects for unresolved disagreements
 * that have gone stale (default >= 24h).
 *
 * If flagged:
 *   - Stamped with flagged_for_review: true, flagged_reason, suggested_resolution
 *   - Dispatches a critical Notification to the Project Lead
 *   - Emits an append-only AuditLog record
 *
 * @param {number} [hoursThreshold=24]
 * @returns {Promise<{ scannedChannels: number, scannedThreads: number, flaggedCount: number }>}
 */
async function runThreadDisagreementMonitor(hoursThreshold = 24) {
  console.log(`🔍 [Thread Monitor] Scanning team channels for unresolved disputes (threshold: ${hoursThreshold}h)...`);

  const channels = await TeamChannel.find({});
  const results = {
    scannedChannels: channels.length,
    scannedThreads: 0,
    flaggedCount: 0,
  };

  for (const channel of channels) {
    if (!channel.threads || channel.threads.length === 0) continue;

    let project = null;
    let channelModified = false;

    for (const thread of channel.threads) {
      results.scannedThreads++;

      // Skip threads that were already reviewed or flagged
      if (thread.flagged_for_review) continue;
      if (!thread.messages || thread.messages.length < 2) continue;

      const verdict = await detectUnresolvedDisagreement(thread.messages, hoursThreshold);
      if (verdict && verdict.hasUnresolvedDisagreement) {
        if (!project) {
          project = await Project.findById(channel.project_id).lean();
        }

        const projectLeadId = project?.created_by || "product_lead";
        const projectTitle = project?.title || "Project";

        thread.flagged_for_review = true;
        thread.flagged_reason = verdict.summary;
        thread.suggested_resolution = verdict.suggestedResolution;
        channelModified = true;
        results.flaggedCount++;

        // 1. Create Notification for Product Lead
        await Notification.create({
          recipient_id: projectLeadId,
          title: `Unresolved Discussion: "${thread.topic}"`,
          message: `Thread "${thread.topic}" in ${projectTitle} has stalled for >= ${hoursThreshold}h with opposing viewpoints: ${verdict.summary}. Suggested resolution: ${verdict.suggestedResolution}`,
          type: "unresolved_disagreement",
          entity_id: thread._id,
          entity_type: "TeamChannel",
        });

        // 2. Record in immutable AuditLog
        await AuditLog.record({
          actorId: "system",
          action: "THREAD_FLAGGED_FOR_DISAGREEMENT",
          entityType: "TeamChannel",
          entityId: String(channel._id),
          after: {
            threadId: String(thread._id),
            projectId: String(channel.project_id),
            topic: thread.topic,
            summary: verdict.summary,
            suggestedResolution: verdict.suggestedResolution,
          },
        });

        console.log(`⚠️ [Thread Monitor] Flagged thread "${thread.topic}" on project ${projectTitle}`);
      }
    }

    if (channelModified) {
      await channel.save();
    }
  }

  console.log(`✅ [Thread Monitor] Finished scan. Flagged ${results.flaggedCount} stale dispute(s).`);
  return results;
}

/**
 * Initializes cron schedule: Runs every 4 hours (at minute 0).
 */
function initThreadMonitorCron() {
  // Run every 4 hours: "0 */4 * * *"
  cron.schedule("0 */4 * * *", async () => {
    try {
      await runThreadDisagreementMonitor(24);
    } catch (err) {
      console.error("❌ [Thread Monitor] Cron execution failed:", err);
    }
  });
  console.log("⏰ [Cron] Thread Disagreement Monitor scheduled: every 4 hours (0 */4 * * *).");
}

module.exports = {
  runThreadDisagreementMonitor,
  initThreadMonitorCron,
};
