const express = require("express");
const router = express.Router();
const PerformanceSnapshot = require("../models/PerformanceSnapshot");
const Notification = require("../models/Notification");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { verifyToken, requireLeadOrArchitect } = require("../middleware/auth");
const { detectTrend } = require("../lib/growthTrajectory");
const { runWeeklyPerformanceSnapshot } = require("../jobs/performanceSnapshotter");

const getUserId = (req) =>
  String(req.uid || req.user?._id || req.user?.id || req.user?.uid || "system");

function canAccessGrowthTrajectory(req, targetUserId) {
  const currentUserId = getUserId(req);
  const isLead = ["product_lead", "lead_architect", "pm", "ceo"].includes(req.userType);
  return isLead || currentUserId === String(targetUserId);
}

// ─── GET /api/growth/alerts/pending ──────────────────────────────────────────
// Product Lead / Lead Architect only.
// Returns active unacknowledged employee growth trend notifications.
router.get("/alerts/pending", verifyToken, requireLeadOrArchitect, async (req, res) => {
  try {
    const rawAlerts = await Notification.find({
      type: "trend_alert",
      acknowledged: { $ne: true },
    })
      .sort({ created_at: -1 })
      .lean();

    // Enrich with PerformanceSnapshot and User details for frontend deep links
    const snapshotIds = rawAlerts.map((a) => a.entity_id).filter(Boolean);
    const snapshots = await PerformanceSnapshot.find({ _id: { $in: snapshotIds } }).lean();
    const snapMap = new Map(snapshots.map((s) => [String(s._id), s]));

    const userIds = snapshots.map((s) => s.user_id).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } })
      .select("full_name role_title email")
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const alerts = rawAlerts.map((a) => {
      const snap = snapMap.get(String(a.entity_id));
      const emp = snap ? userMap.get(String(snap.user_id)) : null;
      return {
        ...a,
        employee_id: snap ? snap.user_id : null,
        employee_name: emp ? emp.full_name : null,
        alert_style: a.message && a.message.includes("improved") ? "positive" : "review",
      };
    });

    return res.json({
      success: true,
      alerts: alerts || [],
    });
  } catch (err) {
    console.error("Error fetching pending growth alerts:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/growth/alerts/:id/acknowledge ─────────────────────────────────
// Product Lead / Lead Architect only.
// Acknowledges a trend alert and marks it reviewed.
router.post("/alerts/:id/acknowledge", verifyToken, requireLeadOrArchitect, async (req, res) => {
  try {
    const { id } = req.params;
    const notif = await Notification.findByIdAndUpdate(
      id,
      { $set: { acknowledged: true, read: true } },
      { new: true }
    );

    if (!notif) {
      return res.status(404).json({ success: false, error: "Alert notification not found" });
    }

    await AuditLog.record({
      actorId: req.uid,
      action: "GROWTH_ALERT_ACKNOWLEDGED",
      entityType: "Notification",
      entityId: id,
      after: {
        title: notif.title,
        message: notif.message,
        acknowledged: true,
      },
    });

    return res.json({
      success: true,
      notification: notif,
    });
  } catch (err) {
    console.error("Error acknowledging growth alert:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/growth/snapshot/trigger ───────────────────────────────────────
// Product Lead / Lead Architect only.
// On-demand trigger to compute and save weekly performance snapshots immediately.
router.post("/snapshot/trigger", verifyToken, requireLeadOrArchitect, async (req, res) => {
  try {
    const { week_ending } = req.body;
    const result = await runWeeklyPerformanceSnapshot({ weekEnding: week_ending });

    await AuditLog.record({
      actorId: req.uid,
      action: "PERFORMANCE_SNAPSHOT_TRIGGERED",
      entityType: "PerformanceSnapshot",
      entityId: week_ending ? new Date(week_ending).toISOString() : "current_week",
      after: {
        processedEmployees: result.processedEmployees,
        snapshotsSaved: result.snapshotsSaved,
        alertsGenerated: result.alertsGenerated,
      },
    });

    return res.json({
      success: true,
      result,
    });
  } catch (err) {
    console.error("Error triggering performance snapshot:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/growth/:userId/chart-data ───────────────────────────────────────
// Self-access or Product Lead / Lead Architect.
// Returns lightweight chronological chart array for line charting.
router.get("/:userId/chart-data", verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!canAccessGrowthTrajectory(req, userId)) {
      return res.status(403).json({
        success: false,
        error: "Access denied. You may only view your own growth trajectory.",
      });
    }

    const snapshots = await PerformanceSnapshot.find({ user_id: userId })
      .sort({ week_ending: 1 })
      .lean();

    const chartData = (snapshots || []).map((s) => ({
      week_ending: s.week_ending ? new Date(s.week_ending).toISOString().split("T")[0] : "",
      on_time_reliability_pct: s.on_time_reliability_pct ?? 100,
      first_pass_quality_pct: s.first_pass_quality_pct ?? 100,
      estimation_accuracy_pct: s.estimation_accuracy_pct ?? 100,
      tasks_completed: s.tasks_completed ?? 0,
    }));

    return res.json({
      success: true,
      chart_data: chartData,
    });
  } catch (err) {
    console.error("Error fetching growth chart data:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/growth/:userId ─────────────────────────────────────────────────
// Self-access or Product Lead / Lead Architect.
// Returns full snapshot history + current 12-week linear regression trend per metric.
router.get("/:userId", verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!canAccessGrowthTrajectory(req, userId)) {
      return res.status(403).json({
        success: false,
        error: "Access denied. You may only view your own growth trajectory.",
      });
    }

    const [user, snapshots] = await Promise.all([
      User.findById(userId).select("full_name email role_title user_type").lean(),
      PerformanceSnapshot.find({ user_id: userId }).sort({ week_ending: 1 }).lean(),
    ]);

    if (!user) {
      return res.status(404).json({ success: false, error: "Employee not found" });
    }

    // Detect trends over trailing 12-week quarter
    const trendOnTime = detectTrend(snapshots, "on_time_reliability_pct", 12);
    const trendQuality = detectTrend(snapshots, "first_pass_quality_pct", 12);
    const trendAccuracy = detectTrend(snapshots, "estimation_accuracy_pct", 12);

    return res.json({
      success: true,
      user_id: userId,
      user: {
        id: user._id,
        full_name: user.full_name,
        role_title: user.role_title,
      },
      snapshots: snapshots || [],
      trends: {
        on_time_reliability: trendOnTime,
        first_pass_quality: trendQuality,
        estimation_accuracy: trendAccuracy,
      },
    });
  } catch (err) {
    console.error("Error fetching employee growth trajectory:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
