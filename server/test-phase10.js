/**
 * Phase 10 — Pure Logic Unit Tests (Zero Database Required)
 *
 * Tests:
 * 1. canViewThread (Gantt visibility tiers: full, own_data_only, own_plus_dependency)
 * 2. canAccessDirectMessage & sortParticipantIds
 * 3. detectDependencyReference (task titles & dependency phrases)
 * 4. detectUnresolvedDisagreement (staleness window & mocked AI evaluator)
 */

const assert = require("assert");
const {
  canViewThread,
  canAccessDirectMessage,
  sortParticipantIds,
} = require("./lib/chatVisibility");
const {
  detectDependencyReference,
  detectUnresolvedDisagreement,
} = require("./lib/threadMonitor");

let passedCount = 0;
let totalCount = 0;

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalCount++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("PHASE 10 PURE LOGIC UNIT TESTS (ZERO DATABASE)");
  console.log("═══════════════════════════════════════════════════════\n");

  // Sample project tasks for dependency network testing
  // Task 1: "User Auth Architecture" (Assigned to dev_alice)
  // Task 2: "OAuth API Integration" (Assigned to dev_bob, depends on Task 1)
  // Task 3: "Marketing Landing Copy" (Assigned to writer_charlie, independent)
  const taskDependencyGraph = [
    {
      id: "task_1",
      title: "User Auth Architecture",
      assignee_ids: ["user_alice"],
      depends_on: [],
    },
    {
      id: "task_2",
      title: "OAuth API Integration",
      assignee_ids: ["user_bob"],
      depends_on: ["task_1"],
    },
    {
      id: "task_3",
      title: "Marketing Landing Copy",
      assignee_ids: ["user_charlie"],
      depends_on: [],
    },
  ];

  // ─── 1. canViewThread Visibility Scoped Access Tests ───────────────────────
  console.log("--- 1. canViewThread Visibility Scoped Access Tests ---");

  runTest(
    "general channel thread (no linked task) → any project member allowed",
    () => {
      const thread = { topic: "Weekly Standup Logistics", linked_task_id: null };
      const res = canViewThread("user_dave", thread, "own_data_only", taskDependencyGraph);
      assert.strictEqual(res.allowed, true);
    }
  );

  runTest(
    "full visibility user → allowed on any linked-task thread",
    () => {
      const thread = { topic: "OAuth Security Architecture", linked_task_id: "task_2" };
      // user_alice is NOT assigned to task_2, but has "full" tier
      const res = canViewThread("user_alice", thread, "full", taskDependencyGraph);
      assert.strictEqual(res.allowed, true);
    }
  );

  runTest(
    "product_lead or lead_architect automatically receives full visibility tier",
    () => {
      const thread = { topic: "OAuth Security Architecture", linked_task_id: "task_2" };
      const resLead = canViewThread(
        { id: "lead_user", user_type: "product_lead" },
        thread,
        "own_data_only", // overridden by role
        taskDependencyGraph
      );
      assert.strictEqual(resLead.allowed, true);

      const resArch = canViewThread(
        { id: "arch_user", user_type: "lead_architect" },
        thread,
        "own_data_only",
        taskDependencyGraph
      );
      assert.strictEqual(resArch.allowed, true);
    }
  );

  runTest(
    "own_data_only user on their own task's thread → allowed",
    () => {
      const thread = { topic: "Token Expiry Implementation", linked_task_id: "task_1" };
      const res = canViewThread("user_alice", thread, "own_data_only", taskDependencyGraph);
      assert.strictEqual(res.allowed, true);
      assert.strictEqual(res.reason.includes("directly assigned"), true);
    }
  );

  runTest(
    "own_data_only user on someone else's unrelated task thread → denied",
    () => {
      const thread = { topic: "OAuth API Secrets", linked_task_id: "task_2" };
      const res = canViewThread("user_alice", thread, "own_data_only", taskDependencyGraph);
      assert.strictEqual(res.allowed, false);
    }
  );

  runTest(
    "own_plus_dependency user on a thread linked to a task that depends on their own task → allowed",
    () => {
      // task_2 depends on task_1 (alice's task). So Alice can view task_2's thread!
      const thread = { topic: "OAuth API Integration", linked_task_id: "task_2" };
      const res = canViewThread("user_alice", thread, "own_plus_dependency", taskDependencyGraph);
      assert.strictEqual(res.allowed, true);
      assert.strictEqual(res.reason.includes("depends on user's assigned task"), true);

      // Bob's task (task_2) depends on Alice's task (task_1). So Bob can also view task_1's thread!
      const threadPrereq = { topic: "User Auth Architecture", linked_task_id: "task_1" };
      const resBob = canViewThread("user_bob", threadPrereq, "own_plus_dependency", taskDependencyGraph);
      assert.strictEqual(resBob.allowed, true);
      assert.strictEqual(resBob.reason.includes("prerequisite"), true);
    }
  );

  runTest(
    "own_plus_dependency user on a thread linked to a completely unrelated task → denied",
    () => {
      // task_3 (Marketing Landing Copy) is completely unrelated to task_1 and task_2
      const thread = { topic: "Copywriting Tone of Voice", linked_task_id: "task_3" };
      const res = canViewThread("user_alice", thread, "own_plus_dependency", taskDependencyGraph);
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.reason.includes("outside user's assignment"), true);
    }
  );

  // ─── 2. canAccessDirectMessage & sortParticipantIds Tests ─────────────────
  console.log("\n--- 2. canAccessDirectMessage & sortParticipantIds Tests ---");

  runTest("participant in DM is allowed access", () => {
    const dm = { participant_ids: ["user_alice", "user_bob"] };
    assert.strictEqual(canAccessDirectMessage("user_alice", dm), true);
    assert.strictEqual(canAccessDirectMessage("user_bob", dm), true);
  });

  runTest("non-participant in DM is denied access", () => {
    const dm = { participant_ids: ["user_alice", "user_bob"] };
    assert.strictEqual(canAccessDirectMessage("user_charlie", dm), false);
    assert.strictEqual(canAccessDirectMessage(null, dm), false);
  });

  runTest("sortParticipantIds creates consistent lookup key regardless of parameter order", () => {
    const pair1 = sortParticipantIds("user_bob", "user_alice");
    const pair2 = sortParticipantIds("user_alice", "user_bob");
    assert.deepStrictEqual(pair1, ["user_alice", "user_bob"]);
    assert.deepStrictEqual(pair1, pair2);
  });

  // ─── 3. detectDependencyReference Tests ────────────────────────────────────
  console.log("\n--- 3. detectDependencyReference Tests ---");

  runTest("detects mention of an existing project task title", () => {
    const titles = ["User Auth Architecture", "OAuth API Integration", "DB Migration Script"];
    const text = "Hey team, we need to wrap up User Auth Architecture before the audit.";
    const res = detectDependencyReference(text, titles);
    assert.strictEqual(res.referencesTask, true);
    assert.deepStrictEqual(res.matchedTaskTitles, ["User Auth Architecture"]);
  });

  runTest("detects dependency phrase keywords (e.g. 'blocked on', 'waiting for')", () => {
    const text1 = "I am currently blocked on the backend schema deployment.";
    const res1 = detectDependencyReference(text1, []);
    assert.strictEqual(res1.referencesTask, true);
    assert.ok(res1.matchedKeywords.includes("blocked on"));

    const text2 = "Still waiting for approval from compliance team.";
    const res2 = detectDependencyReference(text2, []);
    assert.strictEqual(res2.referencesTask, true);
    assert.ok(res2.matchedKeywords.includes("waiting for"));

    const text3 = "This service depends on Redis cache invalidation.";
    const res3 = detectDependencyReference(text3, []);
    assert.strictEqual(res3.referencesTask, true);
    assert.ok(res3.matchedKeywords.includes("depends on"));
  });

  runTest("casual non-dependency conversation does not trigger false positive", () => {
    const text = "Great job on the presentation today, see you all tomorrow!";
    const res = detectDependencyReference(text, ["User Auth Architecture", "OAuth API Integration"]);
    assert.strictEqual(res.referencesTask, false);
    assert.strictEqual(res.matchedTaskTitles.length, 0);
    assert.strictEqual(res.matchedKeywords.length, 0);
  });

  // ─── 4. detectUnresolvedDisagreement Tests ─────────────────────────────────
  console.log("\n--- 4. detectUnresolvedDisagreement Tests ---");

  await runAsyncTest("fresh thread updated within hoursThreshold is skipped (no AI call)", async () => {
    let aiCalled = false;
    const mockAi = async () => {
      aiCalled = true;
      return { hasUnresolvedDisagreement: true };
    };

    const freshMessages = [
      { author_id: "user_alice", content: "I think we should use PostgreSQL.", created_at: new Date(Date.now() - 3600 * 1000) }, // 1h ago
      { author_id: "user_bob", content: "No, MongoDB is better suited.", created_at: new Date(Date.now() - 1800 * 1000) },      // 30m ago
    ];

    const res = await detectUnresolvedDisagreement(freshMessages, 24, mockAi);
    assert.strictEqual(res.hasUnresolvedDisagreement, false);
    assert.strictEqual(aiCalled, false);
  });

  await runAsyncTest("stale thread with mocked agreement returns hasUnresolvedDisagreement: false", async () => {
    const staleTime = Date.now() - 30 * 3600 * 1000; // 30 hours ago
    const staleMessages = [
      { author_id: "user_alice", content: "Should we use JWT or session tokens?", created_at: new Date(staleTime - 1000) },
      { author_id: "user_bob", content: "JWT works great for our stateless API.", created_at: new Date(staleTime) },
    ];

    const mockAi = async () => {
      return {
        hasUnresolvedDisagreement: false,
        summary: "Team reached consensus on JWT.",
        suggestedResolution: "",
      };
    };

    const res = await detectUnresolvedDisagreement(staleMessages, 24, mockAi);
    assert.strictEqual(res.hasUnresolvedDisagreement, false);
  });

  await runAsyncTest("stale thread with mocked unresolved dispute flags disagreement and suggests resolution", async () => {
    const staleTime = Date.now() - 28 * 3600 * 1000; // 28 hours ago
    const staleDisputeMessages = [
      { author_id: "user_alice", content: "We must use REST for this microservice.", created_at: new Date(staleTime - 5000) },
      { author_id: "user_bob", content: "No, GraphQL is strictly required, I will not approve REST.", created_at: new Date(staleTime) },
    ];

    const mockAi = async () => {
      return JSON.stringify({
        hasUnresolvedDisagreement: true,
        summary: "Alice and Bob disagree on REST vs GraphQL API protocol.",
        suggestedResolution: "Product Lead should convene an architectural mediation session.",
      });
    };

    const res = await detectUnresolvedDisagreement(staleDisputeMessages, 24, mockAi);
    assert.strictEqual(res.hasUnresolvedDisagreement, true);
    assert.strictEqual(res.summary.includes("REST vs GraphQL"), true);
    assert.strictEqual(res.suggestedResolution.includes("mediation"), true);
  });

  await runAsyncTest("AI failure returns hasUnresolvedDisagreement: false gracefully without crashing", async () => {
    const staleTime = Date.now() - 30 * 3600 * 1000;
    const staleMessages = [
      { author_id: "user_alice", content: "Message 1", created_at: new Date(staleTime - 1000) },
      { author_id: "user_bob", content: "Message 2", created_at: new Date(staleTime) },
    ];

    const failingAi = async () => {
      throw new Error("HTTP 429 Quota Exceeded");
    };

    const res = await detectUnresolvedDisagreement(staleMessages, 24, failingAi);
    assert.strictEqual(res.hasUnresolvedDisagreement, false);
    assert.strictEqual(res.error, "HTTP 429 Quota Exceeded");
  });

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`PHASE 10 UNIT TESTS SUMMARY: ${passedCount}/${totalCount} PASSED`);
  console.log("═══════════════════════════════════════════════════════");

  if (passedCount === totalCount) {
    console.log("ALL PHASE 10 PURE LOGIC UNIT TESTS PASSED SUCCESSFULLY! ✓\n");
    process.exit(0);
  } else {
    console.error(`FAILED: ${totalCount - passedCount} tests failed.`);
    process.exit(1);
  }
}

main();
