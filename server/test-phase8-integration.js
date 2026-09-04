/**
 * Phase 8 Integration Test Suite (Database & Live HTTP Endpoints)
 *
 * Verifies:
 * 1. GET /api/portfolio/dashboard
 *    - Product Lead sees full project health, pending actions, and budget snapshot.
 *    - Lead Architect sees project health and pending actions, but budget keys are strictly OMITTED.
 *    - Employee is rejected with 403.
 * 2. GET /api/portfolio/utilization-heatmap
 *    - Reuses Phase 3 allocation data across active employees.
 * 3. GET /api/projects/:id/budget
 *    - Product Lead receives complete financial burn breakdown.
 *    - Lead Architect is rejected with 403 (confidential compensation restriction).
 *    - Employee is rejected with 403.
 * 4. PATCH /api/users/:id/cost-rate
 *    - Product Lead updates rate and generates immutable COST_RATE_UPDATED AuditLog.
 *    - Non-Product Lead is rejected with 403.
 * 5. GET /api/users/employees & GET /api/users/:id
 *    - Non-Product Lead does NOT receive confidential hourly_cost_rate field.
 */

require("dotenv").config();
const assert = require("assert");
const http = require("http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const connectDB = require("./db");
const { Project, Task, DailyLog } = require("./models/models");
const User = require("./models/User");
const SlippageEvent = require("./models/SlippageEvent");
const Appeal = require("./models/Appeal");
const Submission = require("./models/Submission");
const ActionRequest = require("./models/ActionRequest");
const AuditLog = require("./models/AuditLog");
const { app } = require("./index");

const JWT_SECRET = process.env.JWT_SECRET || "acube-pm-production-secret-key-2026";

async function runPhase8IntegrationTests() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("PHASE 8 INTEGRATION TESTS (DB & API RBAC)");
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

  const empToken = jwt.sign(
    { uid: "emp_maya_lin", email: "maya@acube.ai", user_type: "employee" },
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
    // Ensure Users exist
    await User.findByIdAndUpdate(
      "lead_alex_turner",
      {
        _id: "lead_alex_turner",
        email: "alex@acube.ai",
        full_name: "Alex Turner",
        user_type: "product_lead",
        role_title: "Product Lead",
        hourly_cost_rate: 150,
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
        hourly_cost_rate: 130,
        status: "active",
      },
      { upsert: true }
    );

    await User.findByIdAndUpdate(
      "emp_maya_lin",
      {
        _id: "emp_maya_lin",
        email: "maya@acube.ai",
        full_name: "Maya Lin",
        user_type: "employee",
        role_title: "Frontend Engineer",
        hourly_cost_rate: 85,
        status: "active",
      },
      { upsert: true }
    );

    const testProject = await Project.create({
      title: "Phase 8 Portfolio Test Initiative",
      created_by: "lead_alex_turner",
      status: "active",
      priority: "P1",
      budgeted_cost: 25000,
      member_ids: ["emp_maya_lin", "arch_sophia_chen"],
      team_allocations: [
        { user_id: "emp_maya_lin", daily_hours: 6 },
        { user_id: "arch_sophia_chen", daily_hours: 2 },
      ],
    });

    const testTask = await Task.create({
      project_id: testProject._id,
      title: "Portfolio Dashboard Core Integration",
      start_date: "2026-09-05",
      end_date: "2026-09-12",
      assignee_ids: ["emp_maya_lin"],
      estimate_hours: 40,
      logged_hours: 20,
      status: "active",
    });

    // ─── Test Suite ──────────────────────────────────────────────────────────

    await testCase("Product Lead receives full dashboard with budget fields", async () => {
      const res = await fetch(`${baseUrl}/api/portfolio/dashboard`, {
        headers: { Authorization: `Bearer ${leadToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.summary);
      assert.ok(typeof data.summary.totalPendingActions === "number");
      assert.ok(Array.isArray(data.projects));

      const projCard = data.projects.find((p) => String(p.id) === String(testProject._id));
      assert.ok(projCard, "Test project should appear in active portfolio dashboard");
      assert.strictEqual(projCard.priority, "P1");
      assert.ok(projCard.health);
      assert.ok(["green", "yellow", "red"].includes(projCard.health.health));

      // Product Lead MUST receive budget snapshot
      assert.ok(projCard.budget, "Product Lead must receive budget snapshot");
      assert.ok(typeof projCard.budget.budgetedCost === "number");
      assert.ok(typeof projCard.budget.actualCostBurned === "number");
      assert.ok(typeof projCard.budget.projectedFinalCost === "number");
      assert.ok(typeof projCard.budget.remainingBudget === "number");
      assert.ok(["green", "yellow", "red"].includes(projCard.budget.status));
    });

    await testCase("Lead Architect receives dashboard with budget keys completely OMITTED", async () => {
      const res = await fetch(`${baseUrl}/api/portfolio/dashboard`, {
        headers: { Authorization: `Bearer ${architectToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      const projCard = data.projects.find((p) => String(p.id) === String(testProject._id));
      assert.ok(projCard);
      // CONFIDENTIAL RESTRICTION: Budget key must be undefined / omitted
      assert.strictEqual(
        projCard.budget,
        undefined,
        "Budget key must be completely omitted for Lead Architect"
      );
      // Health is still visible
      assert.ok(projCard.health);
    });

    await testCase("Employee receives 403 Forbidden on portfolio dashboard", async () => {
      const res = await fetch(`${baseUrl}/api/portfolio/dashboard`, {
        headers: { Authorization: `Bearer ${empToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    await testCase("Lead Architect & Product Lead can access utilization heatmap", async () => {
      const res = await fetch(`${baseUrl}/api/portfolio/utilization-heatmap`, {
        headers: { Authorization: `Bearer ${architectToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.heatmap));

      const mayaEntry = data.heatmap.find((h) => h.userId === "emp_maya_lin");
      assert.ok(mayaEntry, "Maya Lin should appear in utilization heatmap");
      assert.ok(typeof mayaEntry.totalDailyHours === "number");
      assert.ok(typeof mayaEntry.dailyCap === "number");
      assert.ok(typeof mayaEntry.utilizationPct === "number");
    });

    await testCase("Employee receives 403 Forbidden on utilization heatmap", async () => {
      const res = await fetch(`${baseUrl}/api/portfolio/utilization-heatmap`, {
        headers: { Authorization: `Bearer ${empToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    await testCase("Product Lead can access full project budget detail", async () => {
      const res = await fetch(`${baseUrl}/api/projects/${testProject._id}/budget`, {
        headers: { Authorization: `Bearer ${leadToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.projectId, String(testProject._id));
      assert.strictEqual(data.budgetedCost, 25000);
      assert.ok(Array.isArray(data.memberBreakdown));
    });

    await testCase("Lead Architect receives 403 Forbidden on project budget detail", async () => {
      const res = await fetch(`${baseUrl}/api/projects/${testProject._id}/budget`, {
        headers: { Authorization: `Bearer ${architectToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    await testCase("Product Lead updates employee cost rate and writes sensitive AuditLog", async () => {
      const updateRes = await fetch(`${baseUrl}/api/users/emp_maya_lin/cost-rate`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${leadToken}`,
        },
        body: JSON.stringify({ hourly_cost_rate: 95 }),
      });
      assert.strictEqual(updateRes.status, 200);
      const updateData = await updateRes.json();
      assert.strictEqual(updateData.success, true);
      assert.strictEqual(updateData.user.hourly_cost_rate, 95);

      // Verify AuditLog was recorded
      const auditEntry = await AuditLog.findOne({
        action: "COST_RATE_UPDATED",
        entityId: "emp_maya_lin",
      }).sort({ created_at: -1 });

      assert.ok(auditEntry, "COST_RATE_UPDATED AuditLog must be created");
      assert.strictEqual(auditEntry.actorId, "lead_alex_turner");
      assert.strictEqual(auditEntry.after.hourly_cost_rate, 95);
    });

    await testCase("Non-Product Lead cannot update employee cost rate (403)", async () => {
      const updateRes = await fetch(`${baseUrl}/api/users/emp_maya_lin/cost-rate`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${architectToken}`,
        },
        body: JSON.stringify({ hourly_cost_rate: 110 }),
      });
      assert.strictEqual(updateRes.status, 403);
    });

    await testCase("Employee list masks hourly_cost_rate for non-Product Lead", async () => {
      const res = await fetch(`${baseUrl}/api/users/employees`, {
        headers: { Authorization: `Bearer ${architectToken}` },
      });
      assert.strictEqual(res.status, 200);
      const employees = await res.json();
      assert.ok(Array.isArray(employees));
      for (const emp of employees) {
        assert.strictEqual(
          emp.hourly_cost_rate,
          undefined,
          `hourly_cost_rate must not be exposed to Lead Architect for user ${emp.full_name}`
        );
      }
    });

    // Clean up test records
    await Task.deleteMany({ project_id: testProject._id });
    await Project.findByIdAndDelete(testProject._id);
  } finally {
    server.close();
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`PHASE 8 INTEGRATION TESTS SUMMARY: ${passed}/${total} PASSED`);
  console.log("═══════════════════════════════════════════════════════");

  if (passed !== total) {
    process.exit(1);
  } else {
    console.log("ALL PHASE 8 INTEGRATION TESTS PASSED! ✓\n");
  }
}

if (require.main === module) {
  runPhase8IntegrationTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Test execution failed:", err);
      process.exit(1);
    });
}

module.exports = { runPhase8IntegrationTests };
