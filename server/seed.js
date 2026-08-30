require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./db");
const User = require("./models/User");
const { Project, Task, DailyLog } = require("./models/models");

const SAMPLE_EMPLOYEES = [
  {
    _id: "emp_riya_patel",
    email: "riya.patel@acube.ai",
    full_name: "Riya Patel",
    role_title: "Senior Frontend Engineer",
    user_type: "employee",
    status: "active",
  },
  {
    _id: "emp_karan_mehta",
    email: "karan.mehta@acube.ai",
    full_name: "Karan Mehta",
    role_title: "Backend / Node.js Lead",
    user_type: "employee",
    status: "active",
  },
  {
    _id: "emp_sneha_reddy",
    email: "sneha.reddy@acube.ai",
    full_name: "Sneha Reddy",
    role_title: "Product & UI/UX Designer",
    user_type: "employee",
    status: "active",
  },
  {
    _id: "emp_dev_nair",
    email: "dev.nair@acube.ai",
    full_name: "Dev Nair",
    role_title: "DevOps & Cloud Architect",
    user_type: "employee",
    status: "active",
  },
  {
    _id: "emp_priya_singh",
    email: "priya.singh@acube.ai",
    full_name: "Priya Singh",
    role_title: "Lead QA Automation Engineer",
    user_type: "employee",
    status: "active",
  },
];

const SAMPLE_PROJECTS = [
  {
    title: "AI-Powered Customer Intelligence Hub",
    description: "Next-gen analytics platform delivering predictive customer churn insights and automated reporting.",
    status: "active",
    member_ids: ["emp_riya_patel", "emp_karan_mehta", "emp_sneha_reddy"],
  },
  {
    title: "Enterprise Multi-Tenant Auth & Billing",
    description: "Stripe and Razorpay billing integrations, usage-based metering, and SSO authentication.",
    status: "active",
    member_ids: ["emp_karan_mehta", "emp_dev_nair", "emp_priya_singh"],
  },
  {
    title: "Mobile Field Companion App (iOS & Android)",
    description: "React Native mobile client with offline-first synchronization and real-time push alerts.",
    status: "in-review",
    member_ids: ["emp_riya_patel", "emp_sneha_reddy", "emp_priya_singh"],
  },
];

const WORK_LOGS = [
  "Completed responsive dashboard layouts and dark mode contrast adjustments.",
  "Engineered Redis caching layer for heavy aggregate queries; reduced latency by 55%.",
  "Designed interactive heatmap UI wireframes in Figma and reviewed with team.",
  "Configured GitHub Actions multi-stage Docker build pipeline for staging & prod.",
  "Authored end-to-end Cypress test suite for subscription checkout flows.",
  "Integrated Gemini 2.0 Flash-Lite API for automated daily standup summaries.",
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

async function seedDatabase(currentUserId = "pm_default_admin") {
  await connectDB();

  console.log("🌱 Seeding MongoDB collections...");

  // Seed employees
  for (const emp of SAMPLE_EMPLOYEES) {
    await User.findByIdAndUpdate(emp._id, emp, { upsert: true, new: true });
  }

  // Create PM if not exists
  await User.findByIdAndUpdate(
    currentUserId,
    {
      _id: currentUserId,
      email: "pm@acube.ai",
      full_name: "Project Manager",
      role_title: "Lead Project Manager",
      user_type: "pm",
      status: "active",
    },
    { upsert: true, new: true }
  );

  // Clear existing seeded projects, tasks, and logs
  await Project.deleteMany({});
  await Task.deleteMany({});
  await DailyLog.deleteMany({});

  const today = new Date();

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

  console.log("✅ MongoDB seeding completed successfully!");
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
