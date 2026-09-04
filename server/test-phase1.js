require("dotenv").config();
const jwt = require("jsonwebtoken");
const connectDB = require("./db");
const User = require("./models/User");
const DynamicRole = require("./models/DynamicRole");
const AuditLog = require("./models/AuditLog");
const { Project } = require("./models/models");
const { JWT_SECRET } = require("./middleware/auth");

async function runTests() {
  console.log("🧪 Starting Phase 1 Integration Tests...");
  await connectDB();

  // Create JWTs for testing
  const productLeadToken = jwt.sign(
    { uid: "lead_sarah_connor", email: "lead@acube.ai", user_type: "product_lead" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const employeeToken = jwt.sign(
    { uid: "emp_riya_patel", email: "riya.patel@acube.ai", user_type: "employee" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const baseUrl = "http://localhost:5000";

  // Test 1: Verify Seeded Roles exist in DB
  const seededRoles = await DynamicRole.find();
  console.log(`✓ Seeded roles count in DB: ${seededRoles.length}`);
  if (seededRoles.length < 5) {
    throw new Error(`Expected at least 5 seeded roles, found ${seededRoles.length}`);
  }

  // Test 2: Verify Seeded Users have 3-tier roles
  const leadUser = await User.findById("lead_sarah_connor");
  const archUser = await User.findById("arch_alex_vance");
  const empUser = await User.findById("emp_riya_patel");
  console.log(`✓ User roles verified: lead=${leadUser?.user_type}, arch=${archUser?.user_type}, emp=${empUser?.user_type}`);

  if (leadUser?.user_type !== "product_lead" || archUser?.user_type !== "lead_architect" || empUser?.user_type !== "employee") {
    throw new Error("User roles do not match expected 3-tier governance!");
  }

  // Test 3: Verify Projects have team_allocations with DynamicRoles
  const project = await Project.findOne({ "team_allocations.0": { $exists: true } });
  console.log(`✓ Project team_allocations verified: found project "${project?.title}" with ${project?.team_allocations?.length} allocated members`);
  if (!project || !project.team_allocations?.length) {
    throw new Error("Expected project with team_allocations not found!");
  }

  // Test 4: AuditLog append-only integrity check
  const initialAuditCount = await AuditLog.countDocuments();
  console.log(`✓ Initial AuditLog count: ${initialAuditCount}`);

  // Test writing to AuditLog
  await AuditLog.record({
    actorId: "lead_sarah_connor",
    action: "PHASE1_TEST_EVENT",
    entityType: "DynamicRole",
    entityId: "test_role_id_123",
    before: null,
    after: { title: "Test Role" },
  });

  const newAuditCount = await AuditLog.countDocuments();
  if (newAuditCount !== initialAuditCount + 1) {
    throw new Error("AuditLog record creation failed!");
  }

  // Test append-only guarantee: try to update AuditLog document
  try {
    const logDoc = await AuditLog.findOne({ action: "PHASE1_TEST_EVENT" });
    await AuditLog.updateOne({ _id: logDoc._id }, { action: "TAMPERED" });
    throw new Error("AuditLog update should have been blocked!");
  } catch (err) {
    if (err.message.includes("AuditLog is append-only")) {
      console.log("✓ AuditLog append-only integrity successfully protected (mutation rejected).");
    } else {
      throw err;
    }
  }

  console.log("🎉 All Phase 1 model, seeding, and governance tests PASSED successfully!");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
