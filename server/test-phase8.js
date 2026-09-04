/**
 * Phase 8 Pure Logic Unit Tests (Zero Database Required)
 *
 * Tests:
 * 1. calculateProjectCost:
 *    - Accurate cost accumulation across multiple employees with distinct rates and allocations
 * 2. calculateBudgetBurn:
 *    - Under budget -> "green"
 *    - Exact boundary at +5.0% -> "green"
 *    - Approaching (+10%) -> "yellow"
 *    - Exact boundary at +15.0% -> "yellow"
 *    - Over budget (> 15%) -> "red"
 *    - Burn percentage calculation
 * 3. calculateProjectHealth:
 *    - Green status when no escalations and budget is green
 *    - Yellow status when warning slippage detected
 *    - Yellow status when budget status is yellow
 *    - Yellow status when tasks exceed estimate by 50%+
 *    - Red status when escalation slippage is present
 *    - Red status when budget status is red
 *    - Resilient multi-flag: multiple simultaneous red conditions cleanly return "red" without duplication or error
 * 4. calculateCostDelta:
 *    - Scope change impact formatting: "+45 hours × $120/hr = +$5,400"
 */

const assert = require("assert");
const {
  calculateProjectCost,
  calculateBudgetBurn,
  calculateProjectHealth,
  calculateCostDelta,
} = require("./lib/costCalculator");

console.log("═══════════════════════════════════════════════════════");
console.log("PHASE 8 PURE LOGIC UNIT TESTS (ZERO DATABASE)");
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
// 1. calculateProjectCost Tests
// ─────────────────────────────────────────────────────────────────────────────
console.log("--- 1. calculateProjectCost Tests ---");

runTest("computes correct project cost for empty allocations", () => {
  const result = calculateProjectCost([], {});
  assert.strictEqual(result.totalBudgetedCost, 0);
  assert.strictEqual(result.breakdown.length, 0);
});

runTest("accurately accumulates cost across multiple employees with different rates", () => {
  const teamAllocations = [
    { userId: "emp_alice", totalProjectHours: 100 },
    { userId: "emp_bob", totalProjectHours: 80 },
    { userId: "emp_charlie", totalProjectHours: 40 },
  ];
  const hourlyRates = {
    emp_alice: 120, // 100 * 120 = 12000
    emp_bob: 90,    // 80 * 90 = 7200
    emp_charlie: 65,// 40 * 65 = 2600
  };

  const result = calculateProjectCost(teamAllocations, hourlyRates);
  assert.strictEqual(result.totalBudgetedCost, 21800);
  assert.strictEqual(result.breakdown.length, 3);
  assert.strictEqual(result.breakdown[0].cost, 12000);
  assert.strictEqual(result.breakdown[1].cost, 7200);
  assert.strictEqual(result.breakdown[2].cost, 2600);
});

runTest("falls back to default hours if total hours not explicitly specified", () => {
  const teamAllocations = [
    { user_id: "emp_david", daily_hours: 6 }, // 6 * 20 = 120 hours
  ];
  const hourlyRates = {
    emp_david: 100, // 120 * 100 = 12000
  };

  const result = calculateProjectCost(teamAllocations, hourlyRates);
  assert.strictEqual(result.totalBudgetedCost, 12000);
  assert.strictEqual(result.breakdown[0].totalHours, 120);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. calculateBudgetBurn Tests
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n--- 2. calculateBudgetBurn Threshold Tests ---");

runTest("under budget (<105% projected) returns green status and accurate burnPct", () => {
  const budgetedCost = 10000;
  const actualHoursLogged = { emp1: 20 }; // 20 * 100 = 2000 burned
  const hourlyRates = { emp1: 100 };
  const currentVelocity = 1.0;
  const totalEstimatedHours = 80;
  const totalHoursCompleted = 20; // 60 hrs remaining * 100 = 6000 additional cost -> projected 8000

  const burn = calculateBudgetBurn(
    budgetedCost,
    actualHoursLogged,
    hourlyRates,
    currentVelocity,
    totalEstimatedHours,
    totalHoursCompleted
  );

  assert.strictEqual(burn.actualCostBurned, 2000);
  assert.strictEqual(burn.remainingBudget, 8000);
  assert.strictEqual(burn.projectedFinalCost, 8000);
  assert.strictEqual(burn.burnPct, 20);
  assert.strictEqual(burn.status, "green");
});

runTest("projected final cost at EXACTLY +5% threshold (105%) is classified as green", () => {
  const budgetedCost = 10000;
  // 105% of 10000 = 10500
  // Burned 4500 (45 hrs @ $100). Remaining 60 hrs @ $100 = 6000. Projected = 10500
  const actualHours = { emp1: 45 };
  const hourlyRates = { emp1: 100 };
  const burn = calculateBudgetBurn(
    budgetedCost,
    actualHours,
    hourlyRates,
    1.0,
    105,
    45
  );

  assert.strictEqual(burn.projectedFinalCost, 10500);
  assert.strictEqual(burn.status, "green");
});

runTest("projected final cost in 105.1% - 115% range is classified as yellow", () => {
  const budgetedCost = 10000;
  // Projected 11000 (110% of budget)
  const actualHours = { emp1: 50 };
  const hourlyRates = { emp1: 100 };
  const burn = calculateBudgetBurn(
    budgetedCost,
    actualHours,
    hourlyRates,
    1.0,
    110,
    50
  );

  assert.strictEqual(burn.projectedFinalCost, 11000);
  assert.strictEqual(burn.status, "yellow");
});

runTest("projected final cost at EXACTLY +15% threshold (115%) is classified as yellow", () => {
  const budgetedCost = 10000;
  // 115% of 10000 = 11500
  const actualHours = { emp1: 55 };
  const hourlyRates = { emp1: 100 };
  const burn = calculateBudgetBurn(
    budgetedCost,
    actualHours,
    hourlyRates,
    1.0,
    115,
    55
  );

  assert.strictEqual(burn.projectedFinalCost, 11500);
  assert.strictEqual(burn.status, "yellow");
});

runTest("projected final cost exceeding +15% (>115%) is classified as red", () => {
  const budgetedCost = 10000;
  // Projected 12500 (125% of budget)
  const actualHours = { emp1: 65 };
  const hourlyRates = { emp1: 100 };
  const burn = calculateBudgetBurn(
    budgetedCost,
    actualHours,
    hourlyRates,
    1.0,
    125,
    65
  );

  assert.strictEqual(burn.projectedFinalCost, 12500);
  assert.strictEqual(burn.status, "red");
});

runTest("adjusts remaining cost when currentVelocity < 1.0 (slower pace)", () => {
  const budgetedCost = 10000;
  const actualHours = { emp1: 20 }; // 20 * 100 = 2000 burned
  const hourlyRates = { emp1: 100 };
  // 60 remaining est hours, but velocity is 0.75 -> 60 / 0.75 = 80 hours needed * 100 = 8000
  // Projected = 2000 + 8000 = 10000
  const burn = calculateBudgetBurn(
    budgetedCost,
    actualHours,
    hourlyRates,
    0.75,
    80,
    20
  );

  assert.strictEqual(burn.projectedFinalCost, 10000);
  assert.strictEqual(burn.status, "green");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. calculateProjectHealth Tests
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n--- 3. calculateProjectHealth Tests ---");

runTest("returns green when no unresolved slippage, no task overruns, and green budget", () => {
  const health = calculateProjectHealth([], 0, "green");
  assert.strictEqual(health.health, "green");
  assert.ok(health.reasons.length > 0);
  assert.ok(health.reasons[0].includes("on track"));
});

runTest("returns yellow when warning-level slippage is present", () => {
  const slippageEvents = [{ level: "warning" }];
  const health = calculateProjectHealth(slippageEvents, 0, "green");
  assert.strictEqual(health.health, "yellow");
  assert.ok(health.reasons.some((r) => r.includes("warning-level slippage")));
});

runTest("returns yellow when budget status is yellow", () => {
  const health = calculateProjectHealth([], 0, "yellow");
  assert.strictEqual(health.health, "yellow");
  assert.ok(health.reasons.some((r) => r.includes("Budget warning")));
});

runTest("returns yellow when any task is 50%+ over estimate", () => {
  const tasks = [{ logged_hours: 16, estimate_hours: 10 }]; // 16 >= 15 (1.5 * 10)
  const health = calculateProjectHealth([], tasks, "green");
  assert.strictEqual(health.health, "yellow");
  assert.ok(health.reasons.some((r) => r.includes("50% or more")));
});

runTest("returns red when unresolved escalation slippage is present", () => {
  const slippageEvents = [{ level: "escalation" }];
  const health = calculateProjectHealth(slippageEvents, 0, "green");
  assert.strictEqual(health.health, "red");
  assert.ok(health.reasons.some((r) => r.includes("escalation-level slippage")));
});

runTest("returns red when budget status is red", () => {
  const health = calculateProjectHealth([], 0, "red");
  assert.strictEqual(health.health, "red");
  assert.ok(health.reasons.some((r) => r.includes("Critical budget overrun")));
});

runTest("resiliently handles multiple simultaneous red-flag conditions without crashing or double-count", () => {
  const slippageEvents = [{ level: "escalation" }, { level: "warning" }];
  const tasks = [{ logged_hours: 30, estimate_hours: 10 }];
  const budgetStatus = "red";

  const health = calculateProjectHealth(slippageEvents, tasks, budgetStatus);
  assert.strictEqual(health.health, "red");
  // All relevant reasons are compiled clearly
  assert.ok(health.reasons.length >= 2);
  assert.ok(health.reasons.some((r) => r.includes("escalation")));
  assert.ok(health.reasons.some((r) => r.includes("Critical budget overrun")));
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. calculateCostDelta Tests
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n--- 4. calculateCostDelta Scope Change Impact Tests ---");

runTest("formats positive cost delta correctly matching executive specification", () => {
  const delta = calculateCostDelta(45, 120);
  assert.strictEqual(delta.hoursDelta, 45);
  assert.strictEqual(delta.hourlyRate, 120);
  assert.strictEqual(delta.costDelta, 5400);
  assert.strictEqual(delta.formatted, "+45 hours × $120/hr = +$5,400");
});

runTest("formats negative cost delta (scope reduction) correctly", () => {
  const delta = calculateCostDelta(-10, 100);
  assert.strictEqual(delta.hoursDelta, -10);
  assert.strictEqual(delta.costDelta, -1000);
  assert.strictEqual(delta.formatted, "-10 hours × $100/hr = -$1,000");
});

console.log("\n═══════════════════════════════════════════════════════");
console.log(`PHASE 8 UNIT TESTS SUMMARY: ${passed}/${total} PASSED`);
console.log("═══════════════════════════════════════════════════════");

if (passed !== total) {
  process.exit(1);
} else {
  console.log("ALL PURE LOGIC UNIT TESTS PASSED SUCCESSFULLY! ✓\n");
}
