const express = require("express");
const router = express.Router();
const { GoogleGenAI } = require("@google/genai");
const { Project, Task, DailyLog } = require("../models/models");
const User = require("../models/User");
const { verifyToken } = require("../middleware/auth");

const API_KEY = process.env.GEMINI_API_KEY || "your_gemini_api_key_here";
const genAI = new GoogleGenAI({ apiKey: API_KEY });

const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const FALLBACK_MODELS = [PRIMARY_MODEL, "gemini-2.5-flash-lite", "gemini-1.5-flash-latest", "gemini-1.5-flash"];

// Robust generator trying primary model then fallbacks
async function generateWithFallback(prompt) {
  let lastErr = null;
  for (const modelName of FALLBACK_MODELS) {
    try {
      const response = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      if (response && response.text) {
        return response.text;
      }
    } catch (err) {
      console.warn(`[Gemini] Model ${modelName} failed:`, err.message || err);
      lastErr = err;
    }
  }
  throw lastErr || new Error("All Gemini models failed to generate a response.");
}

// Build comprehensive live platform knowledge base from MongoDB
async function buildPlatformContext() {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const [projects, tasks, users, recentLogs] = await Promise.all([
    Project.find().sort({ priority: -1, created_at: -1 }).lean(),
    Task.find().lean(),
    User.find().lean(),
    DailyLog.find().sort({ log_date: -1 }).limit(40).lean(),
  ]);

  const userMap = new Map(users.map((u) => [u._id, u.full_name || u.email]));

  // Calculate project intelligence (deadline, remaining days, workload, priority)
  const projectSummaries = projects.map((p) => {
    const projTasks = tasks.filter((t) => String(t.project_id) === String(p._id));
    const members = (p.member_ids || []).map((id) => userMap.get(id) || id);

    let maxEndDate = null;
    let daysRemaining = "No tasks scheduled";

    if (projTasks.length > 0) {
      const endDates = projTasks.map((t) => new Date(t.end_date));
      maxEndDate = new Date(Math.max(...endDates));
      const diffTime = maxEndDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      daysRemaining =
        diffDays > 0
          ? `${diffDays} days remaining (Target: ${maxEndDate.toISOString().split("T")[0]})`
          : diffDays === 0
          ? "Deadline is TODAY"
          : `${Math.abs(diffDays)} days OVERDUE`;
    }

    return {
      id: String(p._id),
      title: p.title,
      description: p.description,
      status: p.status,
      priority: p.priority || "medium",
      team_members: members,
      team_size: members.length,
      task_count: projTasks.length,
      estimated_completion: daysRemaining,
      tasks: projTasks.map((t) => ({
        title: t.title,
        status: t.status,
        start_date: t.start_date,
        end_date: t.end_date,
        assignees: (t.assignee_ids || []).map((id) => userMap.get(id) || id),
      })),
    };
  });

  const employeeWorkloads = users
    .filter((u) => u.user_type === "employee")
    .map((u) => {
      const assignedProjects = projects
        .filter((p) => (p.member_ids || []).includes(u._id))
        .map((p) => ({ title: p.title, priority: p.priority || "medium" }));
      const assignedTasks = tasks
        .filter((t) => (t.assignee_ids || []).includes(u._id))
        .map((t) => t.title);
      return {
        name: u.full_name,
        role: u.role_title,
        email: u.email,
        projects_count: assignedProjects.length,
        projects: assignedProjects,
        has_high_priority_project: assignedProjects.some((p) => p.priority === "high" || p.priority === "critical"),
        active_tasks: assignedTasks,
      };
    });

  const recentBlockers = recentLogs
    .filter((l) => !l.has_worked && l.no_work_reason)
    .map((l) => ({
      employee: userMap.get(l.user_id) || l.user_id,
      date: l.log_date,
      reason: l.no_work_reason,
    }));

  const highPriorityCount = projects.filter((p) => p.priority === "high" || p.priority === "critical").length;

  return {
    today: todayStr,
    total_projects: projects.length,
    high_priority_projects_count: highPriorityCount,
    active_projects_count: projects.filter((p) => p.status === "active").length,
    in_review_projects_count: projects.filter((p) => p.status === "in-review").length,
    completed_projects_count: projects.filter((p) => p.status === "completed").length,
    total_employees: employeeWorkloads.length,
    total_tasks: tasks.length,
    projects: projectSummaries,
    team_directory: employeeWorkloads,
    recent_blockers: recentBlockers,
  };
}

// Get live platform knowledge summary
router.get("/context", verifyToken, async (req, res) => {
  try {
    const context = await buildPlatformContext();
    res.json(context);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Omnipresent AI Copilot Q&A
router.post("/chat", verifyToken, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: "Question is required" });

    const platformContext = await buildPlatformContext();

    const prompt = `You are the Autonomous PM AI Copilot with real-time access to the organization's project and team database.

LIVE PLATFORM DATABASE SNAPSHOT (Date: ${platformContext.today}):
======================================================
ORGANIZATION OVERVIEW:
- Total Projects: ${platformContext.total_projects} (${platformContext.high_priority_projects_count} HIGH/CRITICAL Priority 🔥, ${platformContext.active_projects_count} Active, ${platformContext.in_review_projects_count} In Review, ${platformContext.completed_projects_count} Completed)
- Total Employees: ${platformContext.total_employees}
- Total Tasks: ${platformContext.total_tasks}

PROJECTS & PRIORITY TIMELINES:
${JSON.stringify(platformContext.projects, null, 2)}

DEVELOPER TEAM WORKLOADS & MULTI-PROJECT ASSIGNMENTS:
${JSON.stringify(platformContext.team_directory, null, 2)}

RECENT INACTIVITY & BLOCKERS RECORDED:
${JSON.stringify(platformContext.recent_blockers, null, 2)}
======================================================

USER QUESTION: "${question}"

CRITICAL INSTRUCTIONS ON RESPONSE LENGTH & STYLE:
1. **BE ULTRA-CONCISE & DIRECT BY DEFAULT**:
   - For simple, factual, or specific questions, answer directly in 1 to 3 short sentences or concise bullet points.
   - Do NOT include conversational filler, preamble, repetitive introductions (e.g., "Sure, I can help with that..."), or unrequested essays.
2. **ONLY PROVIDE LENGTHY OR DETAILED INFO IF EXPLICITLY REQUESTED**:
   - Only provide detailed paragraphs, deep dives, or multi-section essays if the user specifically asks to "explain in detail", "elaborate", "give me a full breakdown", "detailed info", or "why".
3. **ACCURACY & DATA-DRIVEN**:
   - For timeline questions (how many days left, deadlines), give the exact number of days remaining and deadline date directly.
   - For developer assignments, state names directly.
   - For priorities, mention the priority level clearly.
4. Keep the output clean, sharp, and easy to read.`;

    const answer = await generateWithFallback(prompt);

    res.json({
      answer,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: "AI Copilot failed to process the request: " + (err.message || err) });
  }
});

// Multi-dimensional summary generator
router.post("/summary", verifyToken, async (req, res) => {
  try {
    const { dimension = "organization", projectId, employeeId, dateFrom, dateTo, statusFlag } = req.body;
    const platformContext = await buildPlatformContext();

    const prompt = `You are an executive project management intelligence engine. Generate a concise, high-impact ${dimension}-level summary based on this platform data:

DATABASE SNAPSHOT:
${JSON.stringify(platformContext, null, 2)}

SUMMARY PARAMETERS:
- Dimension: ${dimension}
- Specific Project ID: ${projectId || "All"}
- Specific Employee ID: ${employeeId || "All"}
- Date Filter: ${dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : "All Time"}
- Status Filter: ${statusFlag || "All"}

INSTRUCTIONS:
Provide a crisp, executive summary formatted with bullet points:
• 📊 Key Status & Metrics
• 🚀 Priority Deliverables & Velocity
• ⚠️ Active Blockers / Slippage Risks (if any)
• 💡 Key PM Action Item (1-2 sentences)`;

    const summary = await generateWithFallback(prompt);

    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
