require("dotenv").config();
const assert = require("assert");
const jwt = require("jsonwebtoken");
const express = require("express");
const connectDB = require("./db");
const { Task } = require("./models/models");
const Submission = require("./models/Submission");
const Appeal = require("./models/Appeal");
const AuditLog = require("./models/AuditLog");
const { JWT_SECRET } = require("./middleware/auth");
const { evaluateSubmission, checkStructuralValidity } = require("./lib/qaEvaluator");

async function runPhase4Tests() {
  console.log("🧪 Running Phase 4 QA Gate, Dual Evaluation & Appeal Unit & API Tests...\n");
  await connectDB();

  // ──────────────────────────────────────────────────────────────────────────
  // PART 1: PURE EVALUATOR UNIT TESTS (WITH MOCKED GEMINI RESPONSES)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("--- PART 1: Evaluator Unit Tests ---");

  // Mock Task
  const mockTask = {
    _id: "65f000000000000000000101",
    title: "Implement Authentication Endpoints",
    description: "Acceptance criteria: Must include /login, /logout, JWT session cookies, and bcrypt hashing.",
  };

  // Test 1: Objective mode: submission with all criteria met → approved
  {
    const sub = new Submission({
      task_id: mockTask._id,
      employee_id: "emp_riya_patel",
      artifact_url: "https://github.com/acube/pm/pull/42",
      artifact_type: "pr_link",
      status: "pending_review",
      evaluation_mode: "objective",
    });

    const mockPassGenerator = async (prompt) => {
      return JSON.stringify({
        passed: true,
        missing_items: [],
        reasoning: "PR contains complete /login and /logout endpoints with bcrypt password hashing and JWT cookies.",
      });
    };

    await evaluateSubmission(sub, mockTask, null, mockPassGenerator);
    assert.strictEqual(sub.status, "approved", "Test 1 Failed: Expected status='approved'");
    assert.strictEqual(sub.ai_verdict.passed, true, "Test 1 Failed: Expected ai_verdict.passed=true");
    assert.strictEqual(sub.ai_verdict.missing_items.length, 0, "Test 1 Failed: Expected empty missing_items");
    console.log("✓ Test 1 Passed: Objective mode with criteria met -> Status 'approved'");
  }

  // Test 2: Objective mode: submission missing criteria → rejected, missing_items populated, rejection_count incremented
  {
    const sub = new Submission({
      task_id: mockTask._id,
      employee_id: "emp_riya_patel",
      artifact_url: "https://github.com/acube/pm/pull/43",
      artifact_type: "pr_link",
      status: "pending_review",
      evaluation_mode: "objective",
      rejection_count: 0,
    });

    const mockFailGenerator = async (prompt) => {
      return JSON.stringify({
        passed: false,
        missing_items: ["Missing bcrypt password hashing", "Missing test coverage for /logout"],
        reasoning: "PR lacks secure password hashing and logout unit tests.",
      });
    };

    await evaluateSubmission(sub, mockTask, null, mockFailGenerator);
    assert.strictEqual(sub.status, "rejected", "Test 2 Failed: Expected status='rejected'");
    assert.strictEqual(sub.ai_verdict.passed, false, "Test 2 Failed: Expected ai_verdict.passed=false");
    assert.strictEqual(sub.ai_verdict.missing_items.length, 2, "Test 2 Failed: Expected 2 missing items");
    assert.strictEqual(sub.rejection_count, 1, "Test 2 Failed: Expected rejection_count=1");
    console.log("✓ Test 2 Passed: Objective mode missing criteria -> Status 'rejected', missing_items recorded, rejection_count=1");
  }

  // Test 3: Subjective mode: submission always lands in pending_review regardless of structural check
  {
    // Valid Figma link
    const subValid = new Submission({
      task_id: mockTask._id,
      employee_id: "emp_sneha_reddy",
      artifact_url: "https://figma.com/file/xyz/dashboard-wireframes",
      artifact_type: "figma_link",
      status: "pending_review",
      evaluation_mode: "subjective",
    });
    await evaluateSubmission(subValid, mockTask);
    assert.strictEqual(subValid.status, "pending_review", "Test 3a Failed: Valid subjective must be pending_review");
    assert.strictEqual(subValid.ai_verdict.passed, true, "Test 3a Failed: Structural check should pass");

    // Invalid link (e.g. random string not figma)
    const subInvalid = new Submission({
      task_id: mockTask._id,
      employee_id: "emp_sneha_reddy",
      artifact_url: "not-a-figma-url",
      artifact_type: "figma_link",
      status: "pending_review",
      evaluation_mode: "subjective",
    });
    await evaluateSubmission(subInvalid, mockTask);
    assert.strictEqual(subInvalid.status, "pending_review", "Test 3b Failed: Invalid subjective must still land in pending_review");
    assert.strictEqual(subInvalid.ai_verdict.passed, false, "Test 3b Failed: Structural check should fail");
    assert.ok(subInvalid.ai_verdict.missing_items.length > 0, "Test 3b Failed: Should list structural issue");
    console.log("✓ Test 3 Passed: Subjective mode always lands in 'pending_review' regardless of structural result");
  }

  // Test 4: Gemini API failure path: lands in pending_review with clear reasoning message, doesn't crash
  {
    const sub = new Submission({
      task_id: mockTask._id,
      employee_id: "emp_riya_patel",
      artifact_url: "https://github.com/acube/pm/pull/99",
      artifact_type: "pr_link",
      status: "pending_review",
      evaluation_mode: "objective",
    });

    const mockThrowingGenerator = async () => {
      throw new Error("Quota exceeded 429 RESOURCE_EXHAUSTED");
    };

    await evaluateSubmission(sub, mockTask, null, mockThrowingGenerator);
    assert.strictEqual(sub.status, "pending_review", "Test 4 Failed: Expected fallback to pending_review");
    assert.ok(
      sub.ai_verdict.reasoning.includes("AI evaluation unavailable") ||
      sub.ai_verdict.reasoning.includes("manual review required"),
      "Test 4 Failed: Reasoning must specify manual review required"
    );
    console.log("✓ Test 4 Passed: Gemini API failure path safely lands in 'pending_review' with manual review notice");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PART 2: API ROUTE & RBAC INTEGRATION TESTS
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 2: API Route & RBAC Tests ---");

  const app = express();
  app.use(express.json());
  const submissionsRoutes = require("./routes/submissions");
  const appealsRoutes = require("./routes/appeals");
  app.use("/api/submissions", submissionsRoutes);
  app.use("/api/appeals", appealsRoutes);

  const server = app.listen(5102);
  const baseUrl = "http://localhost:5102";

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
    // Test 5: Subjective mode human-review endpoint correctly flips status and sets reviewed_by
    const subSubjective = await Submission.create({
      task_id: mockTask._id,
      employee_id: "emp_sneha_reddy",
      artifact_url: "https://figma.com/file/123/mobile-mockup",
      artifact_type: "figma_link",
      status: "pending_review",
      evaluation_mode: "subjective",
    });

    const reviewRes = await fetch(`${baseUrl}/api/submissions/${subSubjective._id}/human-review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leadToken}`,
      },
      body: JSON.stringify({
        decision: "approved",
        notes: "Design looks clean, accessible, and matches brand guidelines.",
      }),
    });
    const reviewData = await reviewRes.json();
    assert.strictEqual(reviewRes.status, 200, "Test 5 Failed: Expected 200");
    assert.strictEqual(reviewData.submission.status, "approved", "Test 5 Failed: Expected status='approved'");
    assert.strictEqual(reviewData.submission.reviewed_by, "lead_sarah_connor", "Test 5 Failed: Expected reviewed_by to match lead");

    // Check AuditLog recorded SUBMISSION_HUMAN_REVIEW
    const auditReview = await AuditLog.findOne({ action: "SUBMISSION_HUMAN_REVIEW" }).sort({ timestamp: -1 });
    assert.ok(auditReview, "Test 5 Failed: AuditLog record missing");
    console.log(`✓ Test 5 Passed: Human review endpoint flipped status to 'approved' and logged to AuditLog`);

    // Test 6a: Attempting to appeal someone else's submission returns 403
    const forbiddenAppealRes = await fetch(`${baseUrl}/api/appeals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`, // riya trying to appeal sneha's submission
      },
      body: JSON.stringify({
        submission_id: subSubjective._id,
        justification: "I want to contest this",
      }),
    });
    assert.strictEqual(forbiddenAppealRes.status, 403, "Test 6a Failed: Expected 403 for non-owner appeal");
    console.log("✓ Test 6a Passed: Non-owner cannot appeal someone else's submission (HTTP 403)");

    // Test 6b: Appeal creation blocked if submission is not in 'rejected' status (HTTP 400)
    const snehaToken = jwt.sign(
      { uid: "emp_sneha_reddy", email: "sneha@acube.ai", user_type: "employee" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const blockedAppealRes = await fetch(`${baseUrl}/api/appeals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${snehaToken}`, // sneha owns subSubjective, but it is 'approved'
      },
      body: JSON.stringify({
        submission_id: subSubjective._id,
        justification: "I want to contest this",
      }),
    });
    assert.strictEqual(blockedAppealRes.status, 400, "Test 6b Failed: Expected 400 for non-rejected submission appeal");
    console.log("✓ Test 6b Passed: Appeal creation properly blocked when submission is not in 'rejected' status (HTTP 400)");

    // Test 7: Appeal creation and Override correctly flips linked submission to "approved" + AuditLog
    // Create a rejected submission for emp_riya_patel
    const rejectedSub = await Submission.create({
      task_id: mockTask._id,
      employee_id: "emp_riya_patel",
      artifact_url: "https://github.com/acube/pm/pull/88",
      artifact_type: "pr_link",
      status: "rejected",
      evaluation_mode: "objective",
      ai_verdict: {
        passed: false,
        missing_items: ["Unit tests for auth edge cases"],
        reasoning: "Test coverage missing.",
      },
      rejection_count: 1,
    });

    // Employee files appeal
    const appealRes = await fetch(`${baseUrl}/api/appeals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
      body: JSON.stringify({
        submission_id: rejectedSub._id,
        justification: "Tests were written in a companion e2e repository linked in PR description line 4.",
      }),
    });
    const appealData = await appealRes.json();
    assert.strictEqual(appealRes.status, 201, "Test 7 Failed: Expected 201 on appeal creation");
    assert.strictEqual(appealData.appeal.status, "pending", "Test 7 Failed: Expected status='pending'");

    // Lead resolves appeal with "overridden"
    const resolveRes = await fetch(`${baseUrl}/api/appeals/${appealData.appeal._id}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leadToken}`,
      },
      body: JSON.stringify({
        decision: "overridden",
        notes: "Verified companion repository tests. Requirements are satisfied.",
      }),
    });
    const resolveData = await resolveRes.json();
    assert.strictEqual(resolveRes.status, 200, "Test 7 Failed: Expected 200 on appeal resolution");
    assert.strictEqual(resolveData.appeal.status, "overridden", "Test 7 Failed: Appeal status should be 'overridden'");
    assert.strictEqual(resolveData.submission.status, "approved", "Test 7 Failed: Linked submission must flip to 'approved'");

    // Verify AuditLog recorded APPEAL_RESOLVED
    const auditAppeal = await AuditLog.findOne({ action: "APPEAL_RESOLVED" }).sort({ timestamp: -1 });
    assert.ok(auditAppeal, "Test 7 Failed: AuditLog for APPEAL_RESOLVED missing");
    assert.strictEqual(auditAppeal.actorId, "lead_sarah_connor");
    console.log("✓ Test 7 Passed: Appeal override flipped linked submission to 'approved' and logged to AuditLog");

    // Clean up test documents
    await Submission.deleteMany({ task_id: mockTask._id });
    await Appeal.deleteMany({ employee_id: { $in: ["emp_riya_patel", "emp_sneha_reddy"] } });

    console.log("\n🎉 ALL 7 PHASE 4 QA GATE & APPEAL TESTS PASSED SUCCESSFULLY!");
  } finally {
    const mongoose = require("mongoose");
    await new Promise((resolve) => {
      server.close(() => {
        mongoose.disconnect().then(resolve);
      });
    });
  }
}

runPhase4Tests().catch((err) => {
  console.error("❌ Phase 4 Test failed:", err);
  process.exit(1);
});
