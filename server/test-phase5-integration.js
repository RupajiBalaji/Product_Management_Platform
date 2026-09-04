/**
 * Phase 5 Integration Test Suite
 * Tests live MongoDB SlippageEvent creation, notification, internal runner endpoint, and resolution flow.
 * Note: Requires local MongoDB to be running.
 */

require("dotenv").config();
const assert = require("assert");
const http = require("http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const connectDB = require("./db");
const { Project, Task } = require("./models/models");
const Submission = require("./models/Submission");
const SlippageEvent = require("./models/SlippageEvent");
const Notification = require("./models/Notification");
const AuditLog = require("./models/AuditLog");
const { app } = require("./index");

const JWT_SECRET = process.env.JWT_SECRET || "autonomous_pm_super_secret_jwt_key_2026";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "autonomous-pm-internal-secret";

async function runPhase5IntegrationTests() {
  console.log("🧪 Running Phase 5 Slippage Integration Tests (DB & API)...");

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
    // ─── Setup Test Project & Task ───────────────────────────────────────────
    const testProject = await Project.create({
      title: "Test Phase 5 Slippage Initiative",
      created_by: "lead_sarah_connor",
      status: "active",
      priority: "P1",
      member_ids: ["emp_riya_patel"],
      team_allocations: [
        { user_id: "emp_riya_patel", daily_hours: 8 },
      ],
    });

    const testTask = await Task.create({
      project_id: testProject._id,
      title: "Design Neural Cache Invalidation System",
      start_date: "2026-09-01",
      end_date: "2026-09-10",
      assignee_ids: ["emp_riya_patel"],
      status: "active",
      estimate_hours: 16,
      logged_hours: 20,
    });

    // Create 3 consecutive rejected submissions to trigger QA rejection loop
    for (let i = 1; i <= 3; i++) {
      await Submission.create({
        task_id: testTask._id,
        employee_id: "emp_riya_patel",
        artifact_url: `https://github.com/acube/pm/pull/${100 + i}`,
        artifact_type: "pr_link",
        status: "rejected",
        evaluation_mode: "objective",
        ai_verdict: {
          passed: false,
          missing_items: [`Missing benchmark suite ${i}`],
          reasoning: `Attempt ${i}: Redis cache latency benchmark missing.`,
        },
        rejection_count: i,
        created_at: new Date(Date.now() - (4 - i) * 86400000),
      });
    }

    // ─── Test 1: POST /api/internal/run-slippage-check ────────────────────────
    console.log("--- Test 1: Triggering internal runner endpoint ---");
    const runRes = await fetch(`${baseUrl}/api/internal/run-slippage-check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
    });
    const runData = await runRes.json();
    assert.strictEqual(runRes.status, 200, "Test 1 Failed: Expected 200 from run-slippage-check");
    assert.ok(runData.results.rejectionLoopsDetected >= 1, "Test 1 Failed: Expected at least 1 rejection loop detected");
    assert.ok(runData.results.newEventsCreated >= 1, "Test 1 Failed: Expected at least 1 new SlippageEvent created");
    console.log(`✓ Test 1 Passed: Runner executed successfully. Detected ${runData.results.rejectionLoopsDetected} rejection loop(s), created ${runData.results.newEventsCreated} event(s).`);

    // ─── Test 2: Verify SlippageEvent & Notification in DB ────────────────────
    console.log("--- Test 2: Verifying SlippageEvent & Notification records ---");
    const slippageEvent = await SlippageEvent.findOne({
      task_id: testTask._id,
      trigger_type: "repeated_qa_rejection",
      resolved: false,
    });
    assert.ok(slippageEvent, "Test 2 Failed: SlippageEvent was not found in DB");
    assert.strictEqual(slippageEvent.level, "escalation", "Test 2 Failed: Level should be escalation");
    assert.strictEqual(slippageEvent.rejection_count, 3, "Test 2 Failed: Rejection count should be 3");
    assert.ok(slippageEvent.resolution_options_presented.length === 3, "Test 2 Failed: 3 resolution options expected");

    const notification = await Notification.findOne({
      entity_id: slippageEvent._id,
      type: "qa_rejection_loop",
    });
    assert.ok(notification, "Test 2 Failed: Notification targeted at lead missing");
    assert.strictEqual(notification.recipient_id, "lead_sarah_connor");
    console.log("✓ Test 2 Passed: SlippageEvent and Notification created with correct escalation metadata.");

    // ─── Test 3: Duplicate Prevention ─────────────────────────────────────────
    console.log("--- Test 3: Duplicate alert prevention ---");
    const reRunRes = await fetch(`${baseUrl}/api/internal/run-slippage-check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
    });
    const reRunData = await reRunRes.json();
    // Since unresolved event already exists, newEventsCreated for this task should not increase
    const allEventsForTask = await SlippageEvent.find({ task_id: testTask._id, resolved: false });
    assert.strictEqual(allEventsForTask.length, 1, "Test 3 Failed: Should not create duplicate unresolved events");
    console.log("✓ Test 3 Passed: Duplicate prevention verified (only 1 unresolved event remains).");

    // ─── Test 4: GET /api/slippage/project/:projectId ─────────────────────────
    console.log("--- Test 4: Project slippage retrieval endpoint ---");
    const projSlippageRes = await fetch(`${baseUrl}/api/slippage/project/${testProject._id}`, {
      headers: { Authorization: `Bearer ${leadToken}` },
    });
    const projSlippageData = await projSlippageRes.json();
    assert.strictEqual(projSlippageRes.status, 200, "Test 4 Failed: Expected 200 from project slippage endpoint");
    assert.ok(projSlippageData.events.some((e) => e._id === slippageEvent._id.toString()), "Test 4 Failed: Event missing from project list");
    console.log("✓ Test 4 Passed: GET /api/slippage/project/:projectId returned active escalations.");

    // ─── Test 5: GET /api/slippage/employee/:userId ───────────────────────────
    console.log("--- Test 5: Employee slippage retrieval endpoint & RBAC ---");
    const empSlippageRes = await fetch(`${baseUrl}/api/slippage/employee/emp_riya_patel`, {
      headers: { Authorization: `Bearer ${empToken}` },
    });
    const empSlippageData = await empSlippageRes.json();
    assert.strictEqual(empSlippageRes.status, 200, "Test 5 Failed: Employee should be able to view their own slippage");
    assert.ok(empSlippageData.events.length >= 1, "Test 5 Failed: Expected at least 1 event for employee");

    // Forbidden check: employee trying to view another employee's slippage
    const forbiddenRes = await fetch(`${baseUrl}/api/slippage/employee/emp_sneha_reddy`, {
      headers: { Authorization: `Bearer ${empToken}` },
    });
    assert.strictEqual(forbiddenRes.status, 403, "Test 5 Failed: Expected 403 when viewing another employee's slippage");
    console.log("✓ Test 5 Passed: Employee self-view allowed, viewing others correctly blocked (HTTP 403).");

    // ─── Test 6: POST /api/slippage/:id/resolve ───────────────────────────────
    console.log("--- Test 6: Resolving slippage escalation ---");
    const resolveRes = await fetch(`${baseUrl}/api/slippage/${slippageEvent._id}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leadToken}`,
      },
      body: JSON.stringify({
        resolution_chosen: "Schedule clarification session",
      }),
    });
    const resolveData = await resolveRes.json();
    assert.strictEqual(resolveRes.status, 200, "Test 6 Failed: Expected 200 from resolve endpoint");
    assert.strictEqual(resolveData.slippageEvent.resolved, true, "Test 6 Failed: Event should be marked resolved");
    assert.strictEqual(resolveData.slippageEvent.resolution_chosen, "Schedule clarification session");

    // Verify AuditLog record
    const auditRecord = await AuditLog.findOne({
      action: "SLIPPAGE_EVENT_RESOLVED",
      entityId: slippageEvent._id.toString(),
    });
    assert.ok(auditRecord, "Test 6 Failed: AuditLog for SLIPPAGE_EVENT_RESOLVED missing");
    assert.strictEqual(auditRecord.actorId, "lead_sarah_connor");
    console.log("✓ Test 6 Passed: Slippage event resolved with option and recorded to AuditLog.");

    // Cleanup test artifacts
    await SlippageEvent.deleteMany({ project_id: testProject._id });
    await Notification.deleteMany({ entity_id: slippageEvent._id });
    await Submission.deleteMany({ task_id: testTask._id });
    await Task.deleteMany({ _id: testTask._id });
    await Project.deleteMany({ _id: testProject._id });

    console.log("\n🎉 ALL PHASE 5 INTEGRATION & API TESTS PASSED SUCCESSFULLY!");
  } finally {
    mongoose.connection.removeAllListeners();
    await new Promise((resolve) => {
      server.close(() => {
        mongoose.disconnect().then(resolve);
      });
    });
  }
}

runPhase5IntegrationTests().catch((err) => {
  console.error("❌ Phase 5 Integration Test failed:", err);
  process.exit(1);
});
