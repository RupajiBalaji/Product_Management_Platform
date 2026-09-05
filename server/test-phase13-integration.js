/**
 * Phase 13 — Database Integration Tests (MongoDB, Growth Trajectory & Trend Alerts)
 *
 * Verifies:
 * 1. Access Control: Contributor cannot access another contributor's trajectory (403)
 * 2. Access Control: Contributor can access own trajectory (200)
 * 3. Access Control: Product Lead can access any employee's trajectory (200)
 * 4. POST /api/growth/snapshot/trigger: Runs weekly performance snapshot aggregation
 * 5. PerformanceSnapshot data integrity: On-time reliability, first-pass quality, estimation accuracy
 * 6. Unique compound index: Upserting same { user_id, week_ending } updates without duplicate key error
 * 7. GET /api/growth/:userId: Calculates 12-week linear regression trend correctly
 * 8. GET /api/growth/:userId/chart-data: Returns lightweight chronological chart series
 * 9. GET /api/growth/alerts/pending: Product Lead can fetch pending trend alert notifications
 * 10. POST /api/growth/alerts/:id/acknowledge: Marks trend alert acknowledged & read with AuditLog
 */

const assert = require("assert");
const http = require("http");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
const { app } = require("./index");
const { Project, Task } = require("./models/models");
const User = require("./models/User");
const PerformanceSnapshot = require("./models/PerformanceSnapshot");
const Notification = require("./models/Notification");
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
      path: url.pathname + (url.search || ""),
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
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("PHASE 13 INTEGRATION TESTS (DB, GROWTH & TREND ALERTS)");
  console.log("═══════════════════════════════════════════════════════\n");

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve) => mongoose.connection.once("connected", resolve));
  }

  const testSuffix = Date.now().toString(16);
  const leadUid = `lead_p13_${testSuffix}`;
  const emp1Uid = `emp1_p13_${testSuffix}`;
  const emp2Uid = `emp2_p13_${testSuffix}`;

  const leadEmail = `lead13_${testSuffix}@acube.ai`;
  const emp1Email = `emp1_13_${testSuffix}@acube.ai`;
  const emp2Email = `emp2_13_${testSuffix}@acube.ai`;

  const leadToken = jwt.sign({ uid: leadUid, email: leadEmail }, JWT_SECRET);
  const emp1Token = jwt.sign({ uid: emp1Uid, email: emp1Email }, JWT_SECRET);
  const emp2Token = jwt.sign({ uid: emp2Uid, email: emp2Email }, JWT_SECRET);

  const leadHeaders = { Cookie: `acube_session=${leadToken}` };
  const emp1Headers = { Cookie: `acube_session=${emp1Token}` };
  const emp2Headers = { Cookie: `acube_session=${emp2Token}` };

  let testProject = null;
  let testTask = null;
  let testAlertNotif = null;

  try {
    // Clean up any stale test users
    await User.deleteMany({ email: { $regex: /_p13_|13@acube\.ai/ } });

    // Seed test users
    await User.create([
      {
        _id: leadUid,
        email: leadEmail,
        full_name: "Executive Lead",
        role_title: "Product Lead",
        user_type: "product_lead",
        status: "active",
      },
      {
        _id: emp1Uid,
        email: emp1Email,
        full_name: "Alex Rivera",
        role_title: "Senior Backend Engineer",
        user_type: "employee",
        status: "active",
      },
      {
        _id: emp2Uid,
        email: emp2Email,
        full_name: "Jordan Lee",
        role_title: "Frontend Developer",
        user_type: "employee",
        status: "active",
      },
    ]);

    testProject = await Project.create({
      title: `Trajectory Initiative ${testSuffix}`,
      description: "Evaluating employee long-term growth trends",
      status: "active",
      created_by: leadUid,
    });

    testTask = await Task.create({
      project_id: testProject._id,
      title: "Core Service Migration",
      status: "completed",
      assignee_ids: [emp1Uid],
      estimate_hours: 20,
      actual_hours: 20,
      start_date: "2026-08-01",
      end_date: "2026-08-15",
    });

    // ─── Test 1: Contributor denied accessing another contributor's trajectory ──
    await runTest("Contributor denied access to peer's trajectory with 403", async () => {
      const res = await makeRequest(baseUrl, "GET", `/api/growth/${emp1Uid}`, emp2Headers);
      assert.strictEqual(res.status, 403, `Expected 403 but got ${res.status}`);
      assert.strictEqual(res.body.success, false);
    });

    // ─── Test 2: Contributor allowed accessing own trajectory ────────────────────
    await runTest("Contributor granted access to own trajectory with 200", async () => {
      const res = await makeRequest(baseUrl, "GET", `/api/growth/${emp1Uid}`, emp1Headers);
      assert.strictEqual(res.status, 200, `Expected 200 but got ${res.status}`);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.user_id, emp1Uid);
    });

    // ─── Test 3: Product Lead allowed accessing any employee's trajectory ───────
    await runTest("Product Lead granted access to any employee's trajectory with 200", async () => {
      const res = await makeRequest(baseUrl, "GET", `/api/growth/${emp1Uid}`, leadHeaders);
      assert.strictEqual(res.status, 200, `Expected 200 but got ${res.status}`);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.user_id, emp1Uid);
    });

    // ─── Test 4: Trigger performance snapshot calculation ───────────────────────
    await runTest("Product Lead triggers weekly performance snapshot aggregation", async () => {
      const sunday = new Date("2026-08-30T23:59:59.999Z");
      const res = await makeRequest(baseUrl, "POST", "/api/growth/snapshot/trigger", leadHeaders, {
        week_ending: sunday,
      });
      assert.strictEqual(res.status, 200, `Expected 200 but got ${res.status}`);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.result.processedEmployees >= 3);
    });

    // ─── Test 5: Verify PerformanceSnapshot data in database ────────────────────
    await runTest("PerformanceSnapshot record exists with expected metrics", async () => {
      const sunday = new Date("2026-08-30T23:59:59.999Z");
      const snapshot = await PerformanceSnapshot.findOne({
        user_id: emp1Uid,
        week_ending: sunday,
      });
      assert.ok(snapshot, "Snapshot record for emp1 must exist");
      assert.strictEqual(typeof snapshot.on_time_reliability_pct, "number");
      assert.strictEqual(typeof snapshot.first_pass_quality_pct, "number");
      assert.strictEqual(typeof snapshot.estimation_accuracy_pct, "number");
    });

    // ─── Test 6: Upserting same week_ending updates without duplicate key error ──
    await runTest("Upserting snapshot for same { user_id, week_ending } updates cleanly", async () => {
      const sunday = new Date("2026-08-30T23:59:59.999Z");
      const updatedSnapshot = await PerformanceSnapshot.findOneAndUpdate(
        { user_id: emp1Uid, week_ending: sunday },
        { $set: { on_time_reliability_pct: 95 } },
        { upsert: true, new: true }
      );
      assert.strictEqual(updatedSnapshot.on_time_reliability_pct, 95);

      const count = await PerformanceSnapshot.countDocuments({
        user_id: emp1Uid,
        week_ending: sunday,
      });
      assert.strictEqual(count, 1, "Must not create duplicate snapshot for same week");
    });

    // ─── Test 7: Trajectory calculation detects linear regression trend ─────────
    await runTest("GET /api/growth/:userId detects trend across historical series", async () => {
      // Seed 11 prior weeks showing consistent upward growth from 65% to 92%
      const baseDate = new Date("2026-06-07T23:59:59.999Z");
      const historyScores = [65, 68, 70, 73, 75, 78, 81, 84, 86, 89, 92];

      for (let i = 0; i < historyScores.length; i++) {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i * 7);
        await PerformanceSnapshot.findOneAndUpdate(
          { user_id: emp1Uid, week_ending: d },
          {
            $set: {
              on_time_reliability_pct: historyScores[i],
              first_pass_quality_pct: historyScores[i],
              estimation_accuracy_pct: historyScores[i],
              tasks_completed: 2,
            },
          },
          { upsert: true }
        );
      }

      const res = await makeRequest(baseUrl, "GET", `/api/growth/${emp1Uid}`, leadHeaders);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.trends.on_time_reliability.trend, "improving");
      assert.ok(res.body.trends.on_time_reliability.slopePerWeek > 0.5);
      assert.strictEqual(res.body.trends.on_time_reliability.startValue, 65);
    });

    // ─── Test 8: Chart-data endpoint returns chronological array ────────────────
    await runTest("GET /api/growth/:userId/chart-data returns formatted chart series", async () => {
      const res = await makeRequest(baseUrl, "GET", `/api/growth/${emp1Uid}/chart-data`, leadHeaders);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.chart_data));
      assert.ok(res.body.chart_data.length >= 12);
      assert.ok(res.body.chart_data[0].week_ending);
      assert.strictEqual(typeof res.body.chart_data[0].on_time_reliability_pct, "number");
    });

    // ─── Test 9: Fetch pending trend alert notifications ────────────────────────
    await runTest("Product Lead fetches pending trend alert notifications", async () => {
      // Create a test trend alert notification
      testAlertNotif = await Notification.create({
        recipient_id: leadUid,
        title: "Growth Alert: Alex Rivera",
        message:
          "Alex Rivera's on-time delivery has improved from 65% to 92% over the last 3 months — consistent upward trajectory.",
        type: "trend_alert",
        read: false,
        acknowledged: false,
      });

      const res = await makeRequest(baseUrl, "GET", "/api/growth/alerts/pending", leadHeaders);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.alerts));
      const found = res.body.alerts.find((a) => String(a._id) === String(testAlertNotif._id));
      assert.ok(found, "Created trend alert must appear in pending alerts list");
    });

    // ─── Test 10: Acknowledge trend alert and verify AuditLog ───────────────────
    await runTest("Product Lead acknowledges trend alert and creates AuditLog", async () => {
      const res = await makeRequest(
        baseUrl,
        "POST",
        `/api/growth/alerts/${testAlertNotif._id}/acknowledge`,
        leadHeaders
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.notification.acknowledged, true);
      assert.strictEqual(res.body.notification.read, true);

      // Verify audit log
      const audit = await AuditLog.findOne({
        action: "GROWTH_ALERT_ACKNOWLEDGED",
        entityId: String(testAlertNotif._id),
      });
      assert.ok(audit, "AuditLog for GROWTH_ALERT_ACKNOWLEDGED must be recorded");

      // Verify alert is no longer pending
      const pendingRes = await makeRequest(baseUrl, "GET", "/api/growth/alerts/pending", leadHeaders);
      const stillPending = pendingRes.body.alerts.find(
        (a) => String(a._id) === String(testAlertNotif._id)
      );
      assert.strictEqual(stillPending, undefined, "Acknowledged alert must not appear in pending");
    });

    console.log("\n═══════════════════════════════════════════════════════");
    console.log(`PHASE 13 INTEGRATION TESTS SUMMARY: ${passedCount}/${totalCount} PASSED`);
    console.log("═══════════════════════════════════════════════════════");
    console.log("ALL PHASE 13 INTEGRATION TESTS PASSED! ✓\n");
  } finally {
    // Cleanup test artifacts
    await Promise.all([
      User.deleteMany({ _id: { $in: [leadUid, emp1Uid, emp2Uid] } }),
      testProject ? Project.deleteOne({ _id: testProject._id }) : Promise.resolve(),
      testTask ? Task.deleteOne({ _id: testTask._id }) : Promise.resolve(),
      PerformanceSnapshot.deleteMany({ user_id: { $in: [leadUid, emp1Uid, emp2Uid] } }),
      Notification.deleteMany({ recipient_id: { $in: [leadUid, emp1Uid, emp2Uid] } }),
    ]);

    server.close();
    setTimeout(() => process.exit(0), 200);
  }
}

main().catch((err) => {
  console.error("FATAL Integration Test Error:", err);
  process.exit(1);
});
