/**
 * Phase 6 Unit Tests: Pure Logic Action Mode Rules
 * NO DATABASE CONNECTION REQUIRED — pure functions with plain JS objects.
 * Following test-phase1/2/3/5 style.
 */

const assert = require("assert");
const {
  evaluateReorder,
  evaluateSwapWithinWeek,
  evaluatePostpone,
} = require("./lib/actionModeRules");

function runPhase6UnitTests() {
  console.log("🧪 Running Phase 6 Pure Logic Action Mode Unit Tests...\n");

  // ───────────────────────────────────────────────────────────────────────────
  // PART 1: evaluateReorder
  // ───────────────────────────────────────────────────────────────────────────
  console.log("--- PART 1: evaluateReorder ---");

  // Setup sample DAG:
  // Task A (independent)
  // Task B (depends on A)
  // Task C (independent)
  // Task D (depends on B)
  const tasks = [
    { id: "task_A", title: "DB Schema Design", depends_on: [] },
    { id: "task_B", title: "API Endpoint Implementation", depends_on: ["task_A"] },
    { id: "task_C", title: "Documentation", depends_on: [] },
    { id: "task_D", title: "Integration Testing", depends_on: ["task_B"] },
  ];

  // Test 1a: Reorder that doesn't violate dependencies -> approved
  // Moving task_C from index 2 to index 0 (clean independent task)
  const res1a = evaluateReorder("task_C", 0, tasks);
  assert.strictEqual(res1a.approved, true, "Test 1a Failed: Expected approved=true for moving independent task");
  assert.ok(res1a.reason.includes("approved"), "Test 1a Failed: Expected approval reasoning");
  console.log("✓ Test 1a Passed: Moving independent task doesn't touch dependencies -> approved");

  // Test 1b: Reorder that places a task BEFORE something it depends on -> blocked
  // Trying to move task_B (depends on task_A) to index 0 (before task_A)
  const res1b = evaluateReorder("task_B", 0, tasks);
  assert.strictEqual(res1b.approved, false, "Test 1b Failed: Expected approved=false when moving before prerequisite");
  assert.ok(
    res1b.reason.includes("Cannot move task before prerequisite") || res1b.reason.includes("prerequisite must execute first"),
    `Test 1b Failed: Reason should mention prerequisite violation, got: ${res1b.reason}`
  );
  console.log(`✓ Test 1b Passed: Moving task before its prerequisite is blocked: "${res1b.reason}"`);

  // Test 1c: Reorder that places a task AFTER something that depends on it -> blocked
  // Trying to move task_A to index 3 (after task_B and task_D which depend on it)
  const res1c = evaluateReorder("task_A", 3, tasks);
  assert.strictEqual(res1c.approved, false, "Test 1c Failed: Expected approved=false when moving after dependent");
  assert.ok(
    res1c.reason.includes("downstream dependent") || res1c.reason.includes("dependent requires this task"),
    `Test 1c Failed: Reason should mention downstream dependent violation, got: ${res1c.reason}`
  );
  console.log(`✓ Test 1c Passed: Moving task after downstream dependent is blocked: "${res1c.reason}"`);

  // Test 1d: Valid move maintaining order -> moving task_D to index 3 (already at end) or task_C to index 3
  const res1d = evaluateReorder("task_C", 3, tasks);
  assert.strictEqual(res1d.approved, true, "Test 1d Failed: Moving C to end should be approved");
  console.log("✓ Test 1d Passed: Valid move at end preserves DAG -> approved");

  // ───────────────────────────────────────────────────────────────────────────
  // PART 2: evaluateSwapWithinWeek
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 2: evaluateSwapWithinWeek ---");

  const weekBounds = {
    start: "2026-09-07", // Monday
    end: "2026-09-13",   // Sunday
  };

  // Test 2a: Swap within weekly cap and inside current week -> approved
  const res2a = evaluateSwapWithinWeek(
    { currentWeeklyHours: 32, weeklyCapHours: 40 },
    6,
    "2026-09-09", // Wednesday (inside week bounds)
    weekBounds
  );
  assert.strictEqual(res2a.approved, true, "Test 2a Failed: Expected approved=true (32+6=38 <= 40)");
  assert.strictEqual(res2a.projectedWeeklyHours, 38, "Test 2a Failed: Expected projectedWeeklyHours=38");
  assert.ok(res2a.reason.includes("approved"), "Test 2a Failed: Reason should mention approved");
  console.log(`✓ Test 2a Passed: Swap within current week and under weekly cap -> approved (${res2a.projectedWeeklyHours}h / 40h)`);

  // Test 2b: Swap that would push weekly total OVER cap -> blocked with overflow reasoning
  const res2b = evaluateSwapWithinWeek(
    { currentWeeklyHours: 36, weeklyCapHours: 40 },
    8, // 36 + 8 = 44 > 40
    "2026-09-10",
    weekBounds
  );
  assert.strictEqual(res2b.approved, false, "Test 2b Failed: Expected approved=false when over cap");
  assert.strictEqual(res2b.projectedWeeklyHours, 44, "Test 2b Failed: Expected projectedWeeklyHours=44");
  assert.ok(
    res2b.reason.includes("exceed weekly capacity cap") || res2b.reason.includes("44 hrs"),
    `Test 2b Failed: Reason should mention exceeding cap, got: ${res2b.reason}`
  );
  console.log(`✓ Test 2b Passed: Workload overflow blocked with reasoning: "${res2b.reason}"`);

  // Test 2c: Swap to a date OUTSIDE the current week -> blocked (distinct rule and reason)
  const res2c = evaluateSwapWithinWeek(
    { currentWeeklyHours: 20, weeklyCapHours: 40 },
    6,
    "2026-09-15", // Next Tuesday (outside week bounds)
    weekBounds
  );
  assert.strictEqual(res2c.approved, false, "Test 2c Failed: Expected approved=false for date outside week");
  assert.ok(
    res2c.reason.includes("outside the current weekly boundary") || res2c.reason.includes("outside"),
    `Test 2c Failed: Reason should state date is outside weekly boundary, got: ${res2c.reason}`
  );
  console.log(`✓ Test 2c Passed: Date outside week blocked with boundary reason: "${res2c.reason}"`);

  // ───────────────────────────────────────────────────────────────────────────
  // PART 3: evaluatePostpone
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 3: evaluatePostpone ---");

  // Test 3a: Postpone is ALWAYS blocked with exact governance reasoning
  const res3 = evaluatePostpone();
  const expectedReason =
    "Postponing or extending deadlines is a strictly forbidden action per platform governance. This requires a formal scope change request, which only a Product Lead can authorize.";
  assert.strictEqual(res3.approved, false, "Test 3 Failed: Postpone must always have approved=false");
  assert.strictEqual(res3.reason, expectedReason, "Test 3 Failed: Postpone reasoning string mismatch");
  console.log(`✓ Test 3 Passed: Postpone is strictly forbidden: "${res3.reason}"`);

  console.log("\n🎉 ALL PHASE 6 PURE LOGIC UNIT TESTS PASSED SUCCESSFULLY!");
}

try {
  runPhase6UnitTests();
  process.exit(0);
} catch (err) {
  console.error("❌ Phase 6 Unit Test Failed:", err);
  process.exit(1);
}
