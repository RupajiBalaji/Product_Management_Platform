/**
 * AI Lessons-Learned Generator (Phase 11)
 *
 * Synthesizes high-impact project calibration insights and lessons learned
 * based on post-mortem estimation accuracy, incident summary, and team performance metrics.
 *
 * Implements injectable AI client pattern matching Phase 4 and Phase 10.
 */

let defaultAiGenerator;
try {
  defaultAiGenerator = require("../routes/ai").generateWithRotatingModels;
} catch {
  defaultAiGenerator = null;
}

const FALLBACK_LESSONS = [
  "AI-generated lessons unavailable — review estimation accuracy and incident summary manually.",
];

/**
 * Safely parse JSON from AI responses (stripping markdown code fences if present).
 *
 * @param {string|object} raw
 * @returns {object}
 */
function parseAiLessonsJson(raw) {
  if (typeof raw === "object" && raw !== null) return raw;
  if (!raw || typeof raw !== "string") return {};

  let clean = raw.trim();
  // Remove markdown code fences ```json ... ```
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(clean);
  } catch {
    // Attempt regex extraction of { "lessons": [...] }
    const match = clean.match(/\{[\s\S]*"lessons"[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return {};
      }
    }
    return {};
  }
}

/**
 * generateLessonsLearned(estimationAccuracy, incidentSummary, teamPerformance, projectContext, aiClient)
 *
 * @param {Object} estimationAccuracy - { overall, byEmployee, byPhase }
 * @param {Object} incidentSummary - { slippageEventsCount, qaRejectionLoopCount, scopeChangesCount, blockerIncidentsCount }
 * @param {Array<Object>} teamPerformance - [{ userId, onTimeReliabilityPct, firstPassQualityPct, tasksCompleted }]
 * @param {Object} [projectContext={}] - { title, description }
 * @param {Function} [aiClient] - Optional injectable async (prompt) => string|object
 * @returns {Promise<string[]>}
 */
async function generateLessonsLearned(
  estimationAccuracy = {},
  incidentSummary = {},
  teamPerformance = [],
  projectContext = {},
  aiClient = defaultAiGenerator
) {
  try {
    if (!aiClient) {
      return FALLBACK_LESSONS;
    }

    const prompt = `You are an Autonomous Project Management executive AI retro director.
Analyze the following post-mortem retrospective telemetry for project "${projectContext.title || "Project"}":

1. ESTIMATION ACCURACY:
- Overall: Estimated ${estimationAccuracy?.overall?.totalEstimatedHours || 0}h, Actual ${estimationAccuracy?.overall?.totalActualHours || 0}h (Variance: ${estimationAccuracy?.overall?.variancePct || 0}%)
- By Phase/Domain: ${JSON.stringify(estimationAccuracy?.byPhase || [], null, 2)}
- By Contributor: ${JSON.stringify(estimationAccuracy?.byEmployee || [], null, 2)}

2. INCIDENTS & BLOCKERS:
- Slippage Escalations: ${incidentSummary?.slippageEventsCount || 0}
- Repeated QA Rejection Loops (>=3 fails): ${incidentSummary?.qaRejectionLoopCount || 0}
- Scope & Directive Changes: ${incidentSummary?.scopeChangesCount || 0}
- Blocked Action Requests: ${incidentSummary?.blockerIncidentsCount || 0}

3. TEAM PERFORMANCE & QUALITY:
${JSON.stringify(teamPerformance || [], null, 2)}

Synthesize 2 to 4 high-impact, actionable, and concrete engineering management calibration lessons learned.
Focus on:
- Calibration factors for future estimation (e.g. "Backend estimation was consistently 40% under actual time, apply a 1.4x calibration factor for similar tasks").
- Recurring blockers, QA gate friction, or handoff improvements.
- Team pacing or capacity adjustments.

Respond with ONLY a raw JSON object conforming strictly to this format:
{
  "lessons": [
    "Lesson 1 string...",
    "Lesson 2 string..."
  ]
}`;

    const rawResponse = await aiClient(prompt);
    let parsed;
    if (typeof rawResponse === "object" && rawResponse !== null && Array.isArray(rawResponse.lessons)) {
      parsed = rawResponse;
    } else {
      parsed = parseAiLessonsJson(rawResponse);
    }

    if (Array.isArray(parsed.lessons) && parsed.lessons.length > 0) {
      return parsed.lessons.filter((l) => typeof l === "string" && l.trim().length > 0);
    }

    return FALLBACK_LESSONS;
  } catch (err) {
    console.warn("generateLessonsLearned encountered an error (safe fallback):", err.message);
    return FALLBACK_LESSONS;
  }
}

module.exports = {
  generateLessonsLearned,
  FALLBACK_LESSONS,
};
