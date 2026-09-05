const assert = require("assert");
const {
  detectTrend,
  generateTrendAlert,
  deriveEstimationAccuracy,
} = require("./lib/growthTrajectory");

console.log("═══════════════════════════════════════════════════════");
console.log("PHASE 13 PURE LOGIC UNIT TESTS (ZERO DATABASE)");
console.log("═══════════════════════════════════════════════════════\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────
// 1. detectTrend Tests
// ─────────────────────────────────────────────────────────────
console.log("--- 1. detectTrend Linear Regression Tests ---");

test("clearly improving series -> 'improving' with positive slope", () => {
  // 12 weekly snapshots moving steadily from 65% to 91%
  const snapshots = [
    { on_time_reliability_pct: 65 },
    { on_time_reliability_pct: 67 },
    { on_time_reliability_pct: 70 },
    { on_time_reliability_pct: 72 },
    { on_time_reliability_pct: 75 },
    { on_time_reliability_pct: 78 },
    { on_time_reliability_pct: 80 },
    { on_time_reliability_pct: 83 },
    { on_time_reliability_pct: 85 },
    { on_time_reliability_pct: 87 },
    { on_time_reliability_pct: 89 },
    { on_time_reliability_pct: 91 },
  ];

  const res = detectTrend(snapshots, "on_time_reliability_pct", 12);
  assert.strictEqual(res.trend, "improving", `Expected 'improving' but got ${res.trend}`);
  assert.ok(res.slopePerWeek > 0.5, `Expected slope > 0.5 but got ${res.slopePerWeek}`);
  assert.strictEqual(res.startValue, 65);
  assert.strictEqual(res.endValue, 91);
  assert.strictEqual(res.changeOverPeriod, 26);
  assert.strictEqual(res.dataPointsCount, 12);
});

test("clearly declining series -> 'declining' with negative slope", () => {
  // 12 weekly snapshots dropping from 90% to 66%
  const snapshots = [
    { first_pass_quality_pct: 90 },
    { first_pass_quality_pct: 88 },
    { first_pass_quality_pct: 85 },
    { first_pass_quality_pct: 83 },
    { first_pass_quality_pct: 80 },
    { first_pass_quality_pct: 78 },
    { first_pass_quality_pct: 75 },
    { first_pass_quality_pct: 73 },
    { first_pass_quality_pct: 70 },
    { first_pass_quality_pct: 68 },
    { first_pass_quality_pct: 67 },
    { first_pass_quality_pct: 66 },
  ];

  const res = detectTrend(snapshots, "first_pass_quality_pct", 12);
  assert.strictEqual(res.trend, "declining", `Expected 'declining' but got ${res.trend}`);
  assert.ok(res.slopePerWeek < -0.5, `Expected slope < -0.5 but got ${res.slopePerWeek}`);
  assert.strictEqual(res.startValue, 90);
  assert.strictEqual(res.endValue, 66);
  assert.strictEqual(res.changeOverPeriod, -24);
  assert.strictEqual(res.dataPointsCount, 12);
});

test("flat or noisy series within threshold -> 'stable'", () => {
  // Slight oscillation between 80% and 82%
  const snapshots = [
    { on_time_reliability_pct: 80 },
    { on_time_reliability_pct: 81 },
    { on_time_reliability_pct: 82 },
    { on_time_reliability_pct: 80 },
    { on_time_reliability_pct: 81 },
    { on_time_reliability_pct: 82 },
    { on_time_reliability_pct: 80 },
    { on_time_reliability_pct: 81 },
  ];

  const res = detectTrend(snapshots, "on_time_reliability_pct", 12);
  assert.strictEqual(res.trend, "stable", `Expected 'stable' but got ${res.trend}`);
  assert.ok(Math.abs(res.slopePerWeek) <= 0.5, `Slope magnitude should be <= 0.5, got ${res.slopePerWeek}`);
  assert.strictEqual(res.startValue, 80);
  assert.strictEqual(res.endValue, 81);
});

test("fewer than 2 data points -> returns 'stable' with note without crashing", () => {
  // Empty array
  const emptyRes = detectTrend([], "estimation_accuracy_pct");
  assert.strictEqual(emptyRes.trend, "stable");
  assert.strictEqual(emptyRes.dataPointsCount, 0);
  assert.ok(emptyRes.note, "Should include explanatory note for 0 points");

  // Single point
  const singleRes = detectTrend([{ estimation_accuracy_pct: 85 }], "estimation_accuracy_pct");
  assert.strictEqual(singleRes.trend, "stable");
  assert.strictEqual(singleRes.startValue, 85);
  assert.strictEqual(singleRes.endValue, 85);
  assert.strictEqual(singleRes.dataPointsCount, 1);
  assert.ok(singleRes.note, "Should include explanatory note for 1 point");
});

// ─────────────────────────────────────────────────────────────
// 2. generateTrendAlert Tests
// ─────────────────────────────────────────────────────────────
console.log("\n--- 2. generateTrendAlert Tests ---");

test("large improvement (>= 15 pts) -> shouldAlert true with correct upward trajectory format", () => {
  const trendResult = {
    trend: "improving",
    slopePerWeek: 2.17,
    startValue: 65,
    endValue: 91,
    changeOverPeriod: 26,
    dataPointsCount: 12,
  };

  const alert = generateTrendAlert("Alex Rivera", "on-time delivery", trendResult);
  assert.strictEqual(alert.shouldAlert, true);
  assert.strictEqual(alert.type, "positive");
  const expectedMsg =
    "Alex Rivera's on-time delivery has improved from 65% to 91% over the last 3 months — consistent upward trajectory.";
  assert.strictEqual(alert.message, expectedMsg);
});

test("small fluctuation (< 15 pts) -> shouldAlert false (no alert spam)", () => {
  const trendResult = {
    trend: "improving",
    slopePerWeek: 0.6,
    startValue: 80,
    endValue: 84,
    changeOverPeriod: 4,
    dataPointsCount: 8,
  };

  const alert = generateTrendAlert("Jordan Lee", "first-pass quality", trendResult);
  assert.strictEqual(alert.shouldAlert, false);
  assert.strictEqual(alert.message, null);
});

test("large decline (>= 15 pts) -> shouldAlert true with 'recommend review' format", () => {
  const trendResult = {
    trend: "declining",
    slopePerWeek: -1.83,
    startValue: 88,
    endValue: 66,
    changeOverPeriod: -22,
    dataPointsCount: 12,
  };

  const alert = generateTrendAlert("Taylor Chen", "estimation accuracy", trendResult);
  assert.strictEqual(alert.shouldAlert, true);
  assert.strictEqual(alert.type, "review");
  const expectedMsg =
    "Taylor Chen's estimation accuracy has declined from 88% to 66% over the last 3 months — recommend review.";
  assert.strictEqual(alert.message, expectedMsg);
});

// ─────────────────────────────────────────────────────────────
// 3. deriveEstimationAccuracy Tests
// ─────────────────────────────────────────────────────────────
console.log("\n--- 3. deriveEstimationAccuracy Tests ---");

test("inverts estimation variance accurately (0% var = 100%, 20% var = 80%, null = 100%)", () => {
  assert.strictEqual(deriveEstimationAccuracy(0), 100);
  assert.strictEqual(deriveEstimationAccuracy(20), 80);
  assert.strictEqual(deriveEstimationAccuracy(-15), 85);
  assert.strictEqual(deriveEstimationAccuracy(120), 0); // floor at 0%
  assert.strictEqual(deriveEstimationAccuracy(null), 100);
  assert.strictEqual(deriveEstimationAccuracy(undefined), 100);
});

console.log("\n═══════════════════════════════════════════════════════");
console.log(`PHASE 13 UNIT TESTS SUMMARY: ${passed}/${passed + failed} PASSED`);
console.log("═══════════════════════════════════════════════════════\n");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("ALL PHASE 13 PURE LOGIC UNIT TESTS PASSED SUCCESSFULLY! ✓\n");
}
