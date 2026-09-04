/**
 * Phase 9 Integration Test Suite (Database & Live HTTP Endpoints)
 *
 * Verifies:
 * 1. Creation Thread initialization & message posting with author_role_at_time snapshot.
 * 2. SME Expert Invitation:
 *    - Product Lead invites employee as SME.
 *    - Verifies AuditLog (SME_EXPERT_INVITED) and Notification (type: sme_invite).
 *    - Non-Product Lead is rejected with 403.
 * 3. Scoped Thread Access & Allowlist Sanitization:
 *    - Invited SME posts message (role snapshot: "invited_expert").
 *    - Invited SME reads thread: sensitive keys (budgeted_cost, team_allocations) are strictly absent.
 * 4. Revocation of SME Access:
 *    - Product Lead revokes SME invite.
 *    - Verifies AuditLog (SME_EXPERT_REVOKED).
 *    - Revoked SME is immediately blocked with 403.
 * 5. Finalization & Dual-Layer Lock:
 *    - Finalizing thread sets status="finalized" AND revokes all active expert invites.
 *    - Expert access denied on finalized thread.
 * 6. GET /api/creation-threads/my-invitations:
 *    - Returns active SME invitations for contributor.
 */

require("dotenv").config();
const assert = require("assert");
const http = require("http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const connectDB = require("./db");
const { Project, Task } = require("./models/models");
const User = require("./models/User");
const CreationThread = require("./models/CreationThread");
const Notification = require("./models/Notification");
const AuditLog = require("./models/AuditLog");
const { app } = require("./index");

const JWT_SECRET = process.env.JWT_SECRET || "acube-pm-production-secret-key-2026";

async function runPhase9IntegrationTests() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("PHASE 9 INTEGRATION TESTS (DB, SME INVITES & RBAC)");
  console.log("═══════════════════════════════════════════════════════\n");

  await connectDB();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const leadToken = jwt.sign(
    { uid: "lead_alex_turner", email: "alex@acube.ai", user_type: "product_lead" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const architectToken = jwt.sign(
    { uid: "arch_sophia_chen", email: "sophia@acube.ai", user_type: "lead_architect" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const smeToken = jwt.sign(
    { uid: "emp_dr_clara_expert", email: "clara@acube.ai", user_type: "employee" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const uninvitedToken = jwt.sign(
    { uid: "emp_uninvited_dev", email: "dev@acube.ai", user_type: "employee" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  let passed = 0;
  let total = 0;

  async function testCase(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      process.exitCode = 1;
    }
  }

  try {
    // ─── Setup Fixtures ──────────────────────────────────────────────────────
    await User.findByIdAndUpdate(
      "lead_alex_turner",
      {
        _id: "lead_alex_turner",
        email: "alex@acube.ai",
        full_name: "Alex Turner",
        user_type: "product_lead",
        role_title: "Product Lead",
        status: "active",
      },
      { upsert: true }
    );

    await User.findByIdAndUpdate(
      "arch_sophia_chen",
      {
        _id: "arch_sophia_chen",
        email: "sophia@acube.ai",
        full_name: "Sophia Chen",
        user_type: "lead_architect",
        role_title: "Lead Architect",
        status: "active",
      },
      { upsert: true }
    );

    await User.findByIdAndUpdate(
      "emp_dr_clara_expert",
      {
        _id: "emp_dr_clara_expert",
        email: "clara@acube.ai",
        full_name: "Dr. Clara Oswald",
        user_type: "employee",
        role_title: "Principal Security Architect",
        hourly_cost_rate: 220,
        status: "active",
      },
      { upsert: true }
    );

    await User.findByIdAndUpdate(
      "emp_uninvited_dev",
      {
        _id: "emp_uninvited_dev",
        email: "dev@acube.ai",
        full_name: "Uninvited Dev",
        user_type: "employee",
        role_title: "Junior Dev",
        status: "active",
      },
      { upsert: true }
    );

    const testProject = await Project.create({
      title: "PCI-DSS Compliant Payment Ingestion Engine",
      description: "Secure gateway with hardware security module tokenization.",
      created_by: "lead_alex_turner",
      status: "in-review",
      priority: "P1",
      budgeted_cost: 95000,
      member_ids: ["arch_sophia_chen"],
      team_allocations: [{ user_id: "arch_sophia_chen", daily_hours: 4 }],
    });

    // ─── 1. Product Lead Posts Message & Auto-Initializes Thread ─────────────
    await testCase("Product Lead posts clarification message and thread is initialized", async () => {
      const res = await fetch(`${baseUrl}/api/projects/${testProject._id}/creation-thread/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${leadToken}`,
        },
        body: JSON.stringify({
          content: "Welcome to the project intake deliberation. We need expert review on HSM key rotation.",
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.message.author_role_at_time, "product_lead");
      assert.strictEqual(data.message.author_name, "Alex Turner");

      // Verify thread created in MongoDB
      const thread = await CreationThread.findOne({ project_id: testProject._id });
      assert.ok(thread);
      assert.strictEqual(thread.status, "active");
      assert.strictEqual(thread.messages.length, 1);
    });

    // ─── 2. Uninvited Employee Denied Access ─────────────────────────────────
    await testCase("Uninvited employee is denied access (403)", async () => {
      const res = await fetch(`${baseUrl}/api/projects/${testProject._id}/creation-thread`, {
        headers: { Authorization: `Bearer ${uninvitedToken}` },
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.code, "CREATION_THREAD_ACCESS_DENIED");
    });

    // ─── 3. Invite SME Expert ────────────────────────────────────────────────
    await testCase("Product Lead invites SME expert, creating AuditLog and Notification", async () => {
      const res = await fetch(`${baseUrl}/api/projects/${testProject._id}/creation-thread/invite-expert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${leadToken}`,
        },
        body: JSON.stringify({ user_id: "emp_dr_clara_expert" }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.expert.user_id, "emp_dr_clara_expert");

      // Verify AuditLog
      const audit = await AuditLog.findOne({
        action: "SME_EXPERT_INVITED",
        "after.user_id": "emp_dr_clara_expert",
      }).sort({ created_at: -1 });
      assert.ok(audit, "AuditLog for SME_EXPERT_INVITED must exist");
      assert.strictEqual(audit.actorId, "lead_alex_turner");

      // Verify Notification
      const notif = await Notification.findOne({
        recipient_id: "emp_dr_clara_expert",
        type: "sme_invite",
      }).sort({ created_at: -1 });
      assert.ok(notif, "Notification for sme_invite must exist");
      assert.ok(notif.message.includes("PCI-DSS Compliant Payment Ingestion Engine"));
    });

    // ─── 4. Non-Lead Cannot Invite Expert ────────────────────────────────────
    await testCase("Non-Product Lead cannot invite experts (403)", async () => {
      const res = await fetch(`${baseUrl}/api/projects/${testProject._id}/creation-thread/invite-expert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${architectToken}`,
        },
        body: JSON.stringify({ user_id: "emp_uninvited_dev" }),
      });
      assert.strictEqual(res.status, 403);
    });

    // ─── 5. Invited Expert Reads Thread & Gets Filtered Data ─────────────────
    await testCase("Invited SME reads thread and confidential keys are strictly ABSENT", async () => {
      const res = await fetch(`${baseUrl}/api/projects/${testProject._id}/creation-thread`, {
        headers: { Authorization: `Bearer ${smeToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.thread);

      // Verify allowlisted content is present
      assert.strictEqual(data.thread.title, "PCI-DSS Compliant Payment Ingestion Engine");
      assert.strictEqual(data.thread.status, "active");
      assert.ok(Array.isArray(data.thread.messages));

      // CRITICAL SECURITY ASSERTION:
      // Sensitive keys must NOT be present on the thread object returned to the expert
      assert.strictEqual("budgeted_cost" in data.thread, false, "budgeted_cost key must be absent");
      assert.strictEqual("hourly_cost_rate" in data.thread, false, "hourly_cost_rate key must be absent");
      assert.strictEqual("team_allocations" in data.thread, false, "team_allocations key must be absent");
      assert.strictEqual("member_ids" in data.thread, false, "member_ids key must be absent");
    });

    // ─── 6. Invited Expert Posts Message with Role Snapshot ──────────────────
    await testCase("Invited SME posts clarification message with snapshot 'invited_expert'", async () => {
      const res = await fetch(`${baseUrl}/api/projects/${testProject._id}/creation-thread/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${smeToken}`,
        },
        body: JSON.stringify({
          content: "We must mandate FIPS 140-2 Level 3 compliant HSMs for envelope encryption.",
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.message.author_role_at_time, "invited_expert");
      assert.strictEqual(data.message.author_name, "Dr. Clara Oswald");
    });

    // ─── 7. Expert Checks My-Invitations ────────────────────────────────────
    await testCase("GET /api/creation-threads/my-invitations returns active project for SME", async () => {
      const res = await fetch(`${baseUrl}/api/creation-threads/my-invitations`, {
        headers: { Authorization: `Bearer ${smeToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.invitations));

      const myInvite = data.invitations.find((inv) => inv.projectId === String(testProject._id));
      assert.ok(myInvite, "Project should appear in user's active SME invitations");
      assert.strictEqual(myInvite.status, "active");
    });

    // ─── 8. Revoke Expert ────────────────────────────────────────────────────
    await testCase("Product Lead revokes SME access and subsequent requests return 403", async () => {
      const revokeRes = await fetch(`${baseUrl}/api/projects/${testProject._id}/creation-thread/revoke-expert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${leadToken}`,
        },
        body: JSON.stringify({ user_id: "emp_dr_clara_expert" }),
      });

      assert.strictEqual(revokeRes.status, 200);

      // Verify AuditLog
      const audit = await AuditLog.findOne({
        action: "SME_EXPERT_REVOKED",
        "after.user_id": "emp_dr_clara_expert",
      }).sort({ created_at: -1 });
      assert.ok(audit, "AuditLog for SME_EXPERT_REVOKED must exist");

      // Verify SME is now blocked immediately
      const blockedRes = await fetch(`${baseUrl}/api/projects/${testProject._id}/creation-thread`, {
        headers: { Authorization: `Bearer ${smeToken}` },
      });
      assert.strictEqual(blockedRes.status, 403);
    });

    // ─── 9. Finalize Thread Dual-Layer Check ──────────────────────────────────
    await testCase("Finalizing creation thread locks thread and revokes all active invites", async () => {
      // Re-invite expert first
      await fetch(`${baseUrl}/api/projects/${testProject._id}/creation-thread/invite-expert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${leadToken}`,
        },
        body: JSON.stringify({ user_id: "emp_dr_clara_expert" }),
      });

      // Finalize
      const finalizeRes = await fetch(`${baseUrl}/api/projects/${testProject._id}/creation-thread/finalize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${leadToken}` },
      });

      assert.strictEqual(finalizeRes.status, 200);
      const finData = await finalizeRes.json();
      assert.strictEqual(finData.thread.status, "finalized");

      // Verify all invites in DB have revoked_at set
      const thread = await CreationThread.findOne({ project_id: testProject._id });
      assert.strictEqual(thread.status, "finalized");
      for (const inv of thread.invited_experts) {
        assert.ok(inv.revoked_at !== null, "All invited_experts entries must have revoked_at timestamp");
      }

      // Verify expert is blocked with 403
      const blockedRes = await fetch(`${baseUrl}/api/projects/${testProject._id}/creation-thread`, {
        headers: { Authorization: `Bearer ${smeToken}` },
      });
      assert.strictEqual(blockedRes.status, 403);
    });

    // Clean up
    await CreationThread.deleteMany({ project_id: testProject._id });
    await Project.findByIdAndDelete(testProject._id);
  } finally {
    server.close();
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`PHASE 9 INTEGRATION TESTS SUMMARY: ${passed}/${total} PASSED`);
  console.log("═══════════════════════════════════════════════════════");

  if (passed !== total) {
    process.exit(1);
  } else {
    console.log("ALL PHASE 9 INTEGRATION TESTS PASSED! ✓\n");
  }
}

if (require.main === module) {
  runPhase9IntegrationTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Test execution failed:", err);
      process.exit(1);
    });
}

module.exports = { runPhase9IntegrationTests };
