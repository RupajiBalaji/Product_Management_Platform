/**
 * AI PRD Synthesis Generator (Phase 12)
 *
 * Synthesizes a structured Product Requirements Document (PRD v1.0)
 * from project executive intent, description, and Phase 9 creation deliberation messages.
 *
 * Implements injectable AI client pattern matching Phase 4, 10, and 11.
 */

let defaultAiGenerator;
try {
  defaultAiGenerator = require("../routes/ai").generateWithRotatingModels;
} catch {
  defaultAiGenerator = null;
}

/**
 * Safely parse JSON from AI responses (stripping markdown code fences if present).
 */
function parseAiPrdJson(raw) {
  if (typeof raw === "object" && raw !== null) return raw;
  if (!raw || typeof raw !== "string") return {};

  let clean = raw.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*"executive_summary"[\s\S]*\}/);
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
 * generatePRDSynthesis(projectContext, creationMessages = [], aiClient = defaultAiGenerator)
 *
 * @param {Object} projectContext - { title, description, executive_intent, priority }
 * @param {Array<Object>} [creationMessages=[]] - Phase 9 deliberation messages [{ author_name, author_role_at_time, content }]
 * @param {Function} [aiClient] - Optional injectable async (prompt) => string|object
 * @returns {Promise<Object>}
 */
async function generatePRDSynthesis(
  projectContext = {},
  creationMessages = [],
  aiClient = defaultAiGenerator
) {
  const fallbackPrd = {
    executive_summary:
      projectContext.executive_intent ||
      projectContext.description ||
      `Product Requirements Document for ${projectContext.title || "Project"}.`,
    scope_in: [
      "Core functionality as outlined in initial executive intent.",
      "Prerequisite architecture and technical milestones.",
    ],
    scope_out: [
      "Post-v1 enhancements and non-essential third-party integrations.",
    ],
    user_stories: [
      {
        story: `Enable users to execute core workflows for ${projectContext.title || "the initiative"}`,
        given: "User is authenticated with valid role permissions",
        when: "User accesses the feature subsystem",
        then: "Workflow completes successfully meeting Definition-of-Done criteria",
      },
    ],
    technical_architecture:
      "Modular full-stack service architecture leveraging React 19 frontend, Express 5 REST API, and MongoDB with role-guarded endpoints.",
  };

  if (!aiClient) {
    return fallbackPrd;
  }

  try {
    const messagesText = (creationMessages || [])
      .map(
        (m) =>
          `[${m.author_name || "User"} (${m.author_role_at_time || "expert"})]: ${m.content || ""}`
      )
      .join("\n");

    const prompt = `You are an elite Autonomous Project Management Lead Product Architect.
Synthesize a formal Product Requirements Document (PRD v1.0) for the following project:

PROJECT DETAILS:
- Title: ${projectContext.title || "Project"}
- Priority: ${projectContext.priority || "P1"}
- Executive Intent / Description:
${projectContext.executive_intent || projectContext.description || "N/A"}

PRE-EXECUTION CREATION DELIBERATION & SME CONSULTATION CHAT:
${messagesText || "No deliberation messages recorded."}

Generate a comprehensive, concrete, and structured PRD with:
1. "executive_summary": Concise 2-4 sentence executive summary of problem, solution, and primary outcome.
2. "scope_in": Array of 3 to 6 explicit features/capabilities included in this release.
3. "scope_out": Array of 2 to 4 explicit boundaries or deferred items NOT in this release.
4. "user_stories": Array of 3 to 5 BDD user stories, each an object:
   {
     "story": "As a [role], I want [capability] so that [benefit]",
     "given": "Preconditions",
     "when": "Action taken",
     "then": "Expected measurable outcome"
   }
5. "technical_architecture": Clear description of key technical components, data flows, APIs, and security/state considerations.

Respond with ONLY a raw JSON object conforming strictly to this format:
{
  "executive_summary": "...",
  "scope_in": ["...", "..."],
  "scope_out": ["...", "..."],
  "user_stories": [
    { "story": "...", "given": "...", "when": "...", "then": "..." }
  ],
  "technical_architecture": "..."
}`;

    const rawResponse = await aiClient(prompt);
    const parsed = parseAiPrdJson(rawResponse);

    if (!parsed || !parsed.executive_summary) {
      return fallbackPrd;
    }

    return {
      executive_summary: String(parsed.executive_summary || fallbackPrd.executive_summary),
      scope_in: Array.isArray(parsed.scope_in) && parsed.scope_in.length > 0 ? parsed.scope_in : fallbackPrd.scope_in,
      scope_out: Array.isArray(parsed.scope_out) && parsed.scope_out.length > 0 ? parsed.scope_out : fallbackPrd.scope_out,
      user_stories: Array.isArray(parsed.user_stories) && parsed.user_stories.length > 0 ? parsed.user_stories : fallbackPrd.user_stories,
      technical_architecture: String(parsed.technical_architecture || fallbackPrd.technical_architecture),
    };
  } catch (err) {
    console.warn("generatePRDSynthesis encountered an error (safe fallback):", err.message);
    return fallbackPrd;
  }
}

module.exports = {
  generatePRDSynthesis,
  parseAiPrdJson,
};
