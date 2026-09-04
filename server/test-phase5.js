/**
 * Phase 5 Unit Tests: Pure Logic Slippage & QA-Rejection Loop Detection
 * NO DATABASE CONNECTION REQUIRED — pure functions with plain JS objects.
 * Following test-phase1/2/3.js style.
 */

const assert = require("assert");
const {
  calculatePartialWorkStreak,
  calculateRepeatedRejectionLoop,
  buildEscalationAlert,
} = require("./lib/slippageDetection");

function runPhase5UnitTests() {
  console.log("🧪 Running Phase 5 Pure Logic Slippage & Rejection Loop Unit Tests...\n");

  // ───────────────────────────────────────────────────────────────────────────
  // PART 1: calculatePartialWorkStreak
  // ───────────────────────────────────────────────────────────────────────────
  console.log("--- PART 1: calculatePartialWorkStreak ---");

  // Test 1a: 0 partial days (empty or fully completed) -> normal
  const emptyRes = calculatePartialWorkStreak([]);
  assert.strictEqual(emptyRes.streakDays, 0, "Test 1a Failed: Expected streakDays=0");
  assert.strictEqual(emptyRes.level, "normal", "Test 1a Failed: Expected level='normal'");

  const completeOnlyRes = calculatePartialWorkStreak([
    { date: "2026-09-04", hours_logged: 8, hours_estimated: 8, is_complete: true },
    { date: "2026-09-03", hours_logged: 7, hours_estimated: 8, is_complete: true },
  ]);
  assert.strictEqual(completeOnlyRes.streakDays, 0, "Test 1a Failed: All complete should have streakDays=0");
  assert.strictEqual(completeOnlyRes.level, "normal", "Test 1a Failed: Expected level='normal'");
  console.log("✓ Test 1a Passed: 0 partial days / completed days -> normal (streakDays=0)");

  // Test 1b: 1 partial day -> normal
  const onePartialRes = calculatePartialWorkStreak([
    { date: "2026-09-04", hours_logged: 4, hours_estimated: 8, is_complete: false },
    { date: "2026-09-03", hours_logged: 8, hours_estimated: 8, is_complete: true },
  ]);
  assert.strictEqual(onePartialRes.streakDays, 1, "Test 1b Failed: Expected streakDays=1");
  assert.strictEqual(onePartialRes.level, "normal", "Test 1b Failed: Expected level='normal'");
  console.log("✓ Test 1b Passed: 1 partial day -> normal (streakDays=1)");

  // Test 1c: Exactly 2 consecutive partial days -> warning
  const twoPartialRes = calculatePartialWorkStreak([
    { date: "2026-09-04", hours_logged: 4, hours_estimated: 8, is_complete: false },
    { date: "2026-09-03", hours_logged: 3, hours_estimated: 8, is_complete: false },
    { date: "2026-09-02", hours_logged: 8, hours_estimated: 8, is_complete: true },
  ]);
  assert.strictEqual(twoPartialRes.streakDays, 2, "Test 1c Failed: Expected streakDays=2");
  assert.strictEqual(twoPartialRes.level, "warning", "Test 1c Failed: Expected level='warning'");
  console.log("✓ Test 1c Passed: Exactly 2 consecutive partial days -> warning (streakDays=2)");

  // Test 1d: 3+ consecutive partial days -> escalation
  const threePartialRes = calculatePartialWorkStreak([
    { date: "2026-09-04", hours_logged: 4, hours_estimated: 8, is_complete: false },
    { date: "2026-09-03", hours_logged: 5, hours_estimated: 8, is_complete: false },
    { date: "2026-09-02", hours_logged: 6, hours_estimated: 8, is_complete: false },
    { date: "2026-09-01", hours_logged: 8, hours_estimated: 8, is_complete: true },
  ]);
  assert.strictEqual(threePartialRes.streakDays, 3, "Test 1d Failed: Expected streakDays=3");
  assert.strictEqual(threePartialRes.level, "escalation", "Test 1d Failed: Expected level='escalation'");

  const fourPartialRes = calculatePartialWorkStreak([
    { date: "2026-09-04", hours_logged: 4, hours_estimated: 8, is_complete: false },
    { date: "2026-09-03", hours_logged: 4, hours_estimated: 8, is_complete: false },
    { date: "2026-09-02", hours_logged: 4, hours_estimated: 8, is_complete: false },
    { date: "2026-09-01", hours_logged: 4, hours_estimated: 8, is_complete: false },
  ]);
  assert.strictEqual(fourPartialRes.streakDays, 4, "Test 1d Failed: Expected streakDays=4");
  assert.strictEqual(fourPartialRes.level, "escalation", "Test 1d Failed: Expected level='escalation'");
  console.log("✓ Test 1d Passed: 3+ consecutive partial days -> escalation (streakDays=3, 4)");

  // Test 1e: A completed day in the middle resets the streak
  const middleResetRes = calculatePartialWorkStreak([
    { date: "2026-09-04", hours_logged: 4, hours_estimated: 8, is_complete: false },
    { date: "2026-09-03", hours_logged: 8, hours_estimated: 8, is_complete: true }, // Resets streak!
    { date: "2026-09-02", hours_logged: 5, hours_estimated: 8, is_complete: false },
    { date: "2026-09-01", hours_logged: 5, hours_estimated: 8, is_complete: false },
  ]);
  assert.strictEqual(middleResetRes.streakDays, 1, "Test 1e Failed: streak should stop at 1 due to completed day");
  assert.strictEqual(middleResetRes.level, "normal", "Test 1e Failed: level should be 'normal'");
  console.log("✓ Test 1e Passed: Completed day in the middle resets the streak (streakDays=1)");

  // ───────────────────────────────────────────────────────────────────────────
  // PART 2: calculateRepeatedRejectionLoop
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 2: calculateRepeatedRejectionLoop ---");

  // Test 2a: 2 rejections then approved at end -> no alert
  const approvedAtEnd = [
    { status: "rejected", created_at: "2026-09-01T10:00:00Z" },
    { status: "rejected", created_at: "2026-09-02T10:00:00Z" },
    { status: "approved", created_at: "2026-09-03T10:00:00Z" },
  ];
  const res2a = calculateRepeatedRejectionLoop(approvedAtEnd);
  assert.strictEqual(res2a.rejectionStreak, 0, "Test 2a Failed: Expected streak=0 since last is approved");
  assert.strictEqual(res2a.triggersAlert, false, "Test 2a Failed: Expected triggersAlert=false");
  console.log("✓ Test 2a Passed: 2 rejections then approved -> streak=0, no alert");

  // Test 2b: 3 consecutive rejections -> triggers alert
  const threeRejections = [
    { status: "rejected", created_at: "2026-09-01T10:00:00Z" },
    { status: "rejected", created_at: "2026-09-02T10:00:00Z" },
    { status: "rejected", created_at: "2026-09-03T10:00:00Z" },
  ];
  const res2b = calculateRepeatedRejectionLoop(threeRejections);
  assert.strictEqual(res2b.rejectionStreak, 3, "Test 2b Failed: Expected streak=3");
  assert.strictEqual(res2b.triggersAlert, true, "Test 2b Failed: Expected triggersAlert=true");
  console.log("✓ Test 2b Passed: 3 consecutive rejections -> streak=3, triggers alert");

  // Test 2c: rejection -> appeal-override(approved) -> rejection -> rejection
  // streak should only count from after the override (2, not 4)
  const overrideInMiddle = [
    { status: "rejected", created_at: "2026-09-01T10:00:00Z" },
    { status: "approved", appeal_status: "overridden", created_at: "2026-09-02T10:00:00Z" },
    { status: "rejected", created_at: "2026-09-03T10:00:00Z" },
    { status: "rejected", created_at: "2026-09-04T10:00:00Z" },
  ];
  const res2c = calculateRepeatedRejectionLoop(overrideInMiddle);
  assert.strictEqual(res2c.rejectionStreak, 2, "Test 2c Failed: Expected streak=2 after override");
  assert.strictEqual(res2c.triggersAlert, false, "Test 2c Failed: Expected triggersAlert=false (2 < 3)");
  console.log("✓ Test 2c Passed: Rejection -> override(approved) -> 2 rejections -> streak=2, no alert");

  // Also verify with explicit status: "overridden"
  const overrideExplicitStatus = [
    { status: "rejected", created_at: "2026-09-01T10:00:00Z" },
    { status: "overridden", created_at: "2026-09-02T10:00:00Z" },
    { status: "rejected", created_at: "2026-09-03T10:00:00Z" },
    { status: "rejected", created_at: "2026-09-04T10:00:00Z" },
  ];
  const res2cExplicit = calculateRepeatedRejectionLoop(overrideExplicitStatus);
  assert.strictEqual(res2cExplicit.rejectionStreak, 2, "Test 2c explicit Failed: Expected streak=2");
  assert.strictEqual(res2cExplicit.triggersAlert, false, "Test 2c explicit Failed: Expected triggersAlert=false");
  console.log("✓ Test 2c (explicit) Passed: status='overridden' resets streak, only 2 rejections counted");

  // ───────────────────────────────────────────────────────────────────────────
  // PART 3: buildEscalationAlert
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 3: buildEscalationAlert ---");

  // Test 3a: partial_work_streak alert structure & resolution options
  const partialAlert = buildEscalationAlert("partial_work_streak", {
    employee_name: "Riya Patel",
    employee_id: "emp_riya_patel",
    project_id: "proj_123",
    project_title: "AI-Powered Customer Intelligence Hub",
    streakDays: 3,
    cumulative_slippage_hours: 12,
  });

  assert.strictEqual(partialAlert.type, "partial_work_streak", "Test 3a Failed: type mismatch");
  assert.strictEqual(partialAlert.level, "escalation", "Test 3a Failed: level mismatch");
  assert.strictEqual(partialAlert.employee_name, "Riya Patel", "Test 3a Failed: employee_name mismatch");
  assert.strictEqual(partialAlert.project_title, "AI-Powered Customer Intelligence Hub", "Test 3a Failed: project_title mismatch");
  assert.strictEqual(partialAlert.cumulative_slippage_hours, 12, "Test 3a Failed: cumulative_slippage_hours mismatch");
  assert.ok(partialAlert.downstream_impact, "Test 3a Failed: downstream_impact missing");
  assert.deepStrictEqual(
    partialAlert.resolution_options,
    ["Reassign overflow", "Schedule 1-on-1", "Extend milestone"],
    "Test 3a Failed: resolution_options mismatch for partial_work_streak"
  );
  console.log("✓ Test 3a Passed: partial_work_streak alert structure and resolution options verified");

  // Test 3b: repeated_qa_rejection alert structure & resolution options
  const rejectionAlert = buildEscalationAlert("repeated_qa_rejection", {
    task_id: "task_456",
    task_title: "Implement RBAC Middleware",
    project_id: "proj_123",
    employee_name: "Sneha Reddy",
    rejectionStreak: 3,
    rejection_reasons: [
      "Unit tests missing for forbidden route",
      "Missing error handling for expired token",
      "Lint errors and incomplete role hierarchy check",
    ],
    appeal_justifications: ["Edge cases handled in companion integration tests"],
    total_hours_consumed: 14,
  });

  assert.strictEqual(rejectionAlert.type, "repeated_qa_rejection", "Test 3b Failed: type mismatch");
  assert.strictEqual(rejectionAlert.level, "escalation", "Test 3b Failed: level mismatch");
  assert.strictEqual(rejectionAlert.task_title, "Implement RBAC Middleware", "Test 3b Failed: task_title mismatch");
  assert.strictEqual(rejectionAlert.rejectionStreak, 3, "Test 3b Failed: rejectionStreak mismatch");
  assert.strictEqual(rejectionAlert.rejection_reasons.length, 3, "Test 3b Failed: rejection_reasons length mismatch");
  assert.strictEqual(rejectionAlert.total_hours_consumed, 14, "Test 3b Failed: total_hours_consumed mismatch");
  assert.deepStrictEqual(
    rejectionAlert.resolution_options,
    [
      "Schedule clarification session",
      "Reassign to experienced teammate",
      "Simplify acceptance criteria",
    ],
    "Test 3b Failed: resolution_options mismatch for repeated_qa_rejection"
  );
  console.log("✓ Test 3b Passed: repeated_qa_rejection alert structure and resolution options verified");

  console.log("\n🎉 ALL PHASE 5 PURE LOGIC UNIT TESTS PASSED SUCCESSFULLY!");
}

try {
  runPhase5UnitTests();
  process.exit(0);
} catch (err) {
  console.error("❌ Phase 5 Unit Test Failed:", err);
  process.exit(1);
}
