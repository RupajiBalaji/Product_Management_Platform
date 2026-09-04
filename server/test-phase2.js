const assert = require("assert");
const { checkForCycle, detectCycleInGraph } = require("./lib/dagValidation");

async function runPhase2UnitTests() {
  console.log("🧪 Running Phase 2 DAG Cycle Detection Unit Tests...\n");

  // Test Case 1: No dependencies (clean)
  {
    const tasks = [
      { _id: "task_A", depends_on: [] },
      { _id: "task_B", depends_on: [] },
      { _id: "task_C", depends_on: [] },
    ];
    const res = await checkForCycle("task_A", [], tasks);
    assert.strictEqual(res.hasCycle, false, "Test 1 Failed: Expected hasCycle=false");
    console.log("✓ Test 1 Passed: No dependencies (clean)");
  }

  // Test Case 2: Valid linear chain (A → B → C, clean)
  {
    // C has no deps, B depends on C, A proposes to depend on B
    const tasks = [
      { _id: "task_A", depends_on: [] },
      { _id: "task_B", depends_on: ["task_C"] },
      { _id: "task_C", depends_on: [] },
    ];
    const res = await checkForCycle("task_A", ["task_B"], tasks);
    assert.strictEqual(res.hasCycle, false, "Test 2 Failed: Expected hasCycle=false");
    console.log("✓ Test 2 Passed: Valid linear chain A → B → C (clean)");
  }

  // Test Case 3: Direct cycle (A → B → A, detected)
  {
    // A depends on B, B proposes to depend on A
    const tasks = [
      { _id: "task_A", depends_on: ["task_B"] },
      { _id: "task_B", depends_on: [] },
    ];
    const res = await checkForCycle("task_B", ["task_A"], tasks);
    assert.strictEqual(res.hasCycle, true, "Test 3 Failed: Expected hasCycle=true");
    assert.deepStrictEqual(res.path, ["task_B", "task_A", "task_B"], "Test 3 Failed: Cycle path mismatch");
    console.log(`✓ Test 3 Passed: Direct cycle detected -> Path: ${res.path.join(" → ")}`);
  }

  // Test Case 4: Indirect cycle (A → B → C → A, detected, correct path returned)
  {
    // A depends on B, B depends on C, C proposes to depend on A
    const tasks = [
      { _id: "task_A", depends_on: ["task_B"] },
      { _id: "task_B", depends_on: ["task_C"] },
      { _id: "task_C", depends_on: [] },
    ];
    const res = await checkForCycle("task_C", ["task_A"], tasks);
    assert.strictEqual(res.hasCycle, true, "Test 4 Failed: Expected hasCycle=true");
    assert.deepStrictEqual(res.path, ["task_C", "task_A", "task_B", "task_C"], "Test 4 Failed: Cycle path mismatch");
    console.log(`✓ Test 4 Passed: Indirect cycle detected -> Path: ${res.path.join(" → ")}`);
  }

  // Test Case 5: Self-dependency (A → A, detected)
  {
    const tasks = [
      { _id: "task_A", depends_on: [] },
    ];
    const res = await checkForCycle("task_A", ["task_A"], tasks);
    assert.strictEqual(res.hasCycle, true, "Test 5 Failed: Expected hasCycle=true");
    assert.deepStrictEqual(res.path, ["task_A", "task_A"], "Test 5 Failed: Cycle path mismatch");
    console.log(`✓ Test 5 Passed: Self-dependency detected -> Path: ${res.path.join(" → ")}`);
  }

  // Test Case 6: Diamond dependency (A → B → D, A → C → D — clean, this is NOT a cycle)
  {
    // D has no deps, B depends on D, C depends on D, A depends on [B, C]
    const tasks = [
      { _id: "task_A", depends_on: [] },
      { _id: "task_B", depends_on: ["task_D"] },
      { _id: "task_C", depends_on: ["task_D"] },
      { _id: "task_D", depends_on: [] },
    ];
    const res = await checkForCycle("task_A", ["task_B", "task_C"], tasks);
    assert.strictEqual(res.hasCycle, false, "Test 6 Failed: Diamond dependency falsely identified as cycle");
    console.log("✓ Test 6 Passed: Diamond dependency A → (B, C) → D (clean, NOT a cycle)");
  }

  console.log("\n🎉 ALL 6 DAG CYCLE DETECTION UNIT TESTS PASSED SUCCESSFULLY!");
}

runPhase2UnitTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
