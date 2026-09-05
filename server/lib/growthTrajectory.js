/**
 * Pure Calculation Module: Long-Term Employee Growth Trajectory (Phase 13)
 *
 * Provides linear regression trend detection, trajectory classification,
 * meaningful trend alert generation, and estimation accuracy derivation.
 * STRICT REQUIREMENT: Zero database dependencies (100% pure computational logic).
 */

// Meaningful slope threshold: slope magnitude > 0.5 percentage points / week
// represents meaningful upward or downward momentum over a 12-week quarter (~6%+ swing).
const DEFAULT_SLOPE_THRESHOLD = 0.5;

// Alert threshold: at least 15 percentage points net change over the evaluated period
// prevents spamming Product Leads on normal operational noise.
const DEFAULT_ALERT_CHANGE_THRESHOLD = 15;

/**
 * detectTrend(snapshotsChronological, metricKey, windowWeeks)
 *
 * @param {Array<Object>} snapshotsChronological - Historical snapshots sorted oldest-to-newest
 * @param {string} metricKey - Key to analyze (e.g. "on_time_reliability_pct")
 * @param {number} windowWeeks - Trailing window size in weeks (defaults to 12)
 * @returns {{
 *   trend: "improving" | "declining" | "stable",
 *   slopePerWeek: number,
 *   startValue: number | null,
 *   endValue: number | null,
 *   changeOverPeriod: number,
 *   dataPointsCount: number,
 *   note?: string
 * }}
 */
function detectTrend(snapshotsChronological = [], metricKey, windowWeeks = 12) {
  if (!Array.isArray(snapshotsChronological) || !metricKey) {
    return {
      trend: "stable",
      slopePerWeek: 0,
      startValue: null,
      endValue: null,
      changeOverPeriod: 0,
      dataPointsCount: 0,
      note: "No valid snapshot data provided",
    };
  }

  // Extract valid numeric values in chronological order
  const validPoints = [];
  for (const s of snapshotsChronological) {
    if (!s) continue;
    const rawVal = s[metricKey] !== undefined ? s[metricKey] : s?._doc?.[metricKey];
    if (rawVal !== null && rawVal !== undefined) {
      const num = Number(rawVal);
      if (!isNaN(num)) {
        validPoints.push(num);
      }
    }
  }

  // Take the trailing windowWeeks (or all available if fewer)
  const windowPoints = validPoints.slice(-windowWeeks);
  const n = windowPoints.length;

  if (n < 2) {
    const singleVal = n === 1 ? windowPoints[0] : null;
    return {
      trend: "stable",
      slopePerWeek: 0,
      startValue: singleVal,
      endValue: singleVal,
      changeOverPeriod: 0,
      dataPointsCount: n,
      note: "Insufficient data points for trend analysis (requires at least 2)",
    };
  }

  // Linear Regression: y = slope * x + intercept, where x = 0, 1, ..., n - 1
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += windowPoints[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const xDiff = i - meanX;
    const yDiff = windowPoints[i] - meanY;
    numerator += xDiff * yDiff;
    denominator += xDiff * xDiff;
  }

  const rawSlope = denominator === 0 ? 0 : numerator / denominator;
  const slopePerWeek = Math.round(rawSlope * 100) / 100;

  const startValue = windowPoints[0];
  const endValue = windowPoints[n - 1];
  const changeOverPeriod = Math.round((endValue - startValue) * 10) / 10;

  // Classify trend based on slope magnitude threshold
  let trend = "stable";
  if (slopePerWeek > DEFAULT_SLOPE_THRESHOLD) {
    trend = "improving";
  } else if (slopePerWeek < -DEFAULT_SLOPE_THRESHOLD) {
    trend = "declining";
  }

  return {
    trend,
    slopePerWeek,
    startValue,
    endValue,
    changeOverPeriod,
    dataPointsCount: n,
  };
}

/**
 * generateTrendAlert(userName, metricLabel, trendResult, options)
 *
 * Generates an executive trend alert notification message when a sustained,
 * meaningful trajectory change is detected.
 *
 * @param {string} userName - Employee full name (e.g. "Alex Rivera")
 * @param {string} metricLabel - Human readable label (e.g. "on-time delivery")
 * @param {Object} trendResult - Result from detectTrend()
 * @param {Object} options - Optional overrides ({ changeThreshold, timeHorizonLabel })
 * @returns {{
 *   shouldAlert: boolean,
 *   message: string | null,
 *   type?: "positive" | "review"
 * }}
 */
function generateTrendAlert(userName = "Employee", metricLabel = "performance", trendResult = {}, options = {}) {
  const changeThreshold = options.changeThreshold || DEFAULT_ALERT_CHANGE_THRESHOLD;
  const timeHorizon = options.timeHorizonLabel || "the last 3 months";

  if (!trendResult || typeof trendResult !== "object") {
    return { shouldAlert: false, message: null };
  }

  const { trend, startValue, endValue, changeOverPeriod } = trendResult;

  // Only alert if net change exceeds meaningful threshold and trend is actively moving
  if (
    !trend ||
    trend === "stable" ||
    startValue === null ||
    endValue === null ||
    Math.abs(changeOverPeriod || 0) < changeThreshold
  ) {
    return { shouldAlert: false, message: null };
  }

  if (trend === "improving") {
    const message = `${userName}'s ${metricLabel} has improved from ${startValue}% to ${endValue}% over ${timeHorizon} — consistent upward trajectory.`;
    return {
      shouldAlert: true,
      message,
      type: "positive",
    };
  }

  if (trend === "declining") {
    const message = `${userName}'s ${metricLabel} has declined from ${startValue}% to ${endValue}% over ${timeHorizon} — recommend review.`;
    return {
      shouldAlert: true,
      message,
      type: "review",
    };
  }

  return { shouldAlert: false, message: null };
}

/**
 * deriveEstimationAccuracy(variancePct)
 *
 * Maps Phase 11 estimation variance percentage (where 0% = exact estimate,
 * +X% = took longer, -Y% = took shorter) into an inverted accuracy metric
 * where higher = more accurate (100% = perfect estimation).
 *
 * @param {number|null|undefined} variancePct
 * @returns {number} Accuracy percentage (0 to 100)
 */
function deriveEstimationAccuracy(variancePct) {
  if (variancePct === null || variancePct === undefined) {
    return 100;
  }
  const num = Number(variancePct);
  if (isNaN(num)) {
    return 100;
  }
  return Math.max(0, Math.min(100, Math.round(100 - Math.abs(num))));
}

module.exports = {
  detectTrend,
  generateTrendAlert,
  deriveEstimationAccuracy,
  DEFAULT_SLOPE_THRESHOLD,
  DEFAULT_ALERT_CHANGE_THRESHOLD,
};
