/**
 * Phase 12 — Pure Logic Unit Tests (ZERO DATABASE)
 *
 * Tests:
 * 1. calculateRollbackImpact:
 *    - clean rollback (nothing completed, nothing conflicting) -> canRollback: true, empty orphanedWork
 *    - completed work present but no conflicts -> canRollback: true, orphanedWork populated (warning case, not a block)
 *    - task state diverged from 'after' snapshot -> canRollback: false, conflictingTasks populated with reason
 *    - multiple change transactions on same task, rolling back older while newer is active -> blocked
 * 2. computeFieldDiff:
 *    - detects modified/added/removed PRD fields accurately
 * 3. nextVersion:
 *    - correctly increments minor and major semver
 */

const assert = require("assert");
const {
  calculateRollbackImpact,
  computeFieldDiff,
  nextVersion,
} = require("./lib/changeRollback");

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

console.log("═══════════════════════════════════════════════════════");
console.log("PHASE 12 PURE LOGIC UNIT TESTS (ZERO DATABASE)");
console.log("═══════════════════════════════════════════════════════\n");

// ─── 1. calculateRollbackImpact Tests ─────────────────────────────────────────
console.log("--- 1. calculateRollbackImpact Tests ---");

runTest("Clean rollback (nothing completed, nothing conflicting) -> canRollback: true", () => {
  const changeTx = {
    _id: "tx_101",
    applied_at: new Date("2026-09-01T10:00:00Z"),
    tasks_added: ["task_new_1", "task_new_2"],
    tasks_modified: [
      {
        taskId: "task_exist_1",
        before: { title: "Original Title", estimate_hours: 8 },
        after: { title: "Expanded Title", estimate_hours: 14 },
      },
    ],
  };

  const currentTasks = [
    {
      _id: "task_new_1",
      title: "New Task 1",
      status: "active",
      logged_hours: 0,
      estimate_hours: 6,
    },
    {
      _id: "task_new_2",
      title: "New Task 2",
      status: "scheduled",
      logged_hours: 0,
      estimate_hours: 10,
    },
    {
      _id: "task_exist_1",
      title: "Expanded Title",
      status: "active",
      logged_hours: 2,
      estimate_hours: 14,
    },
  ];

  const impact = calculateRollbackImpact(changeTx, currentTasks, []);

  assert.strictEqual(impact.canRollback, true, "Should allow clean rollback");
  assert.strictEqual(impact.orphanedWork.length, 0, "No orphaned completed work");
  assert.strictEqual(impact.conflictingTasks.length, 0, "No conflicts");
  // Hours to be freed = 6 + 10 (from added) + (14 - 8) (from modified delta) = 22
  assert.strictEqual(impact.hoursToBeFreed, 22, "Should accurately sum hours to be freed");
  assert.strictEqual(impact.blockReason, null);
});

runTest("Completed work present but no conflicts -> canRollback: true, orphanedWork populated (warning, not a block)", () => {
  const changeTx = {
    _id: "tx_102",
    applied_at: new Date("2026-09-02T10:00:00Z"),
    tasks_added: ["task_done_1", "task_pending_2"],
    tasks_modified: [],
  };

  const currentTasks = [
    {
      _id: "task_done_1",
      title: "Finished Feature Subsystem",
      status: "completed",
      logged_hours: 12,
      estimate_hours: 10,
    },
    {
      _id: "task_pending_2",
      title: "Unstarted Spike",
      status: "active",
      logged_hours: 0,
      estimate_hours: 8,
    },
  ];

  const impact = calculateRollbackImpact(changeTx, currentTasks, []);

  assert.strictEqual(impact.canRollback, true, "Completed work alone does not block rollback");
  assert.strictEqual(impact.orphanedWork.length, 1, "Should report 1 orphaned completed work item");
  assert.strictEqual(impact.orphanedWork[0].taskId, "task_done_1");
  assert.strictEqual(impact.orphanedWork[0].hoursCompleted, 12);
  assert.strictEqual(impact.conflictingTasks.length, 0);
  assert.strictEqual(impact.hoursToBeFreed, 8, "Only uncompleted tasks count towards freed hours");
});

runTest("Task state diverged from 'after' snapshot -> canRollback: false, conflictingTasks populated", () => {
  const changeTx = {
    _id: "tx_103",
    applied_at: new Date("2026-09-03T10:00:00Z"),
    tasks_added: [],
    tasks_modified: [
      {
        taskId: "task_diverged_1",
        before: { estimate_hours: 10, title: "Initial Spec" },
        after: { estimate_hours: 18, title: "Adjusted Spec" },
      },
    ],
  };

  // Someone subsequently changed estimate_hours from 18 to 25 without a formal parent rollback
  const currentTasks = [
    {
      _id: "task_diverged_1",
      title: "Adjusted Spec",
      estimate_hours: 25, // differs from 18!
      status: "active",
    },
  ];

  const impact = calculateRollbackImpact(changeTx, currentTasks, []);

  assert.strictEqual(impact.canRollback, false, "Should block rollback when state has diverged");
  assert.strictEqual(impact.conflictingTasks.length, 1);
  assert.strictEqual(impact.conflictingTasks[0].taskId, "task_diverged_1");
  assert(impact.conflictingTasks[0].reason.includes("diverged"));
  assert(impact.blockReason && impact.blockReason.includes("conflict"));
});

runTest("Multiple change transactions on the same task, rolling back older while newer is active -> blocked", () => {
  const olderTx = {
    _id: "tx_older",
    applied_at: new Date("2026-09-01T10:00:00Z"),
    change_description: "V1.1 Scope Expansion",
    tasks_added: ["task_alpha"],
    tasks_modified: [],
  };

  const newerTx = {
    _id: "tx_newer",
    applied_at: new Date("2026-09-04T12:00:00Z"),
    change_description: "V1.2 Emergency Refactor",
    status: "applied",
    tasks_added: [],
    tasks_modified: [
      {
        taskId: "task_alpha",
        before: { estimate_hours: 10 },
        after: { estimate_hours: 16 },
      },
    ],
  };

  const currentTasks = [
    {
      _id: "task_alpha",
      title: "Task Alpha",
      estimate_hours: 16,
      status: "active",
    },
  ];

  const impact = calculateRollbackImpact(olderTx, currentTasks, [newerTx]);

  assert.strictEqual(impact.canRollback, false, "Should block older rollback when newer tx touches task");
  assert.strictEqual(impact.conflictingTasks.length, 1);
  assert.strictEqual(impact.conflictingTasks[0].taskId, "task_alpha");
  assert(impact.conflictingTasks[0].reason.includes("subsequent active change transaction"));
});

// ─── 2. computeFieldDiff Tests ───────────────────────────────────────────────
console.log("\n--- 2. computeFieldDiff PRD Version Diffing Tests ---");

runTest("Detects modified, added, and removed PRD sections accurately", () => {
  const v1 = {
    executive_summary: "Initial MVP scope for checkout",
    scope_in: ["Cart page", "Stripe payment"],
    scope_out: ["Apple Pay"],
    user_stories: [{ story: "Checkout as guest", given: "Cart has items", when: "Click pay", then: "Process payment" }],
    technical_architecture: "Node + React monolithic architecture",
  };

  const v2 = {
    executive_summary: "Expanded MVP with Apple Pay integration",
    scope_in: ["Cart page", "Stripe payment", "Apple Pay"],
    scope_out: ["Cryptocurrency payment"],
    user_stories: [{ story: "Checkout as guest", given: "Cart has items", when: "Click pay", then: "Process payment" }],
    technical_architecture: "Node + React + Microservice Payment Gateway",
  };

  const diffs = computeFieldDiff(v1, v2);

  assert.strictEqual(diffs.length, 4, "Should identify 4 changed top-level fields");
  const fields = diffs.map((d) => d.field);
  assert(fields.includes("executive_summary"));
  assert(fields.includes("scope_in"));
  assert(fields.includes("scope_out"));
  assert(fields.includes("technical_architecture"));
  assert(!fields.includes("user_stories"), "Unchanged user stories should not appear in diff");
});

// ─── 3. nextVersion Semver Tests ─────────────────────────────────────────────
console.log("\n--- 3. nextVersion Semver Increment Tests ---");

runTest("Increments minor and major versions properly", () => {
  assert.strictEqual(nextVersion("1.0", false), "1.1");
  assert.strictEqual(nextVersion("1.1", false), "1.2");
  assert.strictEqual(nextVersion("1.9", false), "1.10");
  assert.strictEqual(nextVersion("1.0", true), "2.0");
  assert.strictEqual(nextVersion("2.3", true), "3.0");
});

console.log("\n═══════════════════════════════════════════════════════");
console.log(`PHASE 12 UNIT TESTS SUMMARY: ${passedTests}/${totalTests} PASSED`);
console.log("═══════════════════════════════════════════════════════");
console.log("ALL PHASE 12 PURE LOGIC UNIT TESTS PASSED SUCCESSFULLY! ✓\n");
