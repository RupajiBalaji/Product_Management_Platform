/**
 * Pure Logic Module: 3-Day Slippage & Repeated QA-Rejection Loop Detection
 * NO DB calls inside these functions — pure computational functions operating on passed data.
 */

/**
 * calculatePartialWorkStreak(recentSubmissions)
 * @param {Array<{ date?: string, hours_logged?: number, hours_estimated?: number, is_complete: boolean }>} recentSubmissions
 * Ordered most recent first.
 * Determines consecutive-day streak where is_complete is false (partial work rolled to next day).
 * A completed day in the middle (is_complete: true) resets the streak.
 * @returns {{ streakDays: number, level: "normal" | "warning" | "escalation" }}
 */
function calculatePartialWorkStreak(recentSubmissions) {
  if (!Array.isArray(recentSubmissions) || recentSubmissions.length === 0) {
    return { streakDays: 0, level: "normal" };
  }

  let streakDays = 0;
  for (let i = 0; i < recentSubmissions.length; i++) {
    const entry = recentSubmissions[i];
    if (!entry) continue;

    // Check if work is complete
    if (entry.is_complete === false) {
      streakDays++;
    } else if (entry.is_complete === true) {
      // Completed day in the middle resets/terminates the consecutive streak
      break;
    }
  }

  let level = "normal";
  if (streakDays >= 3) {
    level = "escalation";
  } else if (streakDays === 2) {
    level = "warning";
  } else {
    level = "normal";
  }

  return { streakDays, level };
}

/**
 * calculateRepeatedRejectionLoop(submissionHistory)
 * @param {Array<{ status: string, created_at?: string|Date, ai_verdict?: any, appeal?: any, appeal_status?: string }>} submissionHistory
 * Ordered by created_at (ascending chronological, ending at the most recent).
 * Counts consecutive "rejected" statuses at the end of the array.
 * A single "approved" or "overridden" breaks the streak.
 * @returns {{ rejectionStreak: number, triggersAlert: boolean }}
 */
function calculateRepeatedRejectionLoop(submissionHistory) {
  if (!Array.isArray(submissionHistory) || submissionHistory.length === 0) {
    return { rejectionStreak: 0, triggersAlert: false };
  }

  let rejectionStreak = 0;
  for (let i = submissionHistory.length - 1; i >= 0; i--) {
    const sub = submissionHistory[i];
    if (!sub) continue;

    const status = sub.status || "";
    const isOverridden =
      status === "overridden" ||
      sub.appeal_status === "overridden" ||
      (sub.appeal && sub.appeal.status === "overridden");

    if (status === "approved" || isOverridden) {
      // A single "approved" or "overridden" breaks the streak
      break;
    } else if (status === "rejected") {
      rejectionStreak++;
    } else {
      // Any non-rejected status (e.g. pending_review) breaks the rejection streak
      break;
    }
  }

  const triggersAlert = rejectionStreak >= 3;
  return { rejectionStreak, triggersAlert };
}

/**
 * buildEscalationAlert(type, data)
 * Builds a structured alert object for frontend card rendering and notifications.
 * @param {"partial_work_streak" | "repeated_qa_rejection"} type
 * @param {object} data
 * @returns {object}
 */
function buildEscalationAlert(type, data = {}) {
  if (type === "partial_work_streak") {
    const streakDays = data.day_count ?? data.streakDays ?? 3;
    const level = data.level || (streakDays >= 3 ? "escalation" : streakDays === 2 ? "warning" : "normal");
    const employeeName = data.employee_name || data.employee_id || data.user_id || "Employee";
    const projectTitle = data.project_title || data.project_name || "Project";
    const cumulativeHours = Number(data.cumulative_slippage_hours || 0);

    return {
      type: "partial_work_streak",
      level,
      streakDays,
      employee_id: data.employee_id || data.user_id,
      employee_name: employeeName,
      project_id: data.project_id,
      project_title: projectTitle,
      cumulative_slippage_hours: cumulativeHours,
      downstream_impact:
        data.downstream_impact ||
        `3-day partial work streak by ${employeeName} on ${projectTitle}. Estimated ${cumulativeHours} cumulative slippage hours threatening downstream milestones.`,
      resolution_options: [
        "Reassign overflow",
        "Schedule 1-on-1",
        "Extend milestone",
      ],
    };
  }

  if (type === "repeated_qa_rejection") {
    const rejectionStreak = data.rejection_count ?? data.rejectionStreak ?? 3;
    const level = data.level || (rejectionStreak >= 3 ? "escalation" : rejectionStreak === 2 ? "warning" : "normal");
    const taskTitle = data.task_title || data.task_name || "Task";
    const employeeName = data.employee_name || data.employee_id || data.user_id || "Employee";
    const projectTitle = data.project_title || data.project_name || "Project";

    let rejectionReasons = data.rejection_reasons || [];
    if (!rejectionReasons.length && Array.isArray(data.submissions)) {
      rejectionReasons = data.submissions
        .filter((s) => s.status === "rejected")
        .map((s) => s.ai_verdict?.reasoning || s.notes || "DoD criteria not met")
        .slice(-3);
    }

    let appealJustifications = data.appeal_justifications || [];
    if (!appealJustifications.length && Array.isArray(data.appeals)) {
      appealJustifications = data.appeals.map((a) => a.justification).filter(Boolean);
    }

    return {
      type: "repeated_qa_rejection",
      level,
      rejectionStreak,
      task_id: data.task_id,
      task_title: taskTitle,
      project_id: data.project_id,
      project_title: projectTitle,
      employee_id: data.employee_id || data.user_id,
      employee_name: employeeName,
      rejection_reasons: rejectionReasons,
      appeal_justifications: appealJustifications,
      total_hours_consumed: Number(data.total_hours_consumed || data.cumulative_slippage_hours || 0),
      downstream_impact:
        data.downstream_impact ||
        `Task "${taskTitle}" rejected ${rejectionStreak} consecutive times by QA gate. Core deliverable blocked.`,
      resolution_options: [
        "Schedule clarification session",
        "Reassign to experienced teammate",
        "Simplify acceptance criteria",
      ],
    };
  }

  throw new Error(`Unsupported alert trigger type: ${type}`);
}

module.exports = {
  calculatePartialWorkStreak,
  calculateRepeatedRejectionLoop,
  buildEscalationAlert,
};
