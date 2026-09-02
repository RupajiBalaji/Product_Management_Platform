const express = require("express");
const router = express.Router();
const { GoogleGenAI } = require("@google/genai");
const { Project, Task, DailyLog } = require("../models/models");
const User = require("../models/User");
const { verifyToken } = require("../middleware/auth");

// ─── Rotating Model + Multi-Key Quota Failover Engine ────────────────────────
//
// Strategy: For each model tier (fastest → slowest), try EVERY API key.
// Only move to the next (slower) model tier when ALL keys are exhausted on current model.
// This maximises free-tier quota across all keys before falling back to heavier models.
//
// Tier Order (free-tier, fastest → slowest):
//   1. gemini-2.0-flash-lite   ← try all 6 keys here first
//   2. gemini-1.5-flash-8b     ← if all keys quota out above
//   3. gemini-2.5-flash-lite   ← if all keys quota out above
//   4. gemini-2.0-flash        ← ...
//   5. gemini-1.5-flash        ← ...
//   6. gemini-2.5-flash        ← ...
//   7. gemini-2.5-pro          ← last resort deep reasoning

const MODEL_TIERS = [
  "gemini-2.0-flash-lite",   // Fastest, highest free-tier RPM
  "gemini-1.5-flash-8b",     // Ultra-compact 8B, blazing speed
  "gemini-2.5-flash-lite",   // Lightweight high-throughput
  "gemini-2.0-flash",        // Next-gen multimodal flash
  "gemini-1.5-flash",        // Stable reliable flash
  "gemini-2.5-flash",        // General high-performance flash
  "gemini-2.5-pro",          // Deep reasoning (last resort)
];

// All API keys read exclusively from server environment — never hardcoded
// Format in Render / .env: GEMINI_API_KEY=key1,key2,key3,key4,key5,key6
const API_KEYS = (process.env.GEMINI_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter((k) => k.startsWith("AIzaSy")); // Only accept valid Gemini key format

// Cache GoogleGenAI client instances per key (one instance per key, reused)
const _clientCache = new Map();
function getClient(apiKey) {
  if (!_clientCache.has(apiKey)) {
    _clientCache.set(apiKey, new GoogleGenAI({ apiKey }));
  }
  return _clientCache.get(apiKey);
}

// Per-model-per-key cooldown tracking after 429 quota exhaustion
// Key: "modelName::keyIndex"  Value: timestamp (ms) when cooldown expires
const _cooldowns = new Map();
const COOLDOWN_MS = 65 * 1000; // 65 second cooldown matches Google's 1-min quota window

function isOnCooldown(model, keyIdx) {
  return Date.now() < (_cooldowns.get(`${model}::${keyIdx}`) || 0);
}

function setCooldown(model, keyIdx) {
  _cooldowns.set(`${model}::${keyIdx}`, Date.now() + COOLDOWN_MS);
  const exp = new Date(Date.now() + COOLDOWN_MS).toLocaleTimeString();
  console.warn(`⏳ [AI Engine] Key #${keyIdx + 1} quota hit on "${model}". Cooling down until ${exp}.`);
}

function isQuotaError(err) {
  const msg = (err?.message || String(err)).toLowerCase();
  return (
    (err?.status || err?.code) === 429 ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  );
}

// ─── Core nested rotation function ───────────────────────────────────────────
async function generateWithRotatingModels(prompt) {
  if (!API_KEYS || API_KEYS.length === 0) {
    throw new Error(
      "No valid GEMINI_API_KEY found in server environment. Add comma-separated keys to GEMINI_API_KEY in Render Environment Variables."
    );
  }

  let lastErr = null;

  // Outer loop: iterate model tiers from fastest to slowest
  for (const model of MODEL_TIERS) {
    let allKeysExhausted = true; // assume exhausted until a key succeeds or isn't on cooldown

    // Inner loop: try every API key with this model
    for (let keyIdx = 0; keyIdx < API_KEYS.length; keyIdx++) {
      if (isOnCooldown(model, keyIdx)) {
        // This key is cooling down on this model — skip it
        console.log(`⏭️  [AI Engine] Skipping key #${keyIdx + 1} on "${model}" (quota cooldown active)`);
        continue;
      }

      allKeysExhausted = false; // at least one key is still available for this model

      try {
        console.log(`🤖 [AI Engine] Trying model="${model}" key=#${keyIdx + 1}/${API_KEYS.length}`);
        const client = getClient(API_KEYS[keyIdx]);
        const response = await client.models.generateContent({ model, contents: prompt });

        if (response?.text) {
          console.log(`✅ [AI Engine] Success — model="${model}" key=#${keyIdx + 1}`);
          return response.text;
        }
      } catch (err) {
        const msg = err?.message || String(err);

        if (msg.includes("leaked") || msg.includes("PERMISSION_DENIED") || msg.includes("API_KEY_INVALID")) {
          // This specific key is revoked/invalid — skip it permanently this session
          console.error(`🚫 [AI Engine] Key #${keyIdx + 1} is invalid/revoked. Skipping.`);
          setCooldown(model, keyIdx); // put on long cooldown so it's skipped
          lastErr = err;
          continue;
        }

        if (isQuotaError(err)) {
          // Quota hit — cool down this key+model combo and try next key
          setCooldown(model, keyIdx);
          lastErr = err;
          continue;
        }

        // Non-quota error (network, server error etc) — log and try next key
        console.warn(`[AI Engine] Non-quota error on model="${model}" key=#${keyIdx + 1}: ${msg}`);
        lastErr = err;
      }
    }

    if (allKeysExhausted) {
      // Every key is on cooldown for this model — move to next (slower) model tier
      console.warn(`🔁 [AI Engine] All keys quota-exhausted on "${model}". Dropping to next model tier...`);
    }
  }

  throw lastErr || new Error(
    "All model tiers and API keys are quota-exhausted. Please wait ~1 minute and retry."
  );
}

// ─── Live pool status for inspection ─────────────────────────────────────────
function getPoolStatus() {
  const now = Date.now();
  return MODEL_TIERS.map((model) => {
    const keyStatuses = API_KEYS.map((_, idx) => {
      const expiry = _cooldowns.get(`${model}::${idx}`) || 0;
      const cooling = now < expiry;
      return {
        key: `key_${idx + 1}`,
        status: cooling ? "cooling_down" : "ready",
        cooldown_remaining_seconds: cooling ? Math.ceil((expiry - now) / 1000) : 0,
      };
    });
    const allCooling = keyStatuses.every((k) => k.status === "cooling_down");
    return {
      model,
      tier_status: allCooling ? "⚠️ all_keys_exhausted" : "✅ available",
      keys: keyStatuses,
    };
  });
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


// Real-time inspection of model tiers & per-key quota status
router.get("/models-status", (req, res) => {
  res.json({
    success: true,
    configured_keys_count: API_KEYS.length,
    strategy: "model-first: exhaust all keys per tier before dropping to next tier",
    tiers: getPoolStatus(),
  });
});

module.exports = router;
