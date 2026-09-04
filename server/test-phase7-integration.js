/**
 * Phase 7 Integration Test Suite
 * Tests live MongoDB Sub-Task decomposition, progress calculation, priority recalculation,
 * cascade deletion, and midday P0 nudge dispatch.
 * Note: Requires local MongoDB to be running.
 */

require("dotenv").config();
const assert = require("assert");
const http = require("http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const connectDB = require("./db");
const { Project, Task, DailyLog } = require("./models/models");
const AuditLog = require("./models/AuditLog");
const Notification = require("./models/Notification");
const { app } = require("./index");
const { runMiddayPriorityNudge } = require("./jobs/priorityNudge");

const JWT_SECRET = process.env.JWT_SECRET || "autonomous_pm_super_secret_jwt_key_2026";

async function runPhase7IntegrationTests() {
  console.log("🧪 Running Phase 7 Sub-Task & Priority Integration Tests (DB & API)...");

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

  const empToken = jwt.sign(
    { uid: "emp_maya_lin", email: "maya@acube.ai", user_type: "employee" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  try {
    // ─── Setup Test Project & Top-Level Tasks ────────────────────────────────
    const testProject = await Project.create({
      title: "Phase 7 Subtask & Priority Initiative",
      created_by: "lead_alex_turner",
      status: "active",
      priority: "P1",
      member_ids: ["emp_maya_lin"],
      team_allocations: [{ user_id: "emp_maya_lin", daily_hours: 8 }],
      end_date: "2026-09-30",
    });

    const parentTask = await Task.create({
      project_id: testProject._id,
      title: "Task Alpha: Architecture Refactor",
      start_date: "2026-09-07",
      end_date: "2026-09-12",
      assignee_ids: ["emp_maya_lin"],
      status: "active",
      estimate_hours: 16,
    });

    // ─── Test 1: POST /api/tasks/:id/subtasks ────────────────────────────────
    console.log("--- Test 1: Sub-Task Decomposition Endpoint ---");
    const subtaskRes = await fetch(`${baseUrl}/api/tasks/${parentTask._id}/subtasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
      body: JSON.stringify({
        title: "Sub-Task 1: Split Interfaces",
        description: "Extract clean interfaces from monolithic models",
        estimate_hours: 4,
        acceptance_criteria_override: "All interfaces exported cleanly without circular imports",
      }),
    });

    const subtaskData = await subtaskRes.json();
    assert.strictEqual(subtaskRes.status, 201, "Test 1a Failed: Expected 201 on subtask creation");
    assert.strictEqual(subtaskData.subtask.is_subtask, true);
    assert.strictEqual(subtaskData.subtask.parent_task_id.toString(), parentTask._id.toString());
    assert.strictEqual(subtaskData.subtask.acceptance_criteria_override, "All interfaces exported cleanly without circular imports");
    console.log(`✓ Test 1a Passed: Created sub-task "${subtaskData.subtask.title}" with parent_task_id.`);

    // Create a second subtask
    const subtask2Res = await fetch(`${baseUrl}/api/tasks/${parentTask._id}/subtasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
      body: JSON.stringify({
        title: "Sub-Task 2: Write Unit Tests",
        estimate_hours: 4,
      }),
    });
    const subtask2Data = await subtask2Res.json();
    assert.strictEqual(subtask2Res.status, 201);
    console.log(`✓ Test 1b Passed: Created second sub-task "${subtask2Data.subtask.title}".`);

    // Verify AuditLog record
    const auditRecord = await AuditLog.findOne({
      action: "SUBTASK_CREATED",
      entityId: subtaskData.subtask._id.toString(),
    });
    assert.ok(auditRecord, "Test 1c Failed: AuditLog for SUBTASK_CREATED missing");
    console.log("✓ Test 1c Passed: AuditLog recorded SUBTASK_CREATED successfully.");

    // ─── Test 2: GET /api/tasks/:id/subtasks ─────────────────────────────────
    console.log("\n--- Test 2: Sub-Tasks List Endpoint ---");
    const listRes = await fetch(`${baseUrl}/api/tasks/${parentTask._id}/subtasks`, {
      headers: { Authorization: `Bearer ${empToken}` },
    });
    const listData = await listRes.json();
    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listData.subtasks.length, 2, "Test 2 Failed: Expected 2 subtasks");
    console.log(`✓ Test 2 Passed: Retrieved ${listData.subtasks.length} subtasks.`);

    // ─── Test 3: GET /api/tasks/:id/progress ─────────────────────────────────
    console.log("\n--- Test 3: Sub-Task Progress Calculation Endpoint ---");
    // Initially 0 of 2 complete -> 0%
    const prog1Res = await fetch(`${baseUrl}/api/tasks/${parentTask._id}/progress`, {
      headers: { Authorization: `Bearer ${empToken}` },
    });
    const prog1Data = await prog1Res.json();
    assert.strictEqual(prog1Data.totalSubtasks, 2);
    assert.strictEqual(prog1Data.completedSubtasks, 0);
    assert.strictEqual(prog1Data.progressPct, 0);
    console.log(`✓ Test 3a Passed: Progress with 0/2 completed = 0%.`);

    // Complete subtask 1
    await Task.findByIdAndUpdate(subtaskData.subtask._id, { status: "completed" });
    const prog2Res = await fetch(`${baseUrl}/api/tasks/${parentTask._id}/progress`, {
      headers: { Authorization: `Bearer ${empToken}` },
    });
    const prog2Data = await prog2Res.json();
    assert.strictEqual(prog2Data.completedSubtasks, 1);
    assert.strictEqual(prog2Data.progressPct, 50);
    console.log(`✓ Test 3b Passed: Progress with 1/2 completed = 50%.`);

    // Complete subtask 2
    await Task.findByIdAndUpdate(subtask2Data.subtask._id, { status: "completed" });
    const prog3Res = await fetch(`${baseUrl}/api/tasks/${parentTask._id}/progress`, {
      headers: { Authorization: `Bearer ${empToken}` },
    });
    const prog3Data = await prog3Res.json();
    assert.strictEqual(prog3Data.completedSubtasks, 2);
    assert.strictEqual(prog3Data.progressPct, 100);
    console.log(`✓ Test 3c Passed: Progress with 2/2 completed = 100%.`);

    // Fallback: task with 0 subtasks
    const standaloneTask = await Task.create({
      project_id: testProject._id,
      title: "Standalone Task",
      start_date: "2026-09-07",
      end_date: "2026-09-08",
      assignee_ids: ["emp_maya_lin"],
      status: "completed",
    });
    const progFallbackRes = await fetch(`${baseUrl}/api/tasks/${standaloneTask._id}/progress`, {
      headers: { Authorization: `Bearer ${empToken}` },
    });
    const progFallbackData = await progFallbackRes.json();
    assert.strictEqual(progFallbackData.totalSubtasks, 0);
    assert.strictEqual(progFallbackData.progressPct, 100);
    console.log(`✓ Test 3d Passed: Fallback for task without subtasks correctly returns 100% when completed.`);

    // ─── Test 4: Priority Recalculation (POST /recalculate-priorities) ─────────
    console.log("\n--- Test 4: Priority Recalculation Endpoint ---");
    // Setup DAG where Task A blocks Task B and Task C (2 downstream active blockers -> P0)
    const blockeeB = await Task.create({
      project_id: testProject._id,
      title: "Consumer B",
      start_date: "2026-09-15",
      end_date: "2026-09-20",
      assignee_ids: ["emp_maya_lin"],
      depends_on: [parentTask._id],
      status: "active",
      estimate_hours: 8,
    });
    const blockeeC = await Task.create({
      project_id: testProject._id,
      title: "Consumer C",
      start_date: "2026-09-15",
      end_date: "2026-09-20",
      assignee_ids: ["emp_maya_lin"],
      depends_on: [parentTask._id],
      status: "active",
      estimate_hours: 8,
    });

    const recalcRes = await fetch(`${baseUrl}/api/tasks/project/${testProject._id}/recalculate-priorities`, {
      method: "POST",
      headers: { Authorization: `Bearer ${leadToken}` },
    });
    const recalcData = await recalcRes.json();
    assert.strictEqual(recalcRes.status, 200);

    const updatedParent = await Task.findById(parentTask._id);
    assert.strictEqual(updatedParent.computed_priority, "P0", "Test 4 Failed: Task blocking 2+ tasks must be P0");
    console.log(`✓ Test 4 Passed: Priority recalculated successfully. Parent task computed_priority is "${updatedParent.computed_priority}".`);

    // ─── Test 5: Mid-day P0 Nudge Engine ──────────────────────────────────────
    console.log("\n--- Test 5: Mid-Day P0 Nudge Engine ---");
    // Ensure parentTask is P0 and incomplete, and emp_maya_lin has NOT logged today
    await Task.findByIdAndUpdate(parentTask._id, { status: "active", computed_priority: "P0" });

    const testDay = "2026-09-10";
    const nudgeResult1 = await runMiddayPriorityNudge(testDay);
    assert.ok(nudgeResult1.nudgesSent >= 1, "Test 5a Failed: Expected at least 1 nudge sent");
    console.log(`✓ Test 5a Passed: Midday nudge dispatched (${nudgeResult1.nudgesSent} sent).`);

    // Check Notification in DB
    const notif = await Notification.findOne({
      recipient_id: "emp_maya_lin",
      type: "midday_p0_nudge",
      entity_id: parentTask._id,
    });
    assert.ok(notif, "Test 5b Failed: Notification not found in DB");
    assert.ok(notif.title.includes("URGENT: Mission-Critical Task"));
    console.log(`✓ Test 5b Passed: Found Notification "${notif.title}".`);

    // Run again on the same day -> idempotent, should be skipped
    const nudgeResult2 = await runMiddayPriorityNudge(testDay);
    assert.strictEqual(nudgeResult2.nudgesSent, 0, "Test 5c Failed: Idempotency failed, nudge resent");
    assert.ok(nudgeResult2.skippedAlreadyNudged >= 1);
    console.log("✓ Test 5c Passed: Idempotent execution skipped already-nudged task.");

    // ─── Test 6: Cascade Deletion in DELETE /api/tasks/:id ────────────────────
    console.log("\n--- Test 6: Cascade Deletion of Sub-Tasks ---");
    // First remove dependencies on parentTask so dependency guard passes
    await Task.findByIdAndUpdate(blockeeB._id, { depends_on: [] });
    await Task.findByIdAndUpdate(blockeeC._id, { depends_on: [] });

    // Verify subtasks exist
    const subCountBefore = await Task.countDocuments({ parent_task_id: parentTask._id });
    assert.strictEqual(subCountBefore, 2);

    const deleteRes = await fetch(`${baseUrl}/api/tasks/${parentTask._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${leadToken}` },
    });
    const deleteData = await deleteRes.json();
    assert.strictEqual(deleteRes.status, 200, "Test 6 Failed: Expected 200 on task deletion");

    // Verify subtasks are cascade deleted
    const subCountAfter = await Task.countDocuments({ parent_task_id: parentTask._id });
    assert.strictEqual(subCountAfter, 0, "Test 6 Failed: Subtasks should be deleted");

    // Verify AuditLog for SUBTASKS_CASCADE_DELETED
    const cascadeAudit = await AuditLog.findOne({
      action: "SUBTASKS_CASCADE_DELETED",
      entityId: parentTask._id.toString(),
    });
    assert.ok(cascadeAudit, "Test 6 Failed: AuditLog for SUBTASKS_CASCADE_DELETED missing");
    console.log(`✓ Test 6 Passed: Parent task deleted, 2 subtasks cascade-deleted, and SUBTASKS_CASCADE_DELETED logged.`);

    // ─── Cleanup ─────────────────────────────────────────────────────────────
    await Notification.deleteMany({ entity_id: parentTask._id });
    await Task.deleteMany({ project_id: testProject._id });
    await Project.deleteMany({ _id: testProject._id });

    console.log("\n🎉 ALL PHASE 7 INTEGRATION TESTS PASSED SUCCESSFULLY!");
  } finally {
    mongoose.connection.removeAllListeners();
    await new Promise((resolve) => {
      server.close(() => {
        mongoose.disconnect().then(resolve);
      });
    });
  }
}

runPhase7IntegrationTests().catch((err) => {
  console.error("❌ Phase 7 Integration Test failed:", err);
  process.exit(1);
});
