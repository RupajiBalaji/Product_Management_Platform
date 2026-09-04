const assert = require("assert");
const {
  calculateCriticalPathSlack,
  getDownstreamBlocked,
  calculateTaskPriority,
  sortQueueByPriority,
} = require("./lib/taskPriority");

function runPhase7UnitTests() {
  console.log("🨚 Running Phase 7 Pure Logic Task Priority Unit Tests...\n");

  // PART 1: calculateCriticalPathSlack
  console.log("--- PART 1: calculateCriticalPathSlack ---");
  const linearTasks = [
    { _id: "task_A", title: "Task A", estimate_hours: 3, depends_on: [] },
    { _id: "task_B", title: "Task B", estimate_hours: 4, depends_on: ["task_A"] },
    { _id: "task_C", title: "Task C", estimate_hours: 5, depends_on: ["task_B"] },
  ];

  const linearSlack = calculateCriticalPathSlack(linearTasks);
  assert.strictEqual(linearSlack.get("task_A").isCritical, true, "Task A must be critical");
  assert.strictEqual(linearSlack.get("task_B").isCritical, true, "Task B must be critical");
  assert.strictEqual(linearSlack.get("task_C").isCritical, true, "Task C must be critical");
  assert.strictEqual(linearSlack.get("task_A").slack, 0);
  console.log("✓ Test 1a Passed: Linear chain all tasks on critical path with zero slack");

  const diamondTasks = [
    { _id: "start", title: "Start Task", estimate_hours: 1, depends_on: [] },
    { _id: "long_branch", title: "Heavy Engine", estimate_hours: 10, depends_on: ["start"] },
    { _id: "short_branch", title: "Light Docs", estimate_hours: 2, depends_on: ["start"] },
    { _id: "end", title: "Release QA", estimate_hours: 2, depends_on: ["long_branch", "short_branch"] },
  ];

  const diamondSlack = calculateCriticalPathSlack(diamondTasks);
  assert.strictEqual(diamondSlack.get("start").isCritical, true);
  assert.strictEqual(diamondSlack.get("long_branch").isCritical, true);
  assert.strictEqual(diamondSlack.get("end").isCritical, true);
  assert.strictEqual(diamondSlack.get("short_branch").isCritical, false, "Short branch must have slack > 0");
  assert.strictEqual(diamondSlack.get("short_branch").slack, 8, "Short branch slack should be 8h");
  console.log("✓ Test 1b Passed: Diamond graph distinguishes critical path (0 slack) from non-critical path (8h slack)");

  // PART 2: getDownstreamBlocked
  console.log("\n--- PART 2: getDownstreamBlocked ---");
  const chainTasks = [
    { _id: "A", title: "Task A", status: "active", depends_on: [] },
    { _id: "B", title: "Task B", status: "active", depends_on: ["A"] },
    { _id: "C", title: "Task C", status: "active", depends_on: ["B"] },
    { _id: "D", title: "Task D", status: "completed", depends_on: ["C"] },
  ];

  const blockedA = getDownstreamBlocked({ _id: "A" }, chainTasks);
  assert.strictEqual(blockedA.count, 2, "Task A should block 2 active downstream tasks (B and C)");
  console.log("✓ Test 2a Passed: Correctly counts transitive active downstream tasks and ignores completed ones");

  // PART 3: calculateTaskPriority
  console.log("\n--- PART 3: calculateTaskPriority ---");
  const todayStr = "2026-09-04";
  const testProjectTasks = [
    { _id: "Crit1", title: "Architecture Core", estimate_hours: 10, status: "active", depends_on: [], end_date: "2026-09-14" },
    { _id: "Crit2", title: "Core Integration", estimate_hours: 10, status: "active", depends_on: ["Crit1"], end_date: "2026-09-24" },
    { _id: "Side1", title: "Documentation Guide", estimate_hours: 1, status: "active", depends_on: [], end_date: "2026-09-19" },
    { _id: "Side2", title: "Style Tweaks", estimate_hours: 1, status: "active", depends_on: ["Side1"], end_date: "2026-09-19" },
    { _id: "Hub", title: "API Gateway Dispatcher", estimate_hours: 1, status: "active", depends_on: [], end_date: "2026-09-19" },
    { _id: "Sub1", title: "Auth Consumer", estimate_hours: 1, status: "active", depends_on: ["Hub"], end_date: "2026-09-20" },
    { _id: "Sub2", title: "Billing Consumer", estimate_hours: 1, status: "active", depends_on: ["Hub"], end_date: "2026-09-20" },
    { _id: "Sub3", title: "Telemetry Consumer", estimate_hours: 1, status: "active", depends_on: ["Hub"], end_date: "2026-09-20" },
    { _id: "Single", title: "DB-Schema Design", estimate_hours: 1, status: "active", depends_on: [], end_date: "2026-09-19" },
    { _id: "SingleSub", title: "DB Migration Script", estimate_hours: 1, status: "active", depends_on: ["Single"], end_date: "2026-09-20" },
    { _id: "Urgent", title: "Security Patch 2.1", estimate_hours: 1, status: "active", depends_on: [], end_date: "2026-09-06" },
    { _id: "Normal", title: "Color Theme Refresh", estimate_hours: 1, status: "active", depends_on: [], end_date: "2026-09-29" },
  ];

  const p2Res = calculateTaskPriority(
    { _id: "Normal", title: "Color Theme Refresh", end_date: "2026-09-29" },
    testProjectTasks,
    "2026-09-29",
    todayStr
  );
  assert.strictEqual(p2Res.priority, "P2");
  assert.strictEqual(p2Res.downstreamBlockedCount, 0);
  assert.ok(p2Res.daysUntilMilestone > 3);
  console.log("� Test 3a Passed: Task with no dependents and distant milestone -> P2 (" + p2Res.reasoning + ")");

  const p1BlockerRes = calculateTaskPriority(
    { _id: "Single", title: "DB-Schema Design", end_date: "2026-09-19" },
    testProjectTasks,
    "2026-09-19",
    todayStr
  );
  assert.strictEqual(p1BlockerRes.priority, "P1");
  assert.strictEqual(p1BlockerRes.downstreamBlockedCount, 1);
  console.log("✓ Test 3b Passed: Task blocking exactly 1 downstream task -> P1 (" + p1BlockerRes.reasoning + ")");

  const p0HubRes = calculateTaskPriority(
    { _id: "Hub", title: "API Gateway Dispatcher", end_date: "2026-09-19" },
    testProjectTasks,
    "2026-09-19",
    todayStr
  );
  assert.strictEqual(p0HubRes.priority, "P0");
  assert.strictEqual(p0HubRes.downstreamBlockedCount, 3);
  console.log("✓ Test 3c Passed: Task blocking 2+ downstream tasks -> P0 (" + p0HubRes.reasoning + ")");

  const p0CrRtes = calculateTaskPriority(
    { _id: "Crit2", title: "Core Integration", end_date: "2026-09-24" },
    testProjectTasks,
    "2026-09-24",
    todayStr
  );
  assert.strictEqual(p0CrRtes.priority, "P0");
  assert.strictEqual(p0CrRtes.isOnCriticalPath, true);
  assert.strictEqual(p0CrRtes.downstreamBlockedCount, 0);
  console.log("✓ Test 3d Passed: Task on critical path with 0 downstream blockers -> still P0 (" + p0CrRtes.reasoning + ")");

  const p1DeadlineRes = calculateTaskPriority(
    { _id: "Urgent", title: "Security Patch 2.1", end_date: "2026-09-06" },
    testProjectTasks,
    "2026-09-06",
    todayStr
  );
  assert.strictEqual(p1DeadlineRes.priority, "P1");
  assert.strictEqual(p1DeadlineRes.daysUntilMilestone, 2);
  assert.strictEqual(p1DeadlineRes.downstreamBlockedCount, 0);
  console.log("� Test 3e Passed: Task with milestone 2 days away and no blockers -> P1 (" + p1DeadlineRes.reasoning + ")");

  // PART 4: sortQueueByPriority
  console.log("\n--- PART 4: sortQueueByPriority ---");
  const unorganizedQueue = [
    { title: "Task P2 Low", computed_priority: "P2", daysUntilMilestone: 10 },
    { title: "Task P0 Urgent", computed_priority: "P0", daysUntilMilestone: 8 },
    { title: "Task P1 Medium", computed_priority: "P1", daysUntilMilestone: 2 },
    { title: "Task P0 Imminent", computed_priority: "P0", daysUntilMilestone: 1 },
    { title: "Task P2 Backlog", computed_priority: "P2", daysUntilMilestone: 25 },
  ];

  const sorted = sortQueueByPriority(unorganizedQueue);
  const titles = sorted.map((t) => t.title);
  assert.deepStrictEqual(titles, [
    "Task P0 Imminent",
    "Task P0 Urgent",
    "Task P1 Medium",
    "Task P2 Low",
    "Task P2 Backlog",
  ]);
  console.log("✓ Test 4a Passed: Mixed P0/P1/P2 queue sorts correctly with P0 first, then P1, then P2");
  console.log("✓ Test 4b Passed: Two P0 tasks sort by soonest milestone deadline first (1 day before 8 days)");

  console.log("\n🎉 ALL PHASE 7 PURE LOGIC UNIT TESTS PASSED SUCCESSFULLY!");
}

if (require.main === module) {
  runPhase7UnitTests();
}

module.exports = { runPhase7UnitTests };
