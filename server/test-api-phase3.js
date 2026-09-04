require("dotenv").config();
const jwt = require("jsonwebtoken");
const express = require("express");
const connectDB = require("./db");
const { Project } = require("./models/models");
const User = require("./models/User");
const AuditLog = require("./models/AuditLog");
const { JWT_SECRET } = require("./middleware/auth");

const app = express();
app.use(express.json());
const projectsRoutes = require("./routes/projects");
const capacityRoutes = require("./routes/capacity");
app.use("/api/projects", projectsRoutes);
app.use("/api/capacity", capacityRoutes);

async function testApiPhase3() {
  console.log("🧪 Running Phase 3 API Integration & Capacity Gate Tests...\n");
  await connectDB();

  const server = app.listen(5099);
  const baseUrl = "http://localhost:5099";

  const leadToken = jwt.sign(
    { uid: "lead_sarah_connor", email: "lead@acube.ai", user_type: "product_lead" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const empToken = jwt.sign(
    { uid: "emp_riya_patel", email: "riya@acube.ai", user_type: "employee" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  try {
    // 1. Test Priority PATCH validation
    console.log("--- 1. Testing Project Priority Validation ---");
    const testProject = await Project.create({
      title: "Phase 3 API Test Project",
      created_by: "lead_sarah_connor",
      priority: "P2",
      status: "active",
      member_ids: [],
      team_allocations: [],
    });

    // Test invalid priority value (e.g. legacy "medium" or garbage)
    const invalidRes = await fetch(`${baseUrl}/api/projects/${testProject._id}/priority`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${leadToken}` },
      body: JSON.stringify({ priority: "medium" }),
    });
    console.log(`✓ Invalid priority rejection: HTTP ${invalidRes.status} (Expected: 400)`);
    if (invalidRes.status !== 400) throw new Error("Should reject legacy priority value");

    // Test valid P1 priority
    const validRes = await fetch(`${baseUrl}/api/projects/${testProject._id}/priority`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${leadToken}` },
      body: JSON.stringify({ priority: "P1" }),
    });
    const validData = await validRes.json();
    console.log(`✓ Valid P1 priority update: HTTP ${validRes.status}, priority=${validData.priority} (Expected: P1)`);
    if (validData.priority !== "P1") throw new Error("Priority did not update to P1");

    // 2. Test Capacity Gate on Member Allocation
    console.log("\n--- 2. Testing Capacity Conflict Gate on Member Allocation ---");
    // User emp_riya_patel has defaultDailyCapHours = 8
    // Attempting to allocate 12 hours on testProject
    const conflictRes = await fetch(`${baseUrl}/api/projects/${testProject._id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${leadToken}` },
      body: JSON.stringify({
        userId: "emp_riya_patel",
        dailyHours: 12,
      }),
    });
    const conflictData = await conflictRes.json();
    console.log(`✓ Capacity Conflict Gate: HTTP ${conflictRes.status} (Expected: 409)`);
    console.log(`  Message: ${conflictData.message}`);
    console.log(`  Overflow hours: ${conflictData.overflowHours}`);
    console.log(`  Can force: ${conflictData.canForce}`);
    if (conflictRes.status !== 409 || !conflictData.overflowHours) {
      throw new Error(`Expected 409 conflict with overflow info, got ${conflictRes.status}`);
    }

    // 3. Test Forced Override by Product Lead
    console.log("\n--- 3. Testing Forced Override by Product Lead ---");
    const forceRes = await fetch(`${baseUrl}/api/projects/${testProject._id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${leadToken}` },
      body: JSON.stringify({
        userId: "emp_riya_patel",
        dailyHours: 12,
        force: true,
      }),
    });
    console.log(`✓ Forced override: HTTP ${forceRes.status} (Expected: 200)`);
    if (forceRes.status !== 200) throw new Error("Force override failed");

    // Verify AuditLog recorded CAPACITY_OVERRIDDEN
    const auditRecord = await AuditLog.findOne({ action: "CAPACITY_OVERRIDDEN" }).sort({ timestamp: -1 });
    console.log(`✓ AuditLog recorded action: ${auditRecord?.action} by actor ${auditRecord?.actorId}`);
    if (!auditRecord || auditRecord.action !== "CAPACITY_OVERRIDDEN") {
      throw new Error("CAPACITY_OVERRIDDEN was not recorded in AuditLog");
    }

    // 4. Test Capacity Routes
    console.log("\n--- 4. Testing Capacity API Routes ---");
    const capUserRes = await fetch(`${baseUrl}/api/capacity/emp_riya_patel`, {
      headers: { Authorization: `Bearer ${leadToken}` },
    });
    const capUserData = await capUserRes.json();
    console.log(`✓ GET /api/capacity/:userId: HTTP ${capUserRes.status}, totalDailyHours=${capUserData.data?.totalDailyHours}`);
    if (capUserRes.status !== 200 || !capUserData.data) throw new Error("Capacity user endpoint failed");

    const capDashRes = await fetch(`${baseUrl}/api/capacity/dashboard`, {
      headers: { Authorization: `Bearer ${leadToken}` },
    });
    const capDashData = await capDashRes.json();
    console.log(`✓ GET /api/capacity/dashboard: HTTP ${capDashRes.status}, entries=${capDashData.data?.length}`);
    if (capDashRes.status !== 200 || !Array.isArray(capDashData.data)) throw new Error("Capacity dashboard endpoint failed");

    // Employee cannot view someone else's capacity
    const empForbiddenRes = await fetch(`${baseUrl}/api/capacity/lead_sarah_connor`, {
      headers: { Authorization: `Bearer ${empToken}` },
    });
    console.log(`✓ RBAC check: Employee viewing another user capacity: HTTP ${empForbiddenRes.status} (Expected: 403)`);
    if (empForbiddenRes.status !== 403) throw new Error("Employee should be forbidden from other users capacity");

    // Clean up test project
    await Project.findByIdAndDelete(testProject._id);

    console.log("\n🎉 ALL PHASE 3 API INTEGRATION TESTS PASSED SUCCESSFULLY!");
  } finally {
    server.close();
  }
}

testApiPhase3()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ API Test failed:", err);
    process.exit(1);
  });
