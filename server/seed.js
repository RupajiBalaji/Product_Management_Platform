require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./db");
const User = require("./models/User");
const DynamicRole = require("./models/DynamicRole");
const AuditLog = require("./models/AuditLog");
const { Project, Task, DailyLog } = require("./models/models");

const SEED_ROLES = [
  {
    title: "Lead Solutions Architect",
    domain: "Architecture",
    description: "Designs system architecture, evaluates tech stack decisions, and unblocks high-level technical dependencies.",
    skillTags: ["System Design", "Cloud Infrastructure", "API Architecture", "Microservices"],
    defaultDailyCapHours: 6,
  },
  {
    title: "Senior Backend Engineer",
    domain: "Engineering",
    description: "Develops scalable microservices, database schemas, message queues, and high-performance server APIs.",
    skillTags: ["Node.js", "MongoDB", "Express", "Distributed Systems"],
    defaultDailyCapHours: 8,
  },
  {
    title: "UI/UX Design Specialist",
    domain: "Design",
    description: "Creates design systems, wireframes, user experience flows, and conducts usability testing.",
    skillTags: ["Figma", "Design Systems", "User Research", "Wireframing"],
    defaultDailyCapHours: 7,
  },
  {
    title: "Growth Copywriter",
    domain: "Marketing",
    description: "Crafts high-converting product messaging, user onboarding copy, documentation, and go-to-market content.",
    skillTags: ["Product Messaging", "Content Strategy", "SEO", "User Onboarding"],
    defaultDailyCapHours: 6,
  },
  {
    title: "QA & Test Automation Lead",
    domain: "QA",
    description: "Oversees test automation frameworks, regression test suites, CI/CD quality gates, and Definition of Done standards.",
    skillTags: ["E2E Testing", "Jest", "Playwright", "CI/CD Gates"],
    defaultDailyCapHours: 8,
  },
];

const SAMPLE_USERS = [
  {
    _id: "lead_sarah_connor",
    email: "lead@acube.ai",
    full_name: "Sarah Connor (Product Lead)",
    role_title: "Product Lead",
    user_type: "product_lead",
    defaultDailyCapHours: 8,
    status: "active",
  },
  {
    _id: "arch_alex_vance",
    email: "architect@acube.ai",
    full_name: "Alex Vance (Lead Architect)",
    role_title: "Lead Solutions Architect",
    user_type: "lead_architect",
    defaultDailyCapHours: 6,
    status: "active",
  },
  {
    _id: "emp_riya_patel",
    email: "riya.patel@acube.ai",
    full_name: "Riya Patel",
    role_title: "Senior Frontend Engineer",
    user_type: "employee",
    defaultDailyCapHours: 8,
    status: "active",
  },
  {
    _id: "emp_karan_mehta",
    email: "karan.mehta@acube.ai",
    full_name: "Karan Mehta",
    role_title: "Senior Backend Engineer",
    user_type: "employee",
    defaultDailyCapHours: 8,
    status: "active",
  },
  {
    _id: "emp_sneha_reddy",
    email: "sneha.reddy@acube.ai",
    full_name: "Sneha Reddy",
    role_title: "UI/UX Design Specialist",
    user_type: "employee",
    defaultDailyCapHours: 7,
    status: "active",
  },
  {
    _id: "emp_dev_nair",
    email: "dev.nair@acube.ai",
    full_name: "Dev Nair",
    role_title: "Growth Copywriter",
    user_type: "employee",
    defaultDailyCapHours: 6,
    status: "active",
  },
  {
    _id: "emp_priya_singh",
    email: "priya.singh@acube.ai",
    full_name: "Priya Singh",
    role_title: "QA & Test Automation Lead",
    user_type: "employee",
    defaultDailyCapHours: 8,
    status: "active",
  },
];

const WORK_LOGS = [
  "Completed responsive dashboard layouts and dark mode contrast adjustments.",
  "Engineered Redis caching layer for heavy aggregate queries; reduced latency by 55%.",
  "Designed interactive heatmap UI wireframes in Figma and reviewed with team.",
  "Configured GitHub Actions multi-stage Docker build pipeline for staging & prod.",
  "Authored end-to-end Cypress test suite for subscription checkout flows.",
  "Integrated Gemini 3.5 Flash-Lite API for automated daily standup summaries.",
  "Fixed state synchronization race condition on calendar matrix viewport.",
  "Refactored authentication middleware to validate Firebase JWT bearer tokens.",
  "Conducted performance load testing up to 1,500 concurrent WebSocket connections.",
];

const INACTIVITY_REASONS = [
  "Sick leave — fever and recovery",
  "Scheduled annual PTO",
  "Blocked on external payment gateway API credentials",
  "Attending internal architectural summit",
];

async function seedDatabase(currentUserId = "lead_sarah_connor") {
  await connectDB();

  console.log("🌱 Seeding MongoDB collections for 3-Tier Governance & Dynamic Roles...");

  // 1. Seed Dynamic Roles
  const roleMap = {};
  for (const roleData of SEED_ROLES) {
    const role = await DynamicRole.findOneAndUpdate(
      { title: roleData.title },
      { ...roleData, createdBy: currentUserId, orgScoped: true },
      { upsert: true, new: true }
    );
    roleMap[role.title] = role._id;
  }
  console.log(`✅ Seeded ${SEED_ROLES.length} dynamic roles.`);

  // 2. Seed Users across 3 tiers (product_lead, lead_architect, employee)
  for (const user of SAMPLE_USERS) {
    await User.findByIdAndUpdate(user._id, user, { upsert: true, new: true });
  }

  // Also seed default admin / pm user for fallback compatibility
  await User.findByIdAndUpdate(
    "pm_default_admin",
    {
      _id: "pm_default_admin",
      email: "pm@acube.ai",
      full_name: "Project Manager (Product Lead)",
      role_title: "Lead Product Manager",
      user_type: "product_lead",
      status: "active",
    },
    { upsert: true, new: true }
  );

  console.log(`✅ Seeded ${SAMPLE_USERS.length + 1} users with 3-tier governance.`);

  // 3. Clear existing seeded projects, tasks, and logs
  await Project.deleteMany({});
  await Task.deleteMany({});
  await DailyLog.deleteMany({});

  const today = new Date();

  // 4. Seed Projects with Team Allocations (DynamicRole mapping)
  const SAMPLE_PROJECTS = [
    {
      title: "AI-Powered Customer Intelligence Hub",
      description: "Next-gen analytics platform delivering predictive customer churn insights and automated reporting.",
      status: "active",
      member_ids: ["emp_riya_patel", "emp_karan_mehta", "emp_sneha_reddy"],
      team_allocations: [
        {
          user_id: "emp_riya_patel",
          role_id: roleMap["Senior Backend Engineer"],
          daily_hours: 4,
          allocated_at: new Date(),
        },
        {
          user_id: "emp_karan_mehta",
          role_id: roleMap["Senior Backend Engineer"],
          daily_hours: 6,
          allocated_at: new Date(),
        },
        {
          user_id: "emp_sneha_reddy",
          role_id: roleMap["UI/UX Design Specialist"],
          daily_hours: 5,
          allocated_at: new Date(),
        },
      ],
    },
    {
      title: "Enterprise Multi-Tenant Auth & Billing",
      description: "Stripe and Razorpay billing integrations, usage-based metering, and SSO authentication.",
      status: "active",
      member_ids: ["emp_karan_mehta", "emp_dev_nair", "emp_priya_singh"],
      team_allocations: [
        {
          user_id: "emp_karan_mehta",
          role_id: roleMap["Senior Backend Engineer"],
          daily_hours: 2,
          allocated_at: new Date(),
        },
        {
          user_id: "emp_dev_nair",
          role_id: roleMap["Growth Copywriter"],
          daily_hours: 5,
          allocated_at: new Date(),
        },
        {
          user_id: "emp_priya_singh",
          role_id: roleMap["QA & Test Automation Lead"],
          daily_hours: 6,
          allocated_at: new Date(),
        },
      ],
    },
    {
      title: "Mobile Field Companion App (iOS & Android)",
      description: "React Native mobile client with offline-first synchronization and real-time push alerts.",
      status: "in-review",
      member_ids: ["emp_riya_patel", "emp_sneha_reddy", "emp_priya_singh"],
      team_allocations: [
        {
          user_id: "emp_riya_patel",
          role_id: roleMap["Senior Backend Engineer"],
          daily_hours: 3,
          allocated_at: new Date(),
        },
        {
          user_id: "emp_sneha_reddy",
          role_id: roleMap["UI/UX Design Specialist"],
          daily_hours: 2,
          allocated_at: new Date(),
        },
        {
          user_id: "emp_priya_singh",
          role_id: roleMap["QA & Test Automation Lead"],
          daily_hours: 2,
          allocated_at: new Date(),
        },
      ],
    },
  ];

  for (const projData of SAMPLE_PROJECTS) {
    const project = await Project.create({
      ...projData,
      created_by: currentUserId,
    });

    // Create 2 tasks per project
    const task1 = await Task.create({
      project_id: project._id,
      title: `${project.title.split(" ")[0]} Frontend & UI Polish`,
      description: "Deliver pixel-perfect component implementations and audit accessibility.",
      start_date: new Date(today.getTime() - 20 * 86400000).toISOString().split("T")[0],
      end_date: new Date(today.getTime() + 10 * 86400000).toISOString().split("T")[0],
      assignee_ids: [projData.member_ids[0], projData.member_ids[2] || projData.member_ids[1]],
      status: "active",
    });

    const task2 = await Task.create({
      project_id: project._id,
      title: `${project.title.split(" ")[0]} API & Database Integration`,
      description: "Build robust REST endpoints, rate limiting, and write schema migrations.",
      start_date: new Date(today.getTime() - 15 * 86400000).toISOString().split("T")[0],
      end_date: new Date(today.getTime() + 15 * 86400000).toISOString().split("T")[0],
      assignee_ids: [projData.member_ids[1]],
      status: "active",
    });

    // Generate historical daily logs for past 15 days
    for (const task of [task1, task2]) {
      for (const empId of task.assignee_ids) {
        for (let i = 15; i >= 0; i--) {
          const logDate = new Date(today.getTime() - i * 86400000).toISOString().split("T")[0];
          const hasWorked = Math.random() > 0.15; // 85% attendance

          await DailyLog.create({
            task_id: task._id,
            project_id: project._id,
            user_id: empId,
            log_date: logDate,
            has_worked: hasWorked,
            work_text: hasWorked
              ? WORK_LOGS[Math.floor(Math.random() * WORK_LOGS.length)]
              : "",
            no_work_reason: !hasWorked
              ? INACTIVITY_REASONS[Math.floor(Math.random() * INACTIVITY_REASONS.length)]
              : "",
          });
        }
      }
    }
  }

  // Record initial seed audit log
  await AuditLog.record({
    actorId: currentUserId,
    action: "DATABASE_SEEDED",
    entityType: "System",
    entityId: "seed",
    after: { roleCount: SEED_ROLES.length, projectCount: SAMPLE_PROJECTS.length },
  });

  console.log("✅ MongoDB seeding completed successfully with 3-tier governance and dynamic roles!");
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Seeding failed:", err);
      process.exit(1);
    });
}

module.exports = seedDatabase;
