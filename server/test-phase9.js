/**
 * Phase 9 Pure Logic Unit Tests (Zero Database Required)
 *
 * Tests:
 * 1. canAccessCreationThread:
 *    - product_lead is always allowed
 *    - invited expert with active invite is allowed on active thread
 *    - invited expert with revoked_at set is denied
 *    - user never invited is denied
 *    - finalized thread denies even a previously-active expert
 *    - lead_architect on their own project is allowed
 *    - lead_architect on someone else's project is denied
 * 2. filterThreadDataForExpert:
 *    - Strict allowlist enforcement: sensitive fields (budgeted_cost, hourly_cost_rate,
 *      team_allocations, actualCostBurned, member_ids) are completely ABSENT from output keys
 *    - Allowlisted fields (messages, title, description, created_at) are properly retained
 */

const assert = require("assert");
const {
  canAccessCreationThread,
  filterThreadDataForExpert,
} = require("./lib/creationThreadAccess");

console.log("═══════════════════════════════════════════════════════");
console.log("PHASE 9 PURE LOGIC UNIT TESTS (ZERO DATABASE)");
console.log("═══════════════════════════════════════════════════════\n");

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. canAccessCreationThread Tests
// ─────────────────────────────────────────────────────────────────────────────
console.log("--- 1. canAccessCreationThread Scoped Access Tests ---");

runTest("product_lead is always granted access regardless of thread or project status", () => {
  const leadUser = { _id: "usr_lead_alex", user_type: "product_lead" };
  const finalizedThread = { status: "finalized", invited_experts: [] };
  const foreignProject = { created_by: "someone_else", member_ids: [] };

  const res = canAccessCreationThread(leadUser, finalizedThread, foreignProject);
  assert.strictEqual(res.allowed, true);
  assert.ok(res.reason.includes("Product Lead"));
});

runTest("invited expert with an active invite is granted access on active thread", () => {
  const expertUser = { _id: "usr_sme_clara", user_type: "employee" };
  const activeThread = {
    status: "active",
    invited_experts: [
      { user_id: "usr_sme_clara", invited_by: "usr_lead_alex", revoked_at: null },
    ],
  };
  const project = { created_by: "usr_lead_alex" };

  const res = canAccessCreationThread(expertUser, activeThread, project);
  assert.strictEqual(res.allowed, true);
  assert.ok(res.reason.includes("Active invited expert"));
});

runTest("invited expert whose invite has revoked_at set is denied access", () => {
  const expertUser = { _id: "usr_sme_clara", user_type: "employee" };
  const activeThread = {
    status: "active",
    invited_experts: [
      {
        user_id: "usr_sme_clara",
        invited_by: "usr_lead_alex",
        revoked_at: new Date("2026-09-01"),
      },
    ],
  };
  const project = { created_by: "usr_lead_alex" };

  const res = canAccessCreationThread(expertUser, activeThread, project);
  assert.strictEqual(res.allowed, false);
  assert.ok(res.reason.includes("revoked"));
});

runTest("contributor who was never invited is denied access", () => {
  const randomUser = { _id: "usr_random_dev", user_type: "employee" };
  const activeThread = {
    status: "active",
    invited_experts: [
      { user_id: "usr_sme_other", invited_by: "usr_lead_alex", revoked_at: null },
    ],
  };
  const project = { created_by: "usr_lead_alex" };

  const res = canAccessCreationThread(randomUser, activeThread, project);
  assert.strictEqual(res.allowed, false);
  assert.ok(res.reason.includes("not an invited expert"));
});

runTest("finalized thread denies access even for a previously-active expert", () => {
  const expertUser = { _id: "usr_sme_clara", user_type: "employee" };
  const finalizedThread = {
    status: "finalized",
    invited_experts: [
      { user_id: "usr_sme_clara", invited_by: "usr_lead_alex", revoked_at: null },
    ],
  };
  const project = { created_by: "usr_lead_alex" };

  const res = canAccessCreationThread(expertUser, finalizedThread, project);
  assert.strictEqual(res.allowed, false);
  assert.ok(res.reason.includes("finalized"));
});

runTest("lead_architect on their own project is granted access without invite", () => {
  const archUser = { _id: "usr_arch_sophia", user_type: "lead_architect" };
  const thread = { status: "active", invited_experts: [] };
  const ownProject = {
    created_by: "usr_lead_alex",
    member_ids: ["usr_arch_sophia", "usr_dev_1"],
  };

  const res = canAccessCreationThread(archUser, thread, ownProject);
  assert.strictEqual(res.allowed, true);
  assert.ok(res.reason.includes("Lead Architect"));
});

runTest("lead_architect on an unassigned project without invite is denied access", () => {
  const archUser = { _id: "usr_arch_sophia", user_type: "lead_architect" };
  const thread = { status: "active", invited_experts: [] };
  const foreignProject = {
    created_by: "usr_lead_alex",
    member_ids: ["usr_dev_1", "usr_dev_2"],
    team_allocations: [],
  };

  const res = canAccessCreationThread(archUser, thread, foreignProject);
  assert.strictEqual(res.allowed, false);
  assert.ok(res.reason.includes("not assigned"));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. filterThreadDataForExpert Allowlist Tests
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n--- 2. filterThreadDataForExpert Strict Allowlist Tests ---");

runTest("ensures sensitive financial and allocation keys are strictly absent from output", () => {
  const rawInput = {
    _id: "thread_123",
    project_id: "proj_abc",
    title: "AI Payment Gateway Architecture",
    description: "Clarification thread for core payment security and regulatory compliance.",
    status: "active",
    // SENSITIVE FIELDS (must be strictly stripped):
    budgeted_cost: 75000,
    budget: { total: 75000, actual: 12000 },
    hourly_cost_rate: 180,
    actualCostBurned: 12000,
    remainingBudget: 63000,
    projectedFinalCost: 72000,
    team_allocations: [
      { user_id: "dev_1", daily_hours: 8, hourly_rate: 120 },
      { user_id: "dev_2", daily_hours: 4, hourly_rate: 90 },
    ],
    member_ids: ["dev_1", "dev_2"],
    internal_financial_notes: "Executive sign-off required for vendor licensing.",
    messages: [
      {
        author_id: "usr_lead_alex",
        author_name: "Alex Turner",
        author_role_at_time: "product_lead",
        content: "What are the PCI-DSS L1 requirements for tokenization storage?",
        created_at: new Date("2026-09-04T10:00:00Z"),
      },
      {
        author_id: "usr_sme_clara",
        author_name: "Clara Oswald",
        author_role_at_time: "invited_expert",
        content: "Hardware Security Modules (HSM) must be utilized for encryption keys.",
        created_at: new Date("2026-09-04T10:15:00Z"),
      },
    ],
  };

  const filtered = filterThreadDataForExpert(rawInput);

  // 1. Verify ALLOWLISTED fields are present and intact
  assert.strictEqual(filtered._id, "thread_123");
  assert.strictEqual(filtered.project_id, "proj_abc");
  assert.strictEqual(filtered.title, "AI Payment Gateway Architecture");
  assert.strictEqual(filtered.status, "active");
  assert.strictEqual(filtered.messages.length, 2);
  assert.strictEqual(filtered.messages[0].author_role_at_time, "product_lead");
  assert.strictEqual(filtered.messages[1].author_role_at_time, "invited_expert");

  // 2. CRITICAL SECURITY ASSERTION:
  // Assert sensitive keys are COMPLETELY ABSENT (key does not exist in object)
  assert.strictEqual("budgeted_cost" in filtered, false, "'budgeted_cost' key must not exist");
  assert.strictEqual("budget" in filtered, false, "'budget' key must not exist");
  assert.strictEqual("hourly_cost_rate" in filtered, false, "'hourly_cost_rate' key must not exist");
  assert.strictEqual("actualCostBurned" in filtered, false, "'actualCostBurned' key must not exist");
  assert.strictEqual("remainingBudget" in filtered, false, "'remainingBudget' key must not exist");
  assert.strictEqual("projectedFinalCost" in filtered, false, "'projectedFinalCost' key must not exist");
  assert.strictEqual("team_allocations" in filtered, false, "'team_allocations' key must not exist");
  assert.strictEqual("member_ids" in filtered, false, "'member_ids' key must not exist");
  assert.strictEqual("internal_financial_notes" in filtered, false, "'internal_financial_notes' key must not exist");
});

console.log("\n═══════════════════════════════════════════════════════");
console.log(`PHASE 9 UNIT TESTS SUMMARY: ${passed}/${total} PASSED`);
console.log("═══════════════════════════════════════════════════════");

if (passed !== total) {
  process.exit(1);
} else {
  console.log("ALL PHASE 9 PURE LOGIC UNIT TESTS PASSED SUCCESSFULLY! ✓\n");
}
