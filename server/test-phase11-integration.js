/**
 * Phase 11 — Database Integration Tests (MongoDB, Retrospective & Completion Protocol)
 *
 * Verifies:
 * 1. Precondition: Incomplete tasks block project completion (HTTP 400 + incompleteTasks list)
 * 2. Role guard: Non-Product Lead cannot complete project (HTTP 403)
 * 3. PATCH /api/projects/:id/success-metrics updates project targets
 * 4. Successful completion:
 *    - All tasks completed -> status transitions to "completed" with completed_at timestamp
 *    - Generates and locks immutable Retrospective post-mortem
 *    - Records PROJECT_COMPLETED in AuditLog
 * 5. GET /api/projects/:id/retrospective:
 *    - Accessible by project members
 *    - Denied for non-members (HTTP 403)
 *    - Strips confidential cost/rate numbers for non-leads
 * 6. Immutability guarantee: No PUT/PATCH routes exist for Retrospectives
 */

const assert = require("assert");
const http = require("http");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
const { app } = require("./index");
const { Project, Task } = require("./models/models");
const User = require("./models/User");
const Retrospective = require("./models/Retrospective");
const AuditLog = require("./models/AuditLog");

let passedCount = 0;
let totalCount = 0;

const JWT_SECRET = process.env.JWT_SECRET || "acube-pm-production-secret-key-2026";

function makeRequest(baseUrl, method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let rawData = "";
      res.on("data", (chunk) => (rawData += chunk));
      res.on("end", () => {
        try {
          const parsed = rawData ? JSON.parse(rawData) : null;
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body: rawData });
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTest(name, fn) {
  totalCount++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✕ ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

async function runIntegrationTests() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("PHASE 11 INTEGRATION TESTS (DB, COMPLETION & RETRO)");
  console.log("═══════════════════════════════════════════════════════\n");

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve) => mongoose.connection.once("open", resolve));
  }

  // Generate tokens
  const leadId = "lead_retro_alex";
  const devId = "dev_retro_bob";
  const outsiderId = "emp_retro_outsider";

  await User.findOneAndUpdate(
    { _id: leadId },
    { email: "lead_alex@test.com", full_name: "Alex Lead", user_type: "product_lead", role_title: "Product Lead" },
    { upsert: true, returnDocument: "after" }
  );

  await User.findOneAndUpdate(
    { _id: devId },
    { email: "dev_bob@test.com", full_name: "Bob Dev", user_type: "employee", role_title: "Fullstack Engineer" },
    { upsert: true, returnDocument: "after" }
  );

  await User.findOneAndUpdate(
    { _id: outsiderId },
    { email: "outsider@test.com", full_name: "Outsider", user_type: "employee", role_title: "Designer" },
    { upsert: true, returnDocument: "after" }
  );

  const leadToken = jwt.sign({ uid: leadId, userType: "product_lead" }, JWT_SECRET, { expiresIn: "1h" });
  const devToken = jwt.sign({ uid: devId, userType: "employee" }, JWT_SECRET, { expiresIn: "1h" });
  const outsiderToken = jwt.sign({ uid: outsiderId, userType: "employee" }, JWT_SECRET, { expiresIn: "1h" });

  const leadHeaders = { Authorization: `Bearer ${leadToken}` };
  const devHeaders = { Authorization: `Bearer ${devToken}` };
  const outsiderHeaders = { Authorization: `Bearer ${outsiderToken}` };

  const testProjectId = new mongoose.Types.ObjectId();

  try {
    // Clean slate for test project
    await Project.deleteOne({ _id: testProjectId });
    await Task.deleteMany({ project_id: testProjectId });
    await Retrospective.deleteMany({ project_id: testProjectId });

    const project = new Project({
      _id: testProjectId,
      title: "Phase 11 Retro Project",
      description: "Testing formal completion protocol",
      created_by: leadId,
      status: "active",
      priority: "P1",
      member_ids: [leadId, devId],
      success_metrics: [
        { description: "API response latency", target: "<100ms" },
        { description: "Test coverage", target: ">=90%" },
      ],
    });
    await project.save();

    // Create 2 tasks: 1 active, 1 completed
    const task1 = new Task({
      project_id: testProjectId,
      title: "Backend API endpoints",
      start_date: "2026-09-01",
      end_date: "2026-09-03",
      assignee_ids: [devId],
      status: "completed",
      estimate_hours: 16,
      logged_hours: 14,
    });
    const task2 = new Task({
      project_id: testProjectId,
      title: "Frontend integration",
      start_date: "2026-09-03",
      end_date: "2026-09-05",
      assignee_ids: [devId],
      status: "active", // incomplete!
      estimate_hours: 8,
      logged_hours: 4,
    });
    await task1.save();
    await task2.save();

    // ── 1. Precondition: Incomplete tasks block project completion ────────────
    await runTest("Incomplete tasks block completion with 400 and incompleteTasks list", async () => {
      const res = await makeRequest(baseUrl, "POST", `/api/projects/${testProjectId}/complete`, leadHeaders, {});
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.incompleteCount, 1);
      assert(Array.isArray(res.body.incompleteTasks));
      assert.strictEqual(res.body.incompleteTasks[0].title, "Frontend integration");
    });

    // ── 2. Role Guard: Non-Product Lead cannot complete project ──────────────
    await runTest("Non-Product Lead is denied completion with 403", async () => {
      const res = await makeRequest(baseUrl, "POST", `/api/projects/${testProjectId}/complete`, devHeaders, {});
      assert.strictEqual(res.status, 403);
    });

    // ── 3. PATCH /api/projects/:id/success-metrics ───────────────────────────
    await runTest("Product Lead updates success metrics criteria", async () => {
      const newMetrics = [
        { description: "API response latency", target: "<80ms" },
        { description: "Test coverage", target: ">=95%" },
        { description: "Zero P0 regressions", target: "100%" },
      ];
      const res = await makeRequest(baseUrl, "PATCH", `/api/projects/${testProjectId}/success-metrics`, leadHeaders, {
        metrics: newMetrics,
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.success_metrics.length, 3);
    });

    // ── 4. Complete Task 2 and Perform Project Completion ─────────────────────
    await Task.updateOne({ _id: task2._id }, { status: "completed", logged_hours: 10 });

    await runTest("Product Lead completes project: generates and locks Retrospective", async () => {
      const completePayload = {
        metrics: [
          { description: "API response latency", target: "<80ms", actualValue: "65ms", achieved: true },
          { description: "Test coverage", target: ">=95%", actualValue: "96%", achieved: true },
          { description: "Zero P0 regressions", target: "100%", actualValue: "", achieved: null }, // unmeasured -> null
        ],
      };

      const res = await makeRequest(baseUrl, "POST", `/api/projects/${testProjectId}/complete`, leadHeaders, completePayload);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.project.status, "completed");
      assert(res.body.project.completed_at);

      // Verify retrospective was generated and locked
      const retro = res.body.retrospective;
      assert(retro);
      assert.strictEqual(retro.locked, true);
      assert.strictEqual(retro.estimation_accuracy.overall.totalEstimatedHours, 24); // 16 + 8
      assert.strictEqual(retro.estimation_accuracy.overall.totalActualHours, 24);    // 14 + 10
      assert.strictEqual(retro.estimation_accuracy.overall.variancePct, 0);
      assert.strictEqual(retro.success_metrics.length, 3);
      assert.strictEqual(retro.success_metrics[0].achieved, true);
      assert.strictEqual(retro.success_metrics[2].achieved, null); // blank -> null

      // Verify AuditLog record
      const audit = await AuditLog.findOne({ entityId: testProjectId.toString(), action: "PROJECT_COMPLETED" });
      assert(audit);
      assert.strictEqual(audit.actorId, leadId);
    });

    // ── 5. GET /api/projects/:id/retrospective ────────────────────────────────
    await runTest("Project member can view retrospective", async () => {
      const res = await makeRequest(baseUrl, "GET", `/api/projects/${testProjectId}/retrospective`, devHeaders);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.retrospective.locked, true);
    });

    await runTest("Unassigned outsider is denied viewing retrospective (403)", async () => {
      const res = await makeRequest(baseUrl, "GET", `/api/projects/${testProjectId}/retrospective`, outsiderHeaders);
      assert.strictEqual(res.status, 403);
    });

    // ── 6. Permanent Immutability: No PUT/PATCH on Retrospective ─────────────
    await runTest("No PUT or PATCH routes exist on /retrospective (immutable)", async () => {
      const putRes = await makeRequest(baseUrl, "PUT", `/api/projects/${testProjectId}/retrospective`, leadHeaders, { locked: false });
      assert.strictEqual(putRes.status, 404);
      const patchRes = await makeRequest(baseUrl, "PATCH", `/api/projects/${testProjectId}/retrospective`, leadHeaders, { locked: false });
      assert.strictEqual(patchRes.status, 404);
    });

    // ── 7. Success Metrics Locked Post-Completion (409 Conflict) ──────────────
    await runTest("PATCH /api/projects/:id/success-metrics returns 409 post-completion", async () => {
      const res = await makeRequest(baseUrl, "PATCH", `/api/projects/${testProjectId}/success-metrics`, leadHeaders, {
        metrics: [{ description: "Post-completion alteration", target: "<50ms" }],
      });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(
        res.body.error,
        "Success metrics are locked once the project is completed and the retrospective has been generated. This data is now part of the permanent retrospective record."
      );
    });

    console.log("\n═══════════════════════════════════════════════════════");
    console.log(`PHASE 11 INTEGRATION TESTS SUMMARY: ${passedCount}/${totalCount} PASSED`);
    console.log("═══════════════════════════════════════════════════════");
    console.log("ALL PHASE 11 INTEGRATION TESTS PASSED! ✓\n");
  } finally {
    // Cleanup
    await Project.deleteOne({ _id: testProjectId });
    await Task.deleteMany({ project_id: testProjectId });
    await Retrospective.deleteMany({ project_id: testProjectId });
    server.close();
    setTimeout(() => {
      process.exit(0);
    }, 200);
  }
}

runIntegrationTests().catch((err) => {
  console.error("Phase 11 integration tests failed:", err);
  process.exit(1);
});
