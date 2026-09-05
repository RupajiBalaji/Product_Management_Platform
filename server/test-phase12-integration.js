/**
 * Phase 12 — Database Integration Tests (MongoDB, PRD & Change Rollback)
 *
 * Verifies:
 * 1. Role Guard: Non-Product Lead is denied PRD generation (403)
 * 2. POST /api/projects/:id/prd/generate: Creates draft PRD v1.0
 * 3. POST /api/projects/:id/prd/approve: Approves PRD v1.0
 * 4. PATCH /api/prd/:id on approved PRD: Bumps version (1.0 -> 1.1), marks old superseded with diffs
 * 5. POST /api/projects/:id/changes/request: Consequence preview with deltaHours, deltaCost, utilization
 * 6. POST /api/projects/:id/changes/apply: Creates ChangeTransaction, bumps PRD version (1.1 -> 1.2)
 * 7. POST /api/changes/:id/rollback-preview: Accurately reports rollback impact
 * 8. POST /api/changes/:id/rollback requires confirmation if task is completed (400)
 * 9. POST /api/changes/:id/rollback blocked if task state diverged / conflicting (409)
 * 10. POST /api/changes/:id/rollback succeeds when confirmed: true without conflicts (200)
 */

const assert = require("assert");
const http = require("http");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
const { app } = require("./index");
const { Project, Task } = require("./models/models");
const User = require("./models/User");
const PRD = require("./models/PRD");
const ChangeTransaction = require("./models/ChangeTransaction");
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
  console.log("PHASE 12 INTEGRATION TESTS (DB, PRD & CHANGE ROLLBACK)");
  console.log("═══════════════════════════════════════════════════════\n");

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve) => mongoose.connection.once("open", resolve));
  }

  const leadId = "lead_phase12_carol";
  const devId = "dev_phase12_dave";

  await User.findOneAndUpdate(
    { _id: leadId },
    { email: "carol_lead@test.com", full_name: "Carol Lead", user_type: "product_lead", role_title: "Product Lead", hourly_cost_rate: 150 },
    { upsert: true, returnDocument: "after" }
  );

  await User.findOneAndUpdate(
    { _id: devId },
    { email: "dave_dev@test.com", full_name: "Dave Dev", user_type: "employee", role_title: "Backend Engineer", hourly_cost_rate: 100 },
    { upsert: true, returnDocument: "after" }
  );

  const leadToken = jwt.sign({ uid: leadId, userType: "product_lead" }, JWT_SECRET, { expiresIn: "1h" });
  const devToken = jwt.sign({ uid: devId, userType: "employee" }, JWT_SECRET, { expiresIn: "1h" });

  const leadHeaders = { Authorization: `Bearer ${leadToken}` };
  const devHeaders = { Authorization: `Bearer ${devToken}` };

  const testProjectId = new mongoose.Types.ObjectId();
  let createdPrdId = null;
  let bumpedPrdId = null;
  let changeTxId = null;
  let createdTaskId = null;
  let existingTaskId = null;

  try {
    // Setup clean test project
    await Project.deleteOne({ _id: testProjectId });
    await Task.deleteMany({ project_id: testProjectId });
    await PRD.deleteMany({ project_id: testProjectId });
    await ChangeTransaction.deleteMany({ project_id: testProjectId });

    const project = new Project({
      _id: testProjectId,
      title: "Phase 12 Scope & Rollback Project",
      description: "Building automated enterprise PRD lifecycle and rollback audit trail.",
      executive_intent: "Deliver high-reliability PRD versioning and change control for engineering teams.",
      created_by: leadId,
      status: "active",
      priority: "P1",
      team_allocations: [
        { user_id: leadId, daily_hours_allocated: 4 },
        { user_id: devId, daily_hours_allocated: 8 },
      ],
    });
    await project.save();

    const existingTask = new Task({
      project_id: testProjectId,
      title: "Core Architecture Setup",
      description: "Initial foundational setup",
      status: "active",
      estimate_hours: 10,
      logged_hours: 0,
      assignee_ids: [devId],
      start_date: "2026-09-01",
      end_date: "2026-09-05",
    });
    await existingTask.save();
    existingTaskId = existingTask._id;

    // ── 1. Role Guard: Non-Product Lead is denied PRD generation ──────────────
    await runTest("Non-Product Lead is denied PRD generation with 403", async () => {
      const res = await makeRequest(baseUrl, "POST", `/api/projects/${testProjectId}/prd/generate`, devHeaders, {});
      assert.strictEqual(res.status, 403);
    });

    // ── 2. POST /api/projects/:id/prd/generate: Creates draft PRD v1.0 ─────────
    await runTest("Product Lead generates draft PRD v1.0", async () => {
      const res = await makeRequest(baseUrl, "POST", `/api/projects/${testProjectId}/prd/generate`, leadHeaders, {});
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.prd.version, "1.0");
      assert.strictEqual(res.body.prd.status, "draft");
      assert(Array.isArray(res.body.prd.user_stories));
      assert(res.body.prd.executive_summary.length > 0);
      createdPrdId = res.body.prd._id;
    });

    // ── 3. POST /api/projects/:id/prd/approve: Approves PRD v1.0 ──────────────
    await runTest("Product Lead approves PRD v1.0", async () => {
      const res = await makeRequest(baseUrl, "POST", `/api/projects/${testProjectId}/prd/approve`, leadHeaders, { prdId: createdPrdId });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.prd.status, "approved");
    });

    // ── 4. PATCH /api/prd/:id on approved PRD bumps version (1.0 -> 1.1) ──────
    await runTest("PATCH on approved PRD bumps version to 1.1 and marks 1.0 superseded", async () => {
      const res = await makeRequest(baseUrl, "PATCH", `/api/prd/${createdPrdId}`, leadHeaders, {
        executive_summary: "Updated executive summary with enterprise rollback controls.",
        scope_in: ["Core Architecture", "Change Transaction Logging", "Rollback Preview"],
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.versionBumped, true);
      assert.strictEqual(res.body.prd.version, "1.1");
      assert.strictEqual(res.body.prd.status, "approved");
      assert.strictEqual(res.body.previousVersion, "1.0");
      assert(Array.isArray(res.body.diffs));
      assert(res.body.diffs.some((d) => d.field === "executive_summary"));
      bumpedPrdId = res.body.prd._id;

      // Verify old PRD is superseded
      const oldPrd = await PRD.findById(createdPrdId);
      assert.strictEqual(oldPrd.status, "superseded");
      assert.strictEqual(oldPrd.superseded_by.toString(), bumpedPrdId.toString());
    });

    // ── 5. POST /api/projects/:id/changes/request: Consequence preview ─────────
    await runTest("Product Lead requests change consequence preview", async () => {
      const previewPayload = {
        change_description: "Add Stripe webhooks and idempotency checks",
        tasks_to_add: [
          {
            title: "Stripe Webhook Listener",
            estimate_hours: 16,
            assignee_ids: [devId],
          },
        ],
        tasks_to_modify: [
          {
            taskId: existingTaskId.toString(),
            old_estimate_hours: 10,
            new_estimate_hours: 18,
          },
        ],
      };

      const res = await makeRequest(baseUrl, "POST", `/api/projects/${testProjectId}/changes/request`, leadHeaders, previewPayload);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const summary = res.body.preview.consequence_summary;
      assert.strictEqual(summary.deltaHours, 24); // 16 + (18 - 10) = 24
      assert.strictEqual(summary.deltaDays, 3);   // ceil(24 / 8) = 3
      assert(summary.deltaCost > 0);
      assert.strictEqual(res.body.preview.prd_version_before, "1.1");
      assert.strictEqual(res.body.preview.prd_version_after, "1.2");
    });

    // ── 6. POST /api/projects/:id/changes/apply: Applies change transaction ────
    await runTest("Product Lead applies scope change: creates ChangeTransaction and bumps PRD to 1.2", async () => {
      const applyPayload = {
        change_description: "Add Stripe webhooks and idempotency checks",
        consequence_summary: {
          deltaHours: 24,
          deltaDays: 3,
          deltaCost: 2400,
        },
        tasks_to_add: [
          {
            title: "Stripe Webhook Listener",
            estimate_hours: 16,
            assignee_ids: [devId],
          },
        ],
        tasks_to_modify: [
          {
            taskId: existingTaskId.toString(),
            title: "Core Architecture Setup (Expanded for Webhooks)",
            estimate_hours: 18,
          },
        ],
      };

      const res = await makeRequest(baseUrl, "POST", `/api/projects/${testProjectId}/changes/apply`, leadHeaders, applyPayload);
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      const tx = res.body.changeTransaction;
      assert.strictEqual(tx.status, "applied");
      assert.strictEqual(tx.prd_version_before, "1.1");
      assert.strictEqual(tx.prd_version_after, "1.2");
      assert.strictEqual(tx.tasks_added.length, 1);
      assert.strictEqual(tx.tasks_modified.length, 1);
      changeTxId = tx._id;
      createdTaskId = tx.tasks_added[0];

      // Verify PRD 1.2 is approved
      const latestPrd = await PRD.findOne({ project_id: testProjectId, version: "1.2" });
      assert.strictEqual(latestPrd.status, "approved");
    });

    // ── 7. POST /api/changes/:id/rollback-preview: Impact preview ──────────────
    await runTest("Product Lead previews rollback impact", async () => {
      const res = await makeRequest(baseUrl, "POST", `/api/changes/${changeTxId}/rollback-preview`, leadHeaders, {});
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const impact = res.body.impact;
      assert.strictEqual(impact.canRollback, true);
      assert.strictEqual(impact.orphanedWork.length, 0);
      assert.strictEqual(impact.conflictingTasks.length, 0);
      assert.strictEqual(impact.hoursToBeFreed, 24); // 16 added + 8 modified delta
    });

    // ── 8. Rollback with completed task requires confirmation (400) ───────────
    await runTest("Rollback requires explicit confirmed: true when task is completed", async () => {
      // Mark added task as completed
      await Task.updateOne({ _id: createdTaskId }, { status: "completed", logged_hours: 16 });

      const res = await makeRequest(baseUrl, "POST", `/api/changes/${changeTxId}/rollback`, leadHeaders, { confirmed: false });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.requiresConfirmation, true);
      assert.strictEqual(res.body.orphanedWork.length, 1);
      assert.strictEqual(res.body.orphanedWork[0].taskId.toString(), createdTaskId.toString());
    });

    // ── 9. Rollback blocked if subsequent modification diverged (409) ─────────
    await runTest("Rollback is blocked with 409 if task state diverged", async () => {
      // Artificially diverge the modified task's estimate from 18 to 30
      await Task.updateOne({ _id: existingTaskId }, { estimate_hours: 30 });

      const res = await makeRequest(baseUrl, "POST", `/api/changes/${changeTxId}/rollback`, leadHeaders, { confirmed: true });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.success, false);
      assert(Array.isArray(res.body.conflictingTasks));
      assert.strictEqual(res.body.conflictingTasks.length, 1);
    });

    // ── 10. Successful rollback when confirmed and conflicts resolved (200) ────
    await runTest("Successful rollback restores PRD to 1.1, archives orphaned work, and reverts modified task", async () => {
      // Restore estimate_hours back to 18 so it matches 'after' snapshot
      await Task.updateOne({ _id: existingTaskId }, { estimate_hours: 18 });

      const res = await makeRequest(baseUrl, "POST", `/api/changes/${changeTxId}/rollback`, leadHeaders, { confirmed: true });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.changeTransaction.status, "rolled_back");
      assert.strictEqual(res.body.revertedPrdVersion, "1.1");

      // Verify PRD 1.1 is reactivated as approved
      const prd11 = await PRD.findOne({ project_id: testProjectId, version: "1.1" });
      assert.strictEqual(prd11.status, "approved");

      // Verify modified task reverted to original title and estimate_hours 10
      const restoredTask = await Task.findById(existingTaskId);
      assert.strictEqual(restoredTask.title, "Core Architecture Setup");
      assert.strictEqual(restoredTask.estimate_hours, 10);

      // Verify added completed task was archived with label prefix, not deleted
      const archivedTask = await Task.findById(createdTaskId);
      assert(archivedTask.title.includes("[Orphaned Archive]"));

      // Verify AuditLog record
      const audit = await AuditLog.findOne({
        entityId: changeTxId.toString(),
        action: "SCOPE_CHANGE_ROLLED_BACK",
      });
      assert(audit);
    });

    console.log("\n═══════════════════════════════════════════════════════");
    console.log(`PHASE 12 INTEGRATION TESTS SUMMARY: ${passedCount}/${totalCount} PASSED`);
    console.log("═══════════════════════════════════════════════════════");
    console.log("ALL PHASE 12 INTEGRATION TESTS PASSED! ✓\n");
  } finally {
    // Cleanup
    await Project.deleteOne({ _id: testProjectId });
    await Task.deleteMany({ project_id: testProjectId });
    await PRD.deleteMany({ project_id: testProjectId });
    await ChangeTransaction.deleteMany({ project_id: testProjectId });
    server.close();
    setTimeout(() => {
      process.exit(0);
    }, 200);
  }
}

runIntegrationTests().catch((err) => {
  console.error("Phase 12 integration tests failed:", err);
  process.exit(1);
});
