require("dotenv").config();
const jwt = require("jsonwebtoken");
const express = require("express");
const connectDB = require("./db");
const { Project, Task } = require("./models/models");
const AuditLog = require("./models/AuditLog");
const { JWT_SECRET } = require("./middleware/auth");

const app = express();
app.use(express.json());
const tasksRoutes = require("./routes/tasks");
app.use("/api/tasks", tasksRoutes);

async function testApiPhase2() {
  console.log("🧪 Running Phase 2 API Route & DAG Cycle Guard Tests...\n");
  await connectDB();

  const server = app.listen(5098);
  const baseUrl = "http://localhost:5098";

  const leadToken = jwt.sign(
    { uid: "lead_sarah_connor", email: "lead@acube.ai", user_type: "product_lead" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  try {
    // Setup 3 test tasks
    const dummyProjectId = "65f000000000000000000099";

    // Clean any previous test artifacts
    await Task.deleteMany({ project_id: dummyProjectId });

    const t1 = await Task.create({
      project_id: dummyProjectId,
      title: "Task Alpha (Database Design)",
      start_date: "2026-09-01",
      end_date: "2026-09-05",
      depends_on: [],
    });

    const t2 = await Task.create({
      project_id: dummyProjectId,
      title: "Task Beta (API Endpoints)",
      start_date: "2026-09-06",
      end_date: "2026-09-10",
      depends_on: [],
    });

    const t3 = await Task.create({
      project_id: dummyProjectId,
      title: "Task Gamma (Frontend UI)",
      start_date: "2026-09-11",
      end_date: "2026-09-15",
      depends_on: [],
    });

    console.log("✓ Created 3 test tasks: Alpha, Beta, Gamma");

    // 1. Valid dependency: Beta depends on Alpha (Alpha → Beta)
    const resBeta = await fetch(`${baseUrl}/api/tasks/${t2._id}/dependencies`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leadToken}`,
      },
      body: JSON.stringify({ depends_on: [t1._id] }),
    });
    console.log(`✓ Beta depends on Alpha: HTTP ${resBeta.status} (Expected: 200)`);
    if (resBeta.status !== 200) throw new Error("Failed to set valid dependency");

    // 2. Valid dependency: Gamma depends on Beta (Alpha → Beta → Gamma)
    const resGamma = await fetch(`${baseUrl}/api/tasks/${t3._id}/dependencies`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leadToken}`,
      },
      body: JSON.stringify({ depends_on: [t2._id] }),
    });
    console.log(`✓ Gamma depends on Beta: HTTP ${resGamma.status} (Expected: 200)`);
    if (resGamma.status !== 200) throw new Error("Failed to set valid dependency");

    // 3. Cycle attempt: Alpha proposes to depend on Gamma (creating Alpha → Gamma → Beta → Alpha)
    const resCycle = await fetch(`${baseUrl}/api/tasks/${t1._id}/dependencies`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leadToken}`,
      },
      body: JSON.stringify({ depends_on: [t3._id] }),
    });
    const cycleData = await resCycle.json();
    console.log(`✓ Cycle Detection Guard: HTTP ${resCycle.status} (Expected: 409)`);
    console.log(`  Cycle Path returned: ${cycleData.cyclePath?.join(" → ")}`);
    console.log(`  Message: "${cycleData.message}"`);

    if (resCycle.status !== 409 || !cycleData.cyclePath || cycleData.cyclePath.length < 3) {
      throw new Error(`Cycle detection failed: ${JSON.stringify(cycleData)}`);
    }

    // 4. Test DELETE guard: Try deleting Beta while Gamma depends on it
    const resDelBlocked = await fetch(`${baseUrl}/api/tasks/${t2._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${leadToken}` },
    });
    const delBlockedData = await resDelBlocked.json();
    console.log(`✓ Delete Guard: HTTP ${resDelBlocked.status} (Expected: 409)`);
    console.log(`  Blocked message: "${delBlockedData.message}"`);
    if (resDelBlocked.status !== 409 || !delBlockedData.dependentTasks?.includes("Task Gamma (Frontend UI)")) {
      throw new Error(`Delete guard failed: ${JSON.stringify(delBlockedData)}`);
    }

    // 5. GET /api/tasks/project/:id/graph
    const resGraph = await fetch(`${baseUrl}/api/tasks/project/${dummyProjectId}/graph`, {
      headers: { Authorization: `Bearer ${leadToken}` },
    });
    const graphData = await resGraph.json();
    console.log(`✓ Graph Endpoint: Returned ${graphData.tasks?.length} graph tasks`);
    if (graphData.tasks?.length !== 3) {
      throw new Error("Graph endpoint did not return all project tasks");
    }

    // Clean up test tasks
    await Task.deleteMany({ project_id: dummyProjectId });
    console.log("\n🎉 ALL PHASE 2 API ROUTES & CYCLE DETECTION TESTS PASSED!");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await require("mongoose").disconnect();
  }
}

testApiPhase2().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
