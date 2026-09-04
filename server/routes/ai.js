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
// Models verified from API — ordered fastest/lightest → slowest/heaviest:

const MODEL_TIERS = [
  "gemini-3.5-flash-lite",      // Fastest & lightest — highest free RPM
  "gemini-3.6-flash",           // Primary high capability flash
  "gemini-3.5-flash",           // Fast capable flash
  "gemini-flash-lite-latest",   // Latest flash-lite alias
  "gemini-flash-latest",        // Latest flash alias
  "gemini-3.1-flash-lite",      // Efficient lightweight tier
  "gemini-2.5-flash-lite",      // Fallback
  "gemini-2.5-flash",           // Fallback
  "gemini-2.5-pro",             // Deep reasoning (last resort)
];

// All API keys read exclusively from server environment — never hardcoded
// Format in Render / .env: GEMINI_API_KEY=key1,key2,key3,key4,key5,key6
const API_KEYS = (process.env.GEMINI_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter((k) => (k.startsWith("AIzaSy") || k.startsWith("AQ.") || k.length > 25) && !k.includes("your_gemini")); // Accept valid Gemini key formats

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

// Global set of revoked/invalid keys so they are NEVER tried again
const deadKeys = new Set();

// Sticky index: remember the last working key so subsequent requests don't waste roundtrips
let preferredKeyIdx = 0;

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

// ─── Core nested rotation function with Sticky Key & Dead Key elimination ─────
async function generateWithRotatingModels(prompt) {
  if (!API_KEYS || API_KEYS.length === 0) {
    throw new Error(
      "No valid GEMINI_API_KEY found in server environment. Add comma-separated keys to GEMINI_API_KEY in Render Environment Variables."
    );
  }

  let lastErr = null;
  const numKeys = API_KEYS.length;

  // Outer loop: iterate model tiers from fastest to slowest
  for (const model of MODEL_TIERS) {
    let allKeysExhausted = true;

    // Inner loop: try keys starting from the last successful working key
    for (let offset = 0; offset < numKeys; offset++) {
      const keyIdx = (preferredKeyIdx + offset) % numKeys;

      // Skip permanently dead keys immediately (0ms delay)
      if (deadKeys.has(keyIdx)) continue;

      // Skip keys cooling down on this model
      if (isOnCooldown(model, keyIdx)) continue;

      allKeysExhausted = false;

      try {
        console.log(`🤖 [AI Engine] Trying model="${model}" key=#${keyIdx + 1}/${numKeys}`);
        const client = getClient(API_KEYS[keyIdx]);
        
        // Timeout guard: 8 seconds per attempt so dead calls don't hang Render
        const responsePromise = client.models.generateContent({ model, contents: prompt });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out after 8s")), 8000)
        );

        const response = await Promise.race([responsePromise, timeoutPromise]);

        if (response?.text) {
          // Success! Pin this key as preferred for instant subsequent requests
          preferredKeyIdx = keyIdx;
          console.log(`✅ [AI Engine] Success — model="${model}" key=#${keyIdx + 1}`);
          return response.text;
        }
      } catch (err) {
        const msg = err?.message || String(err);

        if (msg.includes("leaked") || msg.includes("PERMISSION_DENIED") || msg.includes("API_KEY_INVALID")) {
          // Permanently disable this key across ALL models for this entire process
          console.error(`🚫 [AI Engine] Key #${keyIdx + 1} is invalid/revoked. Permanently disabling.`);
          deadKeys.add(keyIdx);
          lastErr = err;
          continue;
        }

        if (isQuotaError(err)) {
          // Quota hit on this key+model — cooldown and try next key
          setCooldown(model, keyIdx);
          lastErr = err;
          continue;
        }

        console.warn(`[AI Engine] Model="${model}" key=#${keyIdx + 1} error: ${msg}`);
        lastErr = err;
      }
    }

    if (allKeysExhausted) {
      console.warn(`🔁 [AI Engine] All available keys exhausted on "${model}". Falling to next model tier...`);
    }
  }

  throw lastErr || new Error(
    "All model tiers and API keys are currently quota-exhausted. Please retry in a few moments."
  );
}

// ─── In-Memory Platform Context Cache (30s TTL to prevent Atlas DB latency) ───
let cachedPlatformContext = null;
let lastContextCacheTime = 0;
const CONTEXT_CACHE_TTL_MS = 30 * 1000; // 30 seconds

async function getCachedPlatformContext() {
  const now = Date.now();
  if (cachedPlatformContext && (now - lastContextCacheTime < CONTEXT_CACHE_TTL_MS)) {
    return cachedPlatformContext;
  }
  cachedPlatformContext = await buildPlatformContext();
  lastContextCacheTime = now;
  return cachedPlatformContext;
}

// Fast greeting detector for sub-second conversational replies
const GREETINGS = new Set([
  "hi", "hello", "hey", "hola", "yo", "good morning", "good evening", 
  "good afternoon", "sup", "howdy", "test", "who are you", "what can you do"
]);

function isGreeting(text) {
  const clean = (text || "").trim().toLowerCase().replace(/[^a-z\s]/g, "");
  return GREETINGS.has(clean) || clean.length <= 2;
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

// Get live platform knowledge summary (uses in-memory cache for speed)
router.get("/context", verifyToken, async (req, res) => {
  try {
    const context = await getCachedPlatformContext();
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

    // 🚀 Fast-path for greetings: answers in sub-second time without querying MongoDB!
    if (isGreeting(question)) {
      const greetingPrompt = `You are the Autonomous PM AI Copilot. Greet the user warmly and concisely in 1-2 friendly sentences. Mention you have real-time access to active projects, timelines, developer allocations, and daily logs. Ask how you can assist them today.`;
      const answer = await generateWithRotatingModels(greetingPrompt);
      return res.json({
        answer,
        timestamp: new Date().toISOString(),
      });
    }

    const platformContext = await getCachedPlatformContext();

    const prompt = `You are the Autonomous PM AI Copilot with real-time access to the organization's project and team database.

LIVE PLATFORM DATABASE SNAPSHOT (Date: ${platformContext.today}):
======================================================
ORGANIZATION OVERVIEW:
- Total Projects: ${platformContext.total_projects} (${platformContext.high_priority_projects_count} HIGH/CRITICAL Priority 🔥, ${platformContext.active_projects_count} Active, ${platformContext.in_review_projects_count} In Review, ${platformContext.completed_projects_count} Completed)
- Total Employees: ${platformContext.total_employees}
- Total Tasks: ${platformContext.total_tasks}

PROJECTS & PRIORITY TIMELINES:
${JSON.stringify(platformContext.projects)}

DEVELOPER TEAM WORKLOADS & MULTI-PROJECT ASSIGNMENTS:
${JSON.stringify(platformContext.team_directory)}

RECENT INACTIVITY & BLOCKERS RECORDED:
${JSON.stringify(platformContext.recent_blockers)}
======================================================

USER QUESTION: "${question}"

CRITICAL INSTRUCTIONS ON RESPONSE LENGTH & STYLE:
1. **BE ULTRA-CONCISE & DIRECT BY DEFAULT**:
   - For simple, factual, or specific questions, answer directly in 1 to 3 short sentences or concise bullet points.
   - Do NOT include conversational filler or repetitive preamble.
2. **ONLY PROVIDE LENGTHY OR DETAILED INFO IF EXPLICITLY REQUESTED**:
   - Only provide detailed paragraphs if the user specifically asks to "explain in detail", "elaborate", or "why".
3. **ACCURACY & DATA-DRIVEN**:
   - For timeline questions, give the exact days remaining and deadline directly.
   - For developer assignments, state names directly.
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
module.exports.generateWithRotatingModels = generateWithRotatingModels;
