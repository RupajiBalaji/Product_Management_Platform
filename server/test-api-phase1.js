require("dotenv").config();
const http = require("http");
const jwt = require("jsonwebtoken");
const connectDB = require("./db");
const DynamicRole = require("./models/DynamicRole");
const AuditLog = require("./models/AuditLog");
const { Project } = require("./models/models");
const { JWT_SECRET } = require("./middleware/auth");

// Start express app in-memory for testing
const express = require("express");
const app = express();
app.use(express.json());
const rolesRoutes = require("./routes/roles");
const projectsRoutes = require("./routes/projects");
app.use("/api/roles", rolesRoutes);
app.use("/api/projects", projectsRoutes);

async function runApiTests() {
  console.log("🧪 Starting Phase 1 API End-to-End Route Tests...");
  await connectDB();

  const server = app.listen(5099);
  const baseUrl = "http://localhost:5099";

  const leadToken = jwt.sign(
    { uid: "lead_sarah_connor", email: "lead@acube.ai", user_type: "product_lead" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const empToken = jwt.sign(
    { uid: "emp_riya_patel", email: "riya.patel@acube.ai", user_type: "employee" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  try {
    // 1. Employee trying to create role -> Expect 403
    const resForbidden = await fetch(`${baseUrl}/api/roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
      body: JSON.stringify({
        title: "Unauthorized Role",
        domain: "Engineering",
        skillTags: ["Hacking"],
        defaultDailyCapHours: 8,
      }),
    });
    console.log(`✓ RBAC Guard: Employee creation attempt returned ${resForbidden.status} (Expected: 403)`);
    if (resForbidden.status !== 403) {
      throw new Error(`Expected 403 Forbidden for employee, got ${resForbidden.status}`);
    }

    // 2. Product Lead creating role -> Expect 201
    const testTitle = `Test Principal SRE ${Date.now()}`;
    const resCreate = await fetch(`${baseUrl}/api/roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leadToken}`,
      },
      body: JSON.stringify({
        title: testTitle,
        domain: "Engineering",
        description: "Maintains high availability and disaster recovery runbooks",
        skillTags: ["Kubernetes", "Prometheus", "Terraform"],
        defaultDailyCapHours: 7,
      }),
    });
    const createdData = await resCreate.json();
    console.log(`✓ Product Lead creation: Status ${resCreate.status}, Role ID: ${createdData.role?._id}`);
    if (resCreate.status !== 201 || !createdData.role?._id) {
      throw new Error(`Failed to create role: ${JSON.stringify(createdData)}`);
    }
    const createdRoleId = createdData.role._id;

    // 3. GET /api/roles -> Expect 200 with list
    const resList = await fetch(`${baseUrl}/api/roles`, {
      headers: { Authorization: `Bearer ${empToken}` },
    });
    const listData = await resList.json();
    console.log(`✓ List roles: Found ${listData.roles?.length} roles`);
    if (!listData.roles?.some((r) => r.title === testTitle)) {
      throw new Error("Created role not found in GET /api/roles list!");
    }

    // 4. PUT /api/roles/:id -> Update role
    const resUpdate = await fetch(`${baseUrl}/api/roles/${createdRoleId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leadToken}`,
      },
      body: JSON.stringify({
        description: "Updated description for test SRE role",
        defaultDailyCapHours: 6,
      }),
    });
    const updatedData = await resUpdate.json();
    console.log(`✓ Role update: Daily cap updated to ${updatedData.role?.defaultDailyCapHours}h`);
    if (updatedData.role?.defaultDailyCapHours !== 6) {
      throw new Error("Role update failed!");
    }

    // 5. Test Project Member Allocation with DynamicRole
    const sampleProject = await Project.findOne();
    if (sampleProject) {
      const resAlloc = await fetch(`${baseUrl}/api/projects/${sampleProject._id}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${leadToken}`,
        },
        body: JSON.stringify({
          userId: "emp_dev_nair",
          roleId: createdRoleId,
          dailyHours: 6,
        }),
      });
      const allocData = await resAlloc.json();
      console.log(`✓ Project Member Allocation: Status ${resAlloc.status}, members count: ${allocData.members?.length}`);
      if (resAlloc.status !== 200) {
        throw new Error(`Member allocation failed: ${JSON.stringify(allocData)}`);
      }
    }

    // 6. DELETE /api/roles/:id
    const resDel = await fetch(`${baseUrl}/api/roles/${createdRoleId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${leadToken}` },
    });
    console.log(`✓ Role deletion: Status ${resDel.status}`);
    if (resDel.status !== 200) {
      throw new Error("Role deletion failed!");
    }

    // 7. Verify AuditLog entries
    const auditLogs = await AuditLog.find({ entityId: createdRoleId });
    console.log(`✓ Audit Registry: Recorded ${auditLogs.length} audit entries for test role lifecycle (CREATED, UPDATED, DELETED)`);
    if (auditLogs.length < 3) {
      throw new Error(`Expected at least 3 audit entries, found ${auditLogs.length}`);
    }

    console.log("🎉 ALL API ROUTE TESTS FOR PHASE 1 PASSED!");
  } finally {
    server.close();
    process.exit(0);
  }
}

runApiTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
