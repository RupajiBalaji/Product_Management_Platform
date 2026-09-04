/**
 * Phase 10 — Passive PM Agent Thread Monitor
 *
 * Provides:
 * 1. detectDependencyReference:
 *    Pure pattern/string matching (zero AI, zero DB). Detects if a message references
 *    any task title or dependency phrases ("blocked on", "waiting for", "depends on").
 *
 * 2. detectUnresolvedDisagreement:
 *    Evaluates thread messages for staleness (default >= 24h) and calls Gemini AI
 *    (or an injected mock evaluator) to detect unresolved technical/scope disagreements.
 *    Resilient try/catch protects against AI/network failures.
 */

let defaultAiGenerator;
try {
  defaultAiGenerator = require("../routes/ai").generateWithRotatingModels;
} catch {
  defaultAiGenerator = null;
}

const DEPENDENCY_KEYWORDS = [
  "blocked on",
  "blocked by",
  "waiting for",
  "waiting on",
  "depends on",
  "dependency on",
  "dependent on",
];

/**
 * Pure check: Detects if message content mentions any task title or dependency phrase.
 *
 * @param {string} messageContent
 * @param {string[]} [projectTaskTitles=[]]
 * @returns {{ referencesTask: boolean, matchedTaskTitles: string[], matchedKeywords: string[] }}
 */
function detectDependencyReference(messageContent, projectTaskTitles = []) {
  if (!messageContent || typeof messageContent !== "string") {
    return { referencesTask: false, matchedTaskTitles: [], matchedKeywords: [] };
  }

  const contentLower = messageContent.toLowerCase();
  const matchedTaskTitles = [];
  const matchedKeywords = [];

  if (Array.isArray(projectTaskTitles)) {
    projectTaskTitles.forEach((title) => {
      if (title && typeof title === "string" && title.trim().length > 1) {
        const titleTrimmed = title.trim().toLowerCase();
        if (contentLower.includes(titleTrimmed)) {
          matchedTaskTitles.push(title.trim());
        }
      }
    });
  }

  DEPENDENCY_KEYWORDS.forEach((kw) => {
    if (contentLower.includes(kw)) {
      matchedKeywords.push(kw);
    }
  });

  return {
    referencesTask: matchedTaskTitles.length > 0 || matchedKeywords.length > 0,
    matchedTaskTitles,
    matchedKeywords,
  };
}

/**
 * Extracts and cleans JSON from AI response text
 */
function parseAiVerdictJson(rawText) {
  if (!rawText) throw new Error("Empty response from AI engine");
  let cleaned = String(rawText).trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

/**
 * Evaluates thread messages for unresolved disagreements after a staleness threshold.
 *
 * @param {Array<Object>} threadMessages - Array of { author_id, content, created_at }
 * @param {number} [hoursThreshold=24] - Staleness window in hours
 * @param {Function} [aiClient] - Optional AI generator for testing / dependency injection
 * @returns {Promise<{ hasUnresolvedDisagreement: boolean, summary: string, suggestedResolution: string, error?: string }>}
 */
async function detectUnresolvedDisagreement(
  threadMessages,
  hoursThreshold = 24,
  aiClient = defaultAiGenerator
) {
  try {
    if (!Array.isArray(threadMessages) || threadMessages.length < 2) {
      return {
        hasUnresolvedDisagreement: false,
        summary: "",
        suggestedResolution: "",
        reason: "Insufficient message history for disagreement detection.",
      };
    }

    // Check staleness of last message
    const lastMsg = threadMessages[threadMessages.length - 1];
    const lastMsgTime = new Date(lastMsg.created_at || Date.now()).getTime();
    const timeSinceLastMsg = Date.now() - lastMsgTime;
    const isStale = timeSinceLastMsg >= hoursThreshold * 3600 * 1000;

    if (!isStale) {
      return {
        hasUnresolvedDisagreement: false,
        summary: "",
        suggestedResolution: "",
        reason: `Thread is still active or updated within the last ${hoursThreshold} hours.`,
      };
    }

    if (!aiClient) {
      return {
        hasUnresolvedDisagreement: false,
        summary: "",
        suggestedResolution: "",
        reason: "No AI generator available.",
      };
    }

    // Inspect last ~10 messages
    const recentMessages = threadMessages.slice(-10).map((m) => ({
      author: m.author_id || "Employee",
      content: m.content || "",
      timestamp: m.created_at,
    }));

    const prompt = `You are an Autonomous Project Management passive observer.
Analyze the following messages from an internal project collaboration thread that has gone cold (no new messages for >= ${hoursThreshold} hours).

Determine if the participants have an UNRESOLVED disagreement, architectural dispute, blocking confusion, or opposing technical positions that stalled progress.

MESSAGES:
${JSON.stringify(recentMessages, null, 2)}

Respond with ONLY a raw JSON object conforming strictly to this format:
{
  "hasUnresolvedDisagreement": true | false,
  "summary": "Concise summary (1-2 sentences) of the dispute or opposing viewpoints",
  "suggestedResolution": "Actionable proposal or mediation prompt for the Product Lead to unblock the team"
}`;

    const rawResponse = await aiClient(prompt);
    let parsed;
    if (typeof rawResponse === "object" && rawResponse !== null && rawResponse.hasUnresolvedDisagreement !== undefined) {
      parsed = rawResponse;
    } else {
      parsed = parseAiVerdictJson(rawResponse);
    }

    return {
      hasUnresolvedDisagreement: Boolean(parsed.hasUnresolvedDisagreement),
      summary: parsed.summary || "",
      suggestedResolution: parsed.suggestedResolution || "",
    };
  } catch (err) {
    // Fail-safe: never crash or false-flag on AI/network errors
    console.warn("detectUnresolvedDisagreement encountered an error (safe fallback):", err.message);
    return {
      hasUnresolvedDisagreement: false,
      summary: "",
      suggestedResolution: "",
      error: err.message,
    };
  }
}

module.exports = {
  detectDependencyReference,
  detectUnresolvedDisagreement,
  DEPENDENCY_KEYWORDS,
};
