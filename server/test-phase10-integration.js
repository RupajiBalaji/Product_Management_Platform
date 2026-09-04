/**
 * Phase 10 — Database Integration Tests (MongoDB, TeamChannel, DMs & Visibility)
 *
 * Verifies:
 * 1. Auto-creation of TeamChannel on project launch
 * 2. Scoped visibility filtering on GET /api/projects/:id/channel
 * 3. Posting threads and messages to TeamChannel
 * 4. Dependency reference detection in messages
 * 5. Direct messaging lifecycle and participant isolation
 * 6. Permanent chat archival (no DELETE routes exist)
 */

const assert = require("assert");
const http = require("http");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
const { app } = require("./index");
const { Project, Task } = require("./models/models");
const User = require("./models/User");
const TeamChannel = require("./models/TeamChannel");
const DirectMessage = require("./models/DirectMessage");
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
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("PHASE 10 INTEGRATION TESTS (DB, TEAM CHANNEL & DMS)");
  console.log("═══════════════════════════════════════════════════════\n");

  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve) => mongoose.connection.once("open", resolve));
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Setup test users with explicit String _ids
  await User.findByIdAndUpdate(
    "lead_collab_tester",
    {
      _id: "lead_collab_tester",
      full_name: "Lead PM Tester",
      email: "lead_collab@acube.ai",
      user_type: "product_lead",
      role_title: "Product Lead",
      status: "active",
    },
    { upsert: true, new: true }
  );

  await User.findByIdAndUpdate(
    "dev_collab_alice",
    {
      _id: "dev_collab_alice",
      full_name: "Dev Alice",
      email: "alice_collab@acube.ai",
      user_type: "employee",
      role_title: "Backend Engineer",
      status: "active",
    },
    { upsert: true, new: true }
  );

  await User.findByIdAndUpdate(
    "dev_collab_bob",
    {
      _id: "dev_collab_bob",
      full_name: "Dev Bob",
      email: "bob_collab@acube.ai",
      user_type: "employee",
      role_title: "Frontend Engineer",
      status: "active",
    },
    { upsert: true, new: true }
  );

  await User.findByIdAndUpdate(
    "dev_collab_outsider",
    {
      _id: "dev_collab_outsider",
      full_name: "Outsider Dev",
      email: "outsider_collab@acube.ai",
      user_type: "employee",
      role_title: "Security Auditor",
      status: "active",
    },
    { upsert: true, new: true }
  );

  const leadToken = jwt.sign(
    { uid: "lead_collab_tester", email: "lead_collab@acube.ai", user_type: "product_lead" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const aliceToken = jwt.sign(
    { uid: "dev_collab_alice", email: "alice_collab@acube.ai", user_type: "employee" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const bobToken = jwt.sign(
    { uid: "dev_collab_bob", email: "bob_collab@acube.ai", user_type: "employee" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const outsiderToken = jwt.sign(
    { uid: "dev_collab_outsider", email: "outsider_collab@acube.ai", user_type: "employee" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Setup test project with team allocations and visibility tiers
  const testProject = await Project.create({
    title: "Project Phoenix Collaboration Testing",
    description: "Real-time communication platform test",
    priority: "P1",
    status: "active",
    created_by: "lead_collab_tester",
    member_ids: ["dev_collab_alice", "dev_collab_bob", "lead_collab_tester"],
    team_allocations: [
      {
        user_id: "dev_collab_alice",
        daily_hours: 8,
        visibility_tier: "own_data_only",
      },
      {
        user_id: "dev_collab_bob",
        daily_hours: 8,
        visibility_tier: "own_plus_dependency",
      },
    ],
  });

  // Setup project tasks:
  // Task 1: Auth Module (Alice)
  // Task 2: API Consumer (Bob, depends on Task 1)
  // Task 3: Unrelated Billing (Assigned to someone else)
  const task1 = await Task.create({
    project_id: testProject._id,
    title: "Auth Module Architecture",
    start_date: "2026-09-01",
    end_date: "2026-09-10",
    assignee_ids: ["dev_collab_alice"],
    depends_on: [],
  });

  const task2 = await Task.create({
    project_id: testProject._id,
    title: "API Consumer Implementation",
    start_date: "2026-09-10",
    end_date: "2026-09-20",
    assignee_ids: ["dev_collab_bob"],
    depends_on: [task1._id],
  });

  const task3 = await Task.create({
    project_id: testProject._id,
    title: "Billing Gateway Integration",
    start_date: "2026-09-15",
    end_date: "2026-09-25",
    assignee_ids: ["some_other_user_id"],
    depends_on: [],
  });

  // 1. GET /api/projects/:id/channel auto-creates channel and returns general thread
  await runTest("GET /api/projects/:id/channel auto-initializes channel for project members", async () => {
    const res = await makeRequest(
      baseUrl,
      "GET",
      `/api/projects/${testProject._id}/channel`,
      { Authorization: `Bearer ${aliceToken}` }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.channel.threads.length >= 1, true);
    assert.strictEqual(res.body.channel.threads[0].topic, "General Team Discussions");
  });

  // 2. Unassigned user denied access (403)
  await runTest("Unassigned user is denied access to project channel (403)", async () => {
    const res = await makeRequest(
      baseUrl,
      "GET",
      `/api/projects/${testProject._id}/channel`,
      { Authorization: `Bearer ${outsiderToken}` }
    );
    assert.strictEqual(res.status, 403);
  });

  // 3. POST /api/projects/:id/channel/threads creates new thread with AuditLog
  let generalThreadId = null;
  let task1ThreadId = null;
  let task3ThreadId = null;

  await runTest("Project member creates general and task-linked threads with AuditLog", async () => {
    // General thread
    const res1 = await makeRequest(
      baseUrl,
      "POST",
      `/api/projects/${testProject._id}/channel/threads`,
      { Authorization: `Bearer ${aliceToken}` },
      { topic: "Architecture Strategy Sync", initial_message: "Let's align on system protocols." }
    );
    assert.strictEqual(res1.status, 201);
    assert.strictEqual(res1.body.success, true);
    generalThreadId = res1.body.thread.id;

    // Task 1 linked thread (Alice's task)
    const res2 = await makeRequest(
      baseUrl,
      "POST",
      `/api/projects/${testProject._id}/channel/threads`,
      { Authorization: `Bearer ${aliceToken}` },
      { topic: "Auth Token Rotation Discussion", linked_task_id: task1._id.toString() }
    );
    assert.strictEqual(res2.status, 201);
    task1ThreadId = res2.body.thread.id;

    // Task 3 linked thread created by Product Lead
    const res3 = await makeRequest(
      baseUrl,
      "POST",
      `/api/projects/${testProject._id}/channel/threads`,
      { Authorization: `Bearer ${leadToken}` },
      { topic: "Billing Architecture Review", linked_task_id: task3._id.toString() }
    );
    assert.strictEqual(res3.status, 201);
    task3ThreadId = res3.body.thread.id;

    // Check AuditLog
    const audit = await AuditLog.findOne({
      action: "CHANNEL_THREAD_CREATED",
      actorId: "dev_collab_alice",
    }).sort({ created_at: -1 });
    assert.ok(audit);
  });

  // 4. POST /api/projects/:id/channel/threads/:threadId/messages with dependency detection
  await runTest("Posting message detects dependency references ('blocked on' + task title)", async () => {
    const res = await makeRequest(
      baseUrl,
      "POST",
      `/api/projects/${testProject._id}/channel/threads/${generalThreadId}/messages`,
      { Authorization: `Bearer ${bobToken}` },
      { content: "Hey Alice, I am currently blocked on Auth Module Architecture before I can test." }
    );
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.dependencyDetection.referencesTask, true);
    assert.ok(res.body.dependencyDetection.matchedKeywords.includes("blocked on"));
    assert.ok(res.body.dependencyDetection.matchedTaskTitles.includes("Auth Module Architecture"));
  });

  // 5. Visibility tier filtering
  await runTest("Visibility tier filtering: own_data_only user does NOT see task3 thread", async () => {
    // Alice has 'own_data_only'. Task 3 is not assigned to her.
    const resAlice = await makeRequest(
      baseUrl,
      "GET",
      `/api/projects/${testProject._id}/channel`,
      { Authorization: `Bearer ${aliceToken}` }
    );
    assert.strictEqual(resAlice.status, 200);
    const aliceThreadIds = resAlice.body.channel.threads.map((t) => t.id);
    assert.ok(aliceThreadIds.includes(generalThreadId));
    assert.ok(aliceThreadIds.includes(task1ThreadId));
    assert.strictEqual(aliceThreadIds.includes(task3ThreadId), false); // Denied task3

    // Lead user has full visibility: sees task3
    const resLead = await makeRequest(
      baseUrl,
      "GET",
      `/api/projects/${testProject._id}/channel`,
      { Authorization: `Bearer ${leadToken}` }
    );
    const leadThreadIds = resLead.body.channel.threads.map((t) => t.id);
    assert.ok(leadThreadIds.includes(task3ThreadId));
  });

  // 6. Direct messaging lifecycle and participant isolation
  await runTest("1-on-1 Direct Messaging between Alice and Bob", async () => {
    // Alice sends DM to Bob
    const resPost = await makeRequest(
      baseUrl,
      "POST",
      `/api/projects/${testProject._id}/dm/dev_collab_bob/messages`,
      { Authorization: `Bearer ${aliceToken}` },
      { content: "Hey Bob, let's sync on API schemas privately." }
    );
    assert.strictEqual(resPost.status, 201);
    assert.strictEqual(resPost.body.success, true);
    assert.strictEqual(resPost.body.message.content, "Hey Bob, let's sync on API schemas privately.");

    // Bob reads the DM, automatically stamping read_at
    const resGet = await makeRequest(
      baseUrl,
      "GET",
      `/api/projects/${testProject._id}/dm/dev_collab_alice`,
      { Authorization: `Bearer ${bobToken}` }
    );
    assert.strictEqual(resGet.status, 200);
    assert.strictEqual(resGet.body.dm.messages.length, 1);
    assert.ok(resGet.body.dm.messages[0].read_at !== null);

    // Outsider cannot access Alice-Bob DM
    const resOutsider = await makeRequest(
      baseUrl,
      "GET",
      `/api/projects/${testProject._id}/dm/dev_collab_alice`,
      { Authorization: `Bearer ${outsiderToken}` }
    );
    assert.strictEqual(resOutsider.status, 403);
  });

  // 7. Permanent chat archival (no delete routes exist)
  await runTest("No DELETE routes exist for channels or messages (archival guarantee)", async () => {
    const resDelChannel = await makeRequest(
      baseUrl,
      "DELETE",
      `/api/projects/${testProject._id}/channel`,
      { Authorization: `Bearer ${leadToken}` }
    );
    assert.strictEqual(resDelChannel.status, 404);

    const resDelThread = await makeRequest(
      baseUrl,
      "DELETE",
      `/api/projects/${testProject._id}/channel/threads/${generalThreadId}`,
      { Authorization: `Bearer ${leadToken}` }
    );
    assert.strictEqual(resDelThread.status, 404);
  });

  // Cleanup test artifacts
  await Project.findByIdAndDelete(testProject._id);
  await Task.deleteMany({ project_id: testProject._id });
  await TeamChannel.deleteOne({ project_id: testProject._id });
  await DirectMessage.deleteMany({ project_id: testProject._id });
  server.close();

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`PHASE 10 INTEGRATION TESTS SUMMARY: ${passedCount}/${totalCount} PASSED`);
  console.log("═══════════════════════════════════════════════════════");

  if (passedCount === totalCount) {
    console.log("ALL PHASE 10 INTEGRATION TESTS PASSED! ✓\n");
    process.exit(0);
  } else {
    console.error(`FAILED: ${totalCount - passedCount} tests failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
