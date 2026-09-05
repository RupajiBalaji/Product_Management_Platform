/**
 * Phase 11 Pure Logic Unit Tests (Zero Database Dependencies)
 *
 * Tests:
 * 1. calculateEstimationAccuracy:
 *    - Under-estimate case (actual > estimated -> positive variance)
 *    - Over-estimate case (actual < estimated -> negative variance)
 *    - Exact match case (actual == estimated -> 0% variance)
 *    - Correct grouping by employee
 *    - Correct grouping by role domain
 *
 * 2. summarizeIncidents:
 *    - Mixed incident inputs (slippageEvents, qaLoops >=3, scopeChanges, blockedActionRequests)
 *    - Zero-incident case returns all zeros, never undefined or null
 *
 * 3. calculateTeamPerformance:
 *    - Employee with zero tasks does not divide-by-zero (returns 0 or null, never NaN)
 *    - Employee with all first-pass approvals -> 100% firstPassQualityPct
 *    - Slippage escalation penalty on onTimeReliabilityPct
 *
 * 4. generateLessonsLearned:
 *    - Injectable AI client returns structured lessons
 *    - Network/AI failure returns clean fallback array
 */

const assert = require("assert");
const {
  calculateEstimationAccuracy,
  summarizeIncidents,
  calculateTeamPerformance,
} = require("./lib/retrospectiveCalculator");
const {
  generateLessonsLearned,
  FALLBACK_LESSONS,
} = require("./lib/lessonsGenerator");

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✕ ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✕ ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

async function runAllTests() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("PHASE 11 PURE LOGIC UNIT TESTS (ZERO DATABASE)");
  console.log("═══════════════════════════════════════════════════════\n");

  // ─── 1. calculateEstimationAccuracy Tests ────────────────────────────────────
  console.log("--- 1. calculateEstimationAccuracy Tests ---");

  runTest("Exact match case: actual == estimated -> 0% variance", () => {
    const tasks = [
      { estimate_hours: 10, actual_hours: 10, assignee_ids: ["emp_alice"] },
      { estimate_hours: 20, actual_hours: 20, assignee_ids: ["emp_bob"] },
    ];
    const res = calculateEstimationAccuracy(tasks);
    assert.strictEqual(res.overall.totalEstimatedHours, 30);
    assert.strictEqual(res.overall.totalActualHours, 30);
    assert.strictEqual(res.overall.variancePct, 0);
  });

  runTest("Under-estimate case: actual > estimated -> positive variance (e.g. 10 est, 14 actual = +40%)", () => {
    const tasks = [
      { estimate_hours: 10, actual_hours: 14, assignee_ids: ["emp_alice"] },
    ];
    const res = calculateEstimationAccuracy(tasks);
    assert.strictEqual(res.overall.totalEstimatedHours, 10);
    assert.strictEqual(res.overall.totalActualHours, 14);
    assert.strictEqual(res.overall.variancePct, 40);
  });

  runTest("Over-estimate case: actual < estimated -> negative variance (e.g. 10 est, 8 actual = -20%)", () => {
    const tasks = [
      { estimate_hours: 10, actual_hours: 8, assignee_ids: ["emp_alice"] },
    ];
    const res = calculateEstimationAccuracy(tasks);
    assert.strictEqual(res.overall.totalEstimatedHours, 10);
    assert.strictEqual(res.overall.totalActualHours, 8);
    assert.strictEqual(res.overall.variancePct, -20);
  });

  runTest("Correct grouping by employee across multi-task allocations", () => {
    const tasks = [
      { estimate_hours: 10, actual_hours: 15, assignee_ids: ["emp_alice"] }, // +50%
      { estimate_hours: 20, actual_hours: 16, assignee_ids: ["emp_bob"] },   // -20%
      { estimate_hours: 10, actual_hours: 10, assignee_ids: ["emp_alice", "emp_bob"] }, // split 5h/5h each
    ];
    const res = calculateEstimationAccuracy(tasks);

    const alice = res.byEmployee.find((e) => e.userId === "emp_alice");
    const bob = res.byEmployee.find((e) => e.userId === "emp_bob");

    assert(alice, "Alice should be present in byEmployee");
    assert(bob, "Bob should be present in byEmployee");

    // Alice: 10 + 5 = 15 est, 15 + 5 = 20 actual -> (20-15)/15 = +33.3%
    assert.strictEqual(alice.estimatedHours, 15);
    assert.strictEqual(alice.actualHours, 20);
    assert.strictEqual(alice.variancePct, 33.3);

    // Bob: 20 + 5 = 25 est, 16 + 5 = 21 actual -> (21-25)/25 = -16%
    assert.strictEqual(bob.estimatedHours, 25);
    assert.strictEqual(bob.actualHours, 21);
    assert.strictEqual(bob.variancePct, -16);
  });

  runTest("Correct grouping by DynamicRole domain", () => {
    const dynamicRoles = [
      { _id: "role_eng", domain: "Engineering", title: "Backend Engineer" },
      { _id: "role_des", domain: "Design", title: "Product Designer" },
    ];
    const teamAllocations = [
      { user_id: "emp_alice", role_id: "role_eng" },
      { user_id: "emp_carol", role_id: "role_des" },
    ];
    const tasks = [
      { estimate_hours: 20, actual_hours: 28, assignee_ids: ["emp_alice"] }, // Engineering +40%
      { estimate_hours: 10, actual_hours: 9, assignee_ids: ["emp_carol"] },  // Design -10%
      { estimate_hours: 5, actual_hours: 5, assignee_ids: ["emp_stranger"] }, // General 0%
    ];

    const res = calculateEstimationAccuracy(tasks, dynamicRoles, teamAllocations);

    const engPhase = res.byPhase.find((p) => p.phaseOrTaskGroup === "Engineering");
    const desPhase = res.byPhase.find((p) => p.phaseOrTaskGroup === "Design");
    const genPhase = res.byPhase.find((p) => p.phaseOrTaskGroup === "General");

    assert(engPhase, "Engineering phase should be present");
    assert(desPhase, "Design phase should be present");
    assert(genPhase, "General phase should be present");

    assert.strictEqual(engPhase.estimatedHours, 20);
    assert.strictEqual(engPhase.actualHours, 28);
    assert.strictEqual(engPhase.variancePct, 40);

    assert.strictEqual(desPhase.estimatedHours, 10);
    assert.strictEqual(desPhase.actualHours, 9);
    assert.strictEqual(desPhase.variancePct, -10);

    assert.strictEqual(genPhase.estimatedHours, 5);
    assert.strictEqual(genPhase.actualHours, 5);
    assert.strictEqual(genPhase.variancePct, 0);
  });

  // ─── 2. summarizeIncidents Tests ─────────────────────────────────────────────
  console.log("\n--- 2. summarizeIncidents Tests ---");

  runTest("Zero-incident case returns all zeros, never undefined or null", () => {
    const res = summarizeIncidents([], [], [], []);
    assert.strictEqual(res.slippageEventsCount, 0);
    assert.strictEqual(res.qaRejectionLoopCount, 0);
    assert.strictEqual(res.scopeChangesCount, 0);
    assert.strictEqual(res.blockerIncidentsCount, 0);
    assert(!Object.values(res).some((v) => v === undefined || v === null || isNaN(v)));
  });

  runTest("Correct counts from mixed incident data", () => {
    const slippageEvents = [
      { project_id: "p1", level: "warning", resolved: true },
      { project_id: "p1", level: "escalation", resolved: false },
      { project_id: "p1", trigger_type: "repeated_qa_rejection", task_id: "task_b", resolved: false },
    ];
    const submissions = [
      { task_id: "task_a", rejection_count: 3 },
      { task_id: "task_a", rejection_count: 4 }, // same task, should count unique task once
      { task_id: "task_c", rejection_count: 1 },
    ];
    const directiveChanges = [
      { id: "dc1", change: "Add auth" },
      { id: "dc2", change: "Remove telemetry" },
    ];
    const actionRequests = [
      { action_type: "postpone", status: "blocked" },
      { action_type: "reorder", status: "blocked" },
      { action_type: "swap_within_week", status: "auto_approved" },
    ];

    const res = summarizeIncidents(slippageEvents, submissions, directiveChanges, actionRequests);
    assert.strictEqual(res.slippageEventsCount, 3);
    assert.strictEqual(res.qaRejectionLoopCount, 2); // task_a (from submission) + task_b (from slippage)
    assert.strictEqual(res.scopeChangesCount, 2);
    assert.strictEqual(res.blockerIncidentsCount, 2); // postpone + blocked reorder
  });

  // ─── 3. calculateTeamPerformance Tests ───────────────────────────────────────
  console.log("\n--- 3. calculateTeamPerformance Tests ---");

  runTest("Employee with zero tasks does not divide-by-zero (returns 0 or null, never NaN)", () => {
    const allTasks = [];
    const submissions = { emp_zero: [] };
    const res = calculateTeamPerformance(submissions, {}, allTasks, []);

    const empZero = res.find((e) => e.userId === "emp_zero");
    assert(empZero, "emp_zero should be present");
    assert.strictEqual(empZero.tasksCompleted, 0);
    assert(!isNaN(empZero.onTimeReliabilityPct));
    assert(!isNaN(empZero.firstPassQualityPct));
    assert.strictEqual(empZero.onTimeReliabilityPct, 0);
    assert.strictEqual(empZero.firstPassQualityPct, 0);
  });

  runTest("Employee with all first-pass approvals -> 100% firstPassQualityPct", () => {
    const allTasks = [
      { _id: "t1", status: "completed", assignee_ids: ["emp_star"] },
      { _id: "t2", status: "completed", assignee_ids: ["emp_star"] },
    ];
    const submissions = [
      { employee_id: "emp_star", task_id: "t1", status: "approved", rejection_count: 0 },
      { employee_id: "emp_star", task_id: "t2", status: "approved", rejection_count: 0 },
    ];

    const res = calculateTeamPerformance(submissions, {}, allTasks, []);
    const empStar = res.find((e) => e.userId === "emp_star");

    assert(empStar);
    assert.strictEqual(empStar.tasksCompleted, 2);
    assert.strictEqual(empStar.firstPassQualityPct, 100);
    assert.strictEqual(empStar.onTimeReliabilityPct, 100);
  });

  runTest("Slippage escalation reduces onTimeReliabilityPct accurately", () => {
    const allTasks = [
      { _id: "t1", status: "completed", assignee_ids: ["emp_dan"] },
      { _id: "t2", status: "completed", assignee_ids: ["emp_dan"] },
      { _id: "t3", status: "completed", assignee_ids: ["emp_dan"] },
      { _id: "t4", status: "completed", assignee_ids: ["emp_dan"] },
    ];
    const slippageEvents = [
      { task_id: "t1", user_id: "emp_dan", level: "escalation" },
    ];
    const submissions = [
      { employee_id: "emp_dan", task_id: "t1", status: "approved", rejection_count: 1 },
      { employee_id: "emp_dan", task_id: "t2", status: "approved", rejection_count: 0 },
      { employee_id: "emp_dan", task_id: "t3", status: "approved", rejection_count: 0 },
      { employee_id: "emp_dan", task_id: "t4", status: "approved", rejection_count: 0 },
    ];

    const res = calculateTeamPerformance(submissions, {}, allTasks, slippageEvents);
    const dan = res.find((e) => e.userId === "emp_dan");

    assert(dan);
    assert.strictEqual(dan.tasksCompleted, 4);
    // 3 of 4 on-time -> 75%
    assert.strictEqual(dan.onTimeReliabilityPct, 75);
    // 3 of 4 approved on first pass -> 75%
    assert.strictEqual(dan.firstPassQualityPct, 75);
  });

  // ─── 4. generateLessonsLearned Tests ─────────────────────────────────────────
  console.log("\n--- 4. generateLessonsLearned Tests ---");

  await runAsyncTest("Injectable mock AI client returns structured lessons array", async () => {
    const mockAiClient = async (prompt) => {
      assert(prompt.includes("ESTIMATION ACCURACY"), "Prompt should contain telemetry");
      return JSON.stringify({
        lessons: [
          "Backend estimation was consistently 40% under actual time, apply a 1.4x calibration factor for similar tasks.",
          "Design deliverables approved with 100% first-pass quality; preserve current Figma review rubric.",
        ],
      });
    };

    const lessons = await generateLessonsLearned(
      { overall: { variancePct: 40 } },
      { slippageEventsCount: 1 },
      [],
      { title: "Test Project" },
      mockAiClient
    );

    assert(Array.isArray(lessons));
    assert.strictEqual(lessons.length, 2);
    assert(lessons[0].includes("1.4x calibration factor"));
  });

  await runAsyncTest("Graceful fallback on AI error (never crashes or leaves empty)", async () => {
    const failingAiClient = async () => {
      throw new Error("HTTP 429 Quota Exceeded");
    };

    const lessons = await generateLessonsLearned(
      {},
      {},
      [],
      { title: "Crashing Project" },
      failingAiClient
    );

    assert(Array.isArray(lessons));
    assert.strictEqual(lessons.length, 1);
    assert.strictEqual(lessons[0], FALLBACK_LESSONS[0]);
  });

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`PHASE 11 UNIT TESTS SUMMARY: ${passedTests}/${totalTests} PASSED`);
  console.log("═══════════════════════════════════════════════════════");
  console.log("ALL PHASE 11 PURE LOGIC UNIT TESTS PASSED SUCCESSFULLY! ✓\n");
}

runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
