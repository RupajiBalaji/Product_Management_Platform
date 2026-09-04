/**
 * Phase 6 Integration Test Suite
 * Tests live MongoDB ActionRequest creation, reorder, swap, postpone, clarification, and slippage freeze.
 * Note: Requires local MongoDB to be running.
 */

require("dotenv").config();
const assert = require("assert");
const http = require("http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const connectDB = require("./db");
const { Project, Task } = require("./models/models");
const ActionRequest = require("./models/ActionRequest");
const AuditLog = require("./models/AuditLog");
const { app } = require("./index");
const { runSlippageCheck } = require("./jobs/slippageChecker");

const JWT_SECRET = process.env.JWT_SECRET || "autonomous_pm_super_secret_jwt_key_2026";

async function runPhase6IntegrationTests() {
  console.log("🧪 Running Phase 6 Action Mode Integration Tests (DB & API)...");

  await connectDB();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const leadToken = jwt.sign(
    { uid: "lead_sarah_connor", email: "sarah@acube.ai", user_type: "product_lead" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const empToken = jwt.sign(
    { uid: "emp_riya_patel", email: "riya@acube.ai", user_type: "employee" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  try {
    // ─── Setup Test Project & Tasks ──────────────────────────────────────────
    const testProject = await Project.create({
      title: "Test Phase 6 Action Mode Initiative",
      created_by: "lead_sarah_connor",
      status: "active",
      priority: "P1",
      member_ids: ["emp_riya_patel"],
      team_allocations: [{ user_id: "emp_riya_patel", daily_hours: 8 }],
    });

    const taskA = await Task.create({
      project_id: testProject._id,
      title: "Task A: Database Migrations",
      start_date: "2026-09-07",
      end_date: "2026-09-08",
      assignee_ids: ["emp_riya_patel"],
      status: "active",
      order_index: 0,
      estimate_hours: 8,
    });

    const taskB = await Task.create({
      project_id: testProject._id,
      title: "Task B: API Integration",
      start_date: "2026-09-09",
      end_date: "2026-09-10",
      assignee_ids: ["emp_riya_patel"],
      depends_on: [taskA._id],
      status: "active",
      order_index: 1,
      estimate_hours: 8,
    });

    // ─── Test 1: POST /api/actions/reorder (Blocked vs Approved) ──────────────
    console.log("--- Test 1: Reorder Endpoint (Blocked vs Approved) ---");
    // Trying to move taskB (depends on taskA) before taskA (position 0) -> should be blocked (HTTP 409)
    const blockedReorderRes = await fetch(`${baseUrl}/api/actions/reorder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
      body: JSON.stringify({
        task_id: taskB._id,
        new_position: 0,
      }),
    });
    const blockedReorderData = await blockedReorderRes.json();
    assert.strictEqual(blockedReorderRes.status, 409, "Test 1a Failed: Expected 409 for dependency violation");
    assert.strictEqual(blockedReorderData.actionRequest.status, "blocked", "Test 1a Failed: Status must be 'blocked'");
    console.log(`✓ Test 1a Passed: Illegal reorder blocked with HTTP 409: "${blockedReorderData.error}"`);

    // Valid reorder: taskA moving to position 0 (already 0) or taskB to position 1
    const validReorderRes = await fetch(`${baseUrl}/api/actions/reorder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
      body: JSON.stringify({
        task_id: taskB._id,
        new_position: 1,
      }),
    });
    const validReorderData = await validReorderRes.json();
    assert.strictEqual(validReorderRes.status, 200, "Test 1b Failed: Expected 200 for valid reorder");
    assert.strictEqual(validReorderData.actionRequest.status, "auto_approved");
    console.log("✓ Test 1b Passed: Valid reorder auto_approved with HTTP 200.");

    // ─── Test 2: POST /api/actions/swap (Within week vs Outside week) ─────────
    console.log("\n--- Test 2: Swap Within Week Endpoint ---");
    // Swap taskA to Wednesday in same week (2026-09-09)
    const validSwapRes = await fetch(`${baseUrl}/api/actions/swap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
      body: JSON.stringify({
        task_id: taskA._id,
        target_date: "2026-09-09",
      }),
    });
    const validSwapData = await validSwapRes.json();
    assert.strictEqual(validSwapRes.status, 200, "Test 2a Failed: Expected 200 on valid swap within week");
    assert.strictEqual(validSwapData.actionRequest.status, "auto_approved");
    console.log("✓ Test 2a Passed: Swap within same planning week auto_approved with HTTP 200.");

    // Swap taskA to date in NEXT week (2026-09-16) -> should be blocked (HTTP 409)
    const blockedSwapRes = await fetch(`${baseUrl}/api/actions/swap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
      body: JSON.stringify({
        task_id: taskA._id,
        target_date: "2026-09-16",
      }),
    });
    const blockedSwapData = await blockedSwapRes.json();
    assert.strictEqual(blockedSwapRes.status, 409, "Test 2b Failed: Expected 409 for swap outside week");
    assert.strictEqual(blockedSwapData.actionRequest.status, "blocked");
    console.log(`✓ Test 2b Passed: Swap outside week blocked with HTTP 409: "${blockedSwapData.error}"`);

    // ─── Test 3: POST /api/actions/postpone (Always strictly forbidden) ───────
    console.log("\n--- Test 3: Postpone Endpoint (Strictly Forbidden) ---");
    const postponeRes = await fetch(`${baseUrl}/api/actions/postpone`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
      body: JSON.stringify({
        task_id: taskA._id,
        requested_date: "2026-09-25",
      }),
    });
    const postponeData = await postponeRes.json();
    assert.strictEqual(postponeRes.status, 403, "Test 3 Failed: Postpone must return HTTP 403");
    assert.strictEqual(postponeData.actionRequest.status, "blocked");
    assert.ok(postponeData.error.includes("strictly forbidden action"), "Test 3 Failed: Governance reasoning mismatch");
    console.log(`✓ Test 3 Passed: Postpone strictly blocked with HTTP 403 and auditable ActionRequest saved.`);

    // ─── Test 4: POST /api/actions/request-clarification & Slippage Freeze ────
    console.log("\n--- Test 4: Request Clarification & Slippage Freeze ---");
    const clarRes = await fetch(`${baseUrl}/api/actions/request-clarification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
      body: JSON.stringify({
        task_id: taskB._id,
        question: "What is the exact TTL required for the distributed session tokens?",
      }),
    });
    const clarData = await clarRes.json();
    assert.strictEqual(clarRes.status, 200, "Test 4 Failed: Expected 200 on clarification request");
    assert.strictEqual(clarData.actionRequest.action_type, "request_clarification");
    assert.strictEqual(clarData.actionRequest.slippage_frozen, true, "Test 4 Failed: Slippage must be frozen");

    // Verify task in DB has slippage_frozen = true
    const updatedTaskB = await Task.findById(taskB._id);
    assert.strictEqual(updatedTaskB.slippage_frozen, true, "Test 4 Failed: task.slippage_frozen must be true");

    // Verify Phase 5 slippage checker skips this frozen task
    const checkResults = await runSlippageCheck();
    assert.ok(checkResults.tasksSkippedDueToClarification >= 1, "Test 4 Failed: Slippage checker should skip frozen task");
    console.log(`✓ Test 4 Passed: Clarification request created with slippage_frozen: true. Slippage checker skipped ${checkResults.tasksSkippedDueToClarification} task(s).`);

    // ─── Test 5: GET /api/actions/clarifications/pending ──────────────────────
    console.log("\n--- Test 5: Pending Clarifications Queue (Lead Review) ---");
    const pendingClarRes = await fetch(`${baseUrl}/api/actions/clarifications/pending`, {
      headers: { Authorization: `Bearer ${leadToken}` },
    });
    const pendingClarData = await pendingClarRes.json();
    assert.strictEqual(pendingClarRes.status, 200, "Test 5 Failed: Expected 200 from pending clarifications queue");
    assert.ok(pendingClarData.requests.some((r) => r._id === clarData.actionRequest._id.toString()), "Test 5 Failed: Request missing from queue");
    console.log(`✓ Test 5 Passed: Lead fetched pending clarification requests queue (${pendingClarData.requests.length} pending).`);

    // ─── Test 6: POST /api/actions/clarifications/:id/answer ──────────────────
    console.log("\n--- Test 6: Answering Clarification & Unfreezing Slippage ---");
    const answerRes = await fetch(`${baseUrl}/api/actions/clarifications/${clarData.actionRequest._id}/answer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leadToken}`,
      },
      body: JSON.stringify({
        answer: "The distributed session TTL is strictly 3600 seconds (1 hour) with Redis sliding expiration.",
      }),
    });
    const answerData = await answerRes.json();
    assert.strictEqual(answerRes.status, 200, "Test 6 Failed: Expected 200 on answering clarification");
    assert.strictEqual(answerData.actionRequest.status, "answered");
    assert.strictEqual(answerData.actionRequest.slippage_frozen, false);

    // Verify task clarifications array and slippage unfreeze in DB
    const finalTaskB = await Task.findById(taskB._id);
    assert.strictEqual(finalTaskB.slippage_frozen, false, "Test 6 Failed: task.slippage_frozen should be reset to false");
    assert.strictEqual(finalTaskB.clarifications.length, 1, "Test 6 Failed: Clarification must be appended to task");
    assert.strictEqual(finalTaskB.clarifications[0].answered_by, "lead_sarah_connor");

    // Verify AuditLog recorded CLARIFICATION_ANSWERED
    const auditRecord = await AuditLog.findOne({
      action: "CLARIFICATION_ANSWERED",
      entityId: clarData.actionRequest._id.toString(),
    });
    assert.ok(auditRecord, "Test 6 Failed: AuditLog for CLARIFICATION_ANSWERED missing");
    assert.strictEqual(auditRecord.actorId, "lead_sarah_connor");
    console.log("✓ Test 6 Passed: Clarification answered, appended to task, slippage clock unfrozen, and logged to AuditLog.");

    // Cleanup test artifacts
    await ActionRequest.deleteMany({ project_id: testProject._id });
    await Task.deleteMany({ project_id: testProject._id });
    await Project.deleteMany({ _id: testProject._id });

    console.log("\n🎉 ALL PHASE 6 INTEGRATION & API TESTS PASSED SUCCESSFULLY!");
  } finally {
    mongoose.connection.removeAllListeners();
    await new Promise((resolve) => {
      server.close(() => {
        mongoose.disconnect().then(resolve);
      });
    });
  }
}

runPhase6IntegrationTests().catch((err) => {
  console.error("❌ Phase 6 Integration Test failed:", err);
  process.exit(1);
});
