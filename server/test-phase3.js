const assert = require("assert");
const {
  checkCapacityConflict,
  resolveConflictByPriority,
} = require("./lib/capacityRegistry");

async function runPhase3UnitTests() {
  console.log("🧪 Running Phase 3 Capacity Registry & Priority Conflict Resolution Unit Tests...\n");

  // Test Case 1: No existing allocations, new allocation within cap → no conflict
  {
    const mockAlloc = {
      userId: "user_dev1",
      totalDailyHours: 0,
      dailyCap: 8,
      utilizationPct: 0,
      isOverAllocated: false,
      projects: [],
    };
    const res = await checkCapacityConflict("user_dev1", "proj_A", 6, mockAlloc);
    assert.strictEqual(res.hasConflict, false, "Test 1 Failed: Expected hasConflict=false");
    console.log("✓ Test 1 Passed: No existing allocations, new allocation within cap -> No conflict");
  }

  // Test Case 2: Existing allocations exactly at cap, new allocation of 0 → no conflict (edge case)
  {
    const mockAlloc = {
      userId: "user_dev1",
      totalDailyHours: 8,
      dailyCap: 8,
      utilizationPct: 100,
      isOverAllocated: false,
      projects: [
        { projectId: "proj_A", projectTitle: "Project A", priority: "P2", dailyHours: 8 },
      ],
    };
    const res = await checkCapacityConflict("user_dev1", "proj_B", 0, mockAlloc);
    assert.strictEqual(res.hasConflict, false, "Test 2 Failed: Expected hasConflict=false");
    console.log("✓ Test 2 Passed: Existing allocations exactly at cap, new allocation of 0 -> No conflict (edge case)");
  }

  // Test Case 3: Existing + new exceeds cap → conflict detected with correct overflow amount
  {
    const mockAlloc = {
      userId: "user_dev1",
      totalDailyHours: 6,
      dailyCap: 8,
      utilizationPct: 75,
      isOverAllocated: false,
      projects: [
        { projectId: "proj_A", projectTitle: "Project A", priority: "P2", dailyHours: 6 },
      ],
    };
    // Proposing 4 hrs for proj_B -> Total 10 hrs -> Cap 8 -> Overflow 2 hrs
    const res = await checkCapacityConflict("user_dev1", "proj_B", 4, mockAlloc);
    assert.strictEqual(res.hasConflict, true, "Test 3 Failed: Expected hasConflict=true");
    assert.strictEqual(res.overflowHours, 2, "Test 3 Failed: Expected overflowHours=2");
    assert.strictEqual(res.currentTotal, 6, "Test 3 Failed: Expected currentTotal=6");
    assert.strictEqual(res.proposedTotal, 10, "Test 3 Failed: Expected proposedTotal=10");
    console.log(`✓ Test 3 Passed: Existing (6h) + New (4h) exceeds Cap (8h) -> Conflict detected (Overflow: ${res.overflowHours} hrs)`);
  }

  // Test Case 4: Conflict between two P2 projects (equal priority)
  // → resolution suggestion: not automatically resolvable, needs manual product_lead decision
  {
    const mockAlloc = {
      userId: "user_dev1",
      totalDailyHours: 8,
      dailyCap: 8,
      utilizationPct: 100,
      isOverAllocated: false,
      projects: [
        { projectId: "proj_A", projectTitle: "Existing Project A", priority: "P2", dailyHours: 8 },
      ],
    };
    // Proposing 2 hrs on proj_B (P2)
    const res = await resolveConflictByPriority("user_dev1", "proj_B", "P2", 2, mockAlloc);
    assert.strictEqual(res.resolvable, false, "Test 4 Failed: Expected resolvable=false for equal priority");
    assert.ok(
      res.reason.includes("equal priority") || res.reason.includes("Product Lead decision"),
      "Test 4 Failed: Reason must specify equal priority / manual decision"
    );
    assert.strictEqual(res.reductions.length, 0, "Test 4 Failed: Reductions must be empty for equal priority");
    console.log(`✓ Test 4 Passed: Conflict between equal P2 priorities -> Flagged for manual Product Lead decision`);
  }

  // Test Case 5: Conflict where incoming is P1 and existing is P3
  // → resolution: reduce P3 project
  {
    const mockAlloc = {
      userId: "user_dev1",
      totalDailyHours: 6,
      dailyCap: 8,
      utilizationPct: 75,
      isOverAllocated: false,
      projects: [
        { projectId: "proj_P3", projectTitle: "Strategic Research", priority: "P3", dailyHours: 6 },
      ],
    };
    // Proposing 5 hrs on proj_P1 (P1 Mission-Critical) -> Overflow is (6 + 5) - 8 = 3 hrs
    const res = await resolveConflictByPriority("user_dev1", "proj_P1", "P1", 5, mockAlloc);
    assert.strictEqual(res.resolvable, true, "Test 5 Failed: Expected resolvable=true");
    assert.strictEqual(res.reductions.length, 1, "Test 5 Failed: Expected 1 reduction");
    assert.strictEqual(res.reductions[0].projectId, "proj_P3", "Test 5 Failed: Should reduce proj_P3");
    assert.strictEqual(res.reductions[0].reduceBy, 3, "Test 5 Failed: Should reduce P3 by 3 hours");
    assert.strictEqual(res.reductions[0].suggestedHours, 3, "Test 5 Failed: Suggested hours for P3 should be 3");
    console.log(`✓ Test 5 Passed: Incoming P1 beats Existing P3 -> Suggested reduction of P3 by ${res.reductions[0].reduceBy} hrs (New: ${res.reductions[0].suggestedHours} hrs)`);
  }

  // Test Case 6: Conflict where incoming is P3 and existing is P1
  // → resolution: P1 should NOT be touched; reduce the new P3 request itself
  {
    const mockAlloc = {
      userId: "user_dev1",
      totalDailyHours: 8,
      dailyCap: 8,
      utilizationPct: 100,
      isOverAllocated: false,
      projects: [
        { projectId: "proj_P1", projectTitle: "Mission-Critical Core", priority: "P1", dailyHours: 8 },
      ],
    };
    // Proposing 2 hrs on proj_P3 (P3 Strategic) -> Overflow 2 hrs
    const res = await resolveConflictByPriority("user_dev1", "proj_P3", "P3", 2, mockAlloc);
    assert.strictEqual(res.resolvable, false, "Test 6 Failed: Expected resolvable=false (incoming P3 cannot displace P1)");
    assert.strictEqual(res.reductions.length, 0, "Test 6 Failed: P1 must NOT be touched; reductions must be empty");
    assert.ok(
      res.reason.includes("equal or lower priority") || res.reason.includes("reducing the proposed allocation"),
      "Test 6 Failed: Reason must mention reducing the proposed allocation"
    );
    console.log(`✓ Test 6 Passed: Incoming P3 cannot displace existing P1 -> P1 protected, suggested reducing proposed P3 request`);
  }

  console.log("\n🎉 ALL 6 CAPACITY REGISTRY & CONFLICT RESOLUTION UNIT TESTS PASSED SUCCESSFULLY!");
}

runPhase3UnitTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
