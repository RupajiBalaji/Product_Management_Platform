const express = require("express");
const router = express.Router();
const { GoogleGenAI } = require("@google/genai");
const { Project, Task, DailyLog } = require("../models/models");
const User = require("../models/User");
const { verifyToken } = require("../middleware/auth");

// ─── Rotating Model & Multi-Key Quota Failover Engine ──────────────────────────

const RAW_MODEL_POOL = [
  process.env.GEMINI_MODEL || "gemini-2.0-flash-lite",
  "gemini-2.0-flash-lite",     // Ultra-fast, minimal latency, highest RPM quota
  "gemini-3.1-flash-lite",     // Next-gen high-efficiency model
  "gemini-2.5-flash-lite",     // High-speed lightweight model
  "gemini-1.5-flash-8b",       // 8B parameter ultra-compact blazing fast model
  "gemini-2.0-flash",          // Fast multimodal flagship
  "gemini-2.5-flash",          // General performance flash model
  "gemini-1.5-flash",          // Stable fallback flash model
  "gemini-2.5-pro",            // Deep reasoning fallback
];

// Deduplicate model list while preserving priority order
const ROTATING_MODEL_POOL = [...new Set(RAW_MODEL_POOL)];

// Reads exclusively from server environment variables (Render Environment Variables / local .env)
const rawKeys = (process.env.GEMINI_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);
const API_KEYS = rawKeys;

// Cache of GoogleGenAI client instances per API key
const clientCache = new Map();
function getGenAIClient(apiKey) {
  if (!clientCache.has(apiKey)) {
    clientCache.set(apiKey, new GoogleGenAI({ apiKey }));
  }
  return clientCache.get(apiKey);
}

// Rotation state & cooldown memory
let currentModelIndex = 0;
let currentKeyIndex = 0;
const modelCooldowns = new Map(); // modelName -> timestamp (ms) when cooldown ends
const COOLDOWN_DURATION_MS = 60 * 1000; // 60 seconds cooldown after 429 quota exhaustion

function isQuotaExhaustedError(err) {
  const msg = (err?.message || String(err)).toLowerCase();
  const status = err?.status || err?.code || 0;
  return (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("exhausted")
  );
}

// Robust generator with rotating loop: when one model's quota is done, switch to next model
async function generateWithRotatingModels(prompt) {
  if (!API_KEYS || API_KEYS.length === 0) {
    throw new Error(
      "GEMINI_API_KEY is not configured in the server environment. Please add GEMINI_API_KEY in your Render Dashboard Environment settings (or local .env file)."
    );
  }

  const poolLength = ROTATING_MODEL_POOL.length;
  const now = Date.now();
  let lastErr = null;

  // Attempt across the rotating pool starting from currentModelIndex
  for (let attempt = 0; attempt < poolLength; attempt++) {
    const candidateIdx = (currentModelIndex + attempt) % poolLength;
    const modelName = ROTATING_MODEL_POOL[candidateIdx];

    // Check if candidate model is currently in quota cooldown
    const cooldownExpiry = modelCooldowns.get(modelName) || 0;
    if (now < cooldownExpiry && attempt < poolLength - 1) {
      const remainingSec = Math.ceil((cooldownExpiry - now) / 1000);
      console.log(`⏳ [Gemini Engine] Skipping "${modelName}" (quota cooldown active for ${remainingSec}s)...`);
      continue;
    }

    const currentKey = API_KEYS[currentKeyIndex % API_KEYS.length];
    const client = getGenAIClient(currentKey);

    try {
      console.log(`🤖 [Gemini Engine] Attempting request using model: "${modelName}" (key #${(currentKeyIndex % API_KEYS.length) + 1})...`);

      const response = await client.models.generateContent({
        model: modelName,
        contents: prompt,
      });

      if (response && response.text) {
        // Model succeeded: advance index for fair round-robin load distribution
        currentModelIndex = (candidateIdx + 1) % poolLength;
        // Clear any prior cooldown for this model
        modelCooldowns.delete(modelName);
        console.log(`✅ [Gemini Engine] Response generated successfully with "${modelName}". Next model queued.`);
        return response.text;
      }
    } catch (err) {
      const errMsg = err?.message || String(err);

      if (errMsg.includes("leaked") || errMsg.includes("PERMISSION_DENIED")) {
        throw new Error(
          "Your Google Gemini API key was reported as leaked/revoked by Google. Please generate a new free API key at https://aistudio.google.com and set GEMINI_API_KEY in your .env file."
        );
      }

      if (isQuotaExhaustedError(err)) {
        // Mark model as quota-exhausted for 60 seconds
        modelCooldowns.set(modelName, Date.now() + COOLDOWN_DURATION_MS);
        console.warn(`⚠️ [Gemini Engine] Quota reached on model "${modelName}" (429/ResourceExhausted). Rotating to next model in loop...`);

        // If multiple API keys exist, also rotate to next key
        if (API_KEYS.length > 1) {
          currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
          console.log(`🔄 [Gemini Engine] Also rotating API key to key #${(currentKeyIndex % API_KEYS.length) + 1}`);
        }
      } else {
        console.warn(`[Gemini Engine] Model "${modelName}" error:`, errMsg);
      }

      lastErr = err;
    }
  }

  throw lastErr || new Error("All models in the rotating pool exhausted their quota or failed. Please retry shortly.");
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

    const answer = await generateWithRotatingModels(prompt);

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

    const summary = await generateWithRotatingModels(prompt);

    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real-time inspection of rotating models pool & quota status
router.get("/models-status", (req, res) => {
  const now = Date.now();
  const poolStatus = ROTATING_MODEL_POOL.map((model, idx) => {
    const cooldownExpiry = modelCooldowns.get(model) || 0;
    const isCoolingDown = now < cooldownExpiry;
    return {
      model,
      is_current_target: idx === currentModelIndex,
      status: isCoolingDown ? "cooling_down (quota exhausted)" : "healthy",
      cooldown_remaining_seconds: isCoolingDown ? Math.ceil((cooldownExpiry - now) / 1000) : 0,
    };
  });

  res.json({
    success: true,
    active_model: ROTATING_MODEL_POOL[currentModelIndex],
    current_model_index: currentModelIndex,
    configured_keys_count: API_KEYS.length,
    pool: poolStatus,
  });
});

module.exports = router;
