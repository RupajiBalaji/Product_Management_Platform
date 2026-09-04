/**
 * Phase 4 — QA Definition-of-Done Evaluator
 * Supports Dual Evaluation Modes:
 *   - Objective: Automated validation against acceptance criteria via Gemini AI.
 *   - Subjective: Light structural sanity check only, always queues for human sign-off.
 */

const { generateWithRotatingModels } = require("../routes/ai");
const { Project, Task } = require("../models/models");
const DynamicRole = require("../models/DynamicRole");

/**
 * Validates link structure based on artifact type
 */
function checkStructuralValidity(artifactUrl, artifactType) {
  if (!artifactUrl || typeof artifactUrl !== "string") {
    return { valid: false, issue: "Artifact link or content is missing." };
  }

  const trimmed = artifactUrl.trim();
  if (trimmed.length === 0) {
    return { valid: false, issue: "Artifact link cannot be empty." };
  }

  switch (artifactType) {
    case "figma_link":
      if (!trimmed.toLowerCase().includes("figma.com")) {
        return { valid: false, issue: "Expected a valid Figma design URL (e.g. https://figma.com/file/...)" };
      }
      break;

    case "pr_link":
      if (
        !trimmed.toLowerCase().includes("github.com") &&
        !trimmed.toLowerCase().includes("gitlab.com") &&
        !trimmed.toLowerCase().includes("bitbucket.org") &&
        !trimmed.toLowerCase().includes("pr")
      ) {
        return { valid: false, issue: "Expected a Pull Request URL (GitHub, GitLab, or Bitbucket)" };
      }
      break;

    case "text":
      if (trimmed.length < 15) {
        return { valid: false, issue: "Written artifact is too short (must be at least 15 characters)" };
      }
      break;

    case "file":
      if (trimmed.length < 4) {
        return { valid: false, issue: "Invalid file reference or storage link." };
      }
      break;

    default:
      if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://") && trimmed.length < 10) {
        return { valid: false, issue: "Artifact link format is unrecognized." };
      }
      break;
  }

  return { valid: true };
}

/**
 * Extracts and cleans JSON from AI response text (handles markdown fences).
 */
function parseAiVerdictJson(rawText) {
  if (!rawText) throw new Error("Empty response from AI engine");

  let cleaned = rawText.trim();
  // Strip markdown code fences if returned
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  // Find first { and last }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

/**
 * Core QA evaluation engine
 *
 * @param {Object} submission - Mongoose Submission document
 * @param {Object} [task] - Optional pre-loaded Task document
 * @param {Object} [prd] - Optional PRD / Acceptance criteria
 * @param {Function} [geminiGenerator] - Optional custom or stub generator for testing
 */
async function evaluateSubmission(submission, task = null, prd = null, geminiGenerator = null) {
  try {
    // 1. Resolve task if not provided
    let taskDoc = task;
    if (!taskDoc && submission.task_id) {
      taskDoc = await Task.findById(submission.task_id).populate("project_id").lean();
    }

    // 2. Resolve evaluation mode
    let mode = submission.evaluation_mode;
    if (!mode && taskDoc?.project_id) {
      const project = typeof taskDoc.project_id === "object" ? taskDoc.project_id : await Project.findById(taskDoc.project_id).lean();
      const alloc = (project?.team_allocations || []).find((a) => String(a.user_id) === String(submission.employee_id));
      if (alloc?.role_id) {
        const dynamicRole = await DynamicRole.findById(alloc.role_id).lean();
        if (dynamicRole?.evaluationMode) {
          mode = dynamicRole.evaluationMode;
        }
      }
    }
    mode = mode === "subjective" ? "subjective" : "objective";
    submission.evaluation_mode = mode;

    // ──────────────────────────────────────────────────────────────────────────
    // OBJECTIVE MODE — AI automated acceptance criteria validation
    // ──────────────────────────────────────────────────────────────────────────
    if (mode === "objective") {
      const criteria = prd?.acceptanceCriteria || taskDoc?.description || taskDoc?.title || "Completion of deliverable";
      
      const prompt = `You are a strict QA Definition-of-Done evaluator for a high-velocity software engineering platform.
Evaluate whether the developer's submitted artifact satisfies the task requirements.

TASK TITLE: ${taskDoc?.title || "Assigned Task"}
ACCEPTANCE CRITERIA / REQUIREMENTS:
${criteria}

SUBMITTED ARTIFACT:
- Type: ${submission.artifact_type}
- URL / Reference: ${submission.artifact_url}

INSTRUCTIONS:
Examine whether the submission provides proof of completion.
Return ONLY a valid JSON object with EXACTLY this structure (no markdown fences, no extra text):
{
  "passed": true or false,
  "missing_items": ["Array of specific missing criteria or deliverables if not passed, or empty if passed"],
  "reasoning": "Concise 1-3 sentence explanation of the verdict"
}`;

      const aiCall = geminiGenerator || generateWithRotatingModels;
      let rawResponse;

      try {
        rawResponse = await aiCall(prompt);
      } catch (geminiErr) {
        console.error("⚠️ [QA Evaluator] Gemini evaluation failed:", geminiErr.message);
        // Fallback: land in pending_review so work isn't lost or silently approved
        submission.status = "pending_review";
        submission.ai_verdict = {
          passed: null,
          missing_items: ["AI evaluation unavailable"],
          reasoning: "AI evaluation unavailable, manual review required: " + geminiErr.message,
        };
        await submission.save();
        return submission;
      }

      let parsed;
      try {
        parsed = parseAiVerdictJson(rawResponse);
      } catch (parseErr) {
        // If parsing fails, land in pending_review
        submission.status = "pending_review";
        submission.ai_verdict = {
          passed: null,
          missing_items: ["Could not parse structured AI verdict"],
          reasoning: "AI evaluation returned unstructured response, manual review required.",
        };
        await submission.save();
        return submission;
      }

      const passed = Boolean(parsed.passed);
      const missingItems = Array.isArray(parsed.missing_items) ? parsed.missing_items : [];
      const reasoning = parsed.reasoning || (passed ? "All acceptance criteria verified." : "Missing required deliverables.");

      if (passed) {
        submission.status = "approved";
        submission.ai_verdict = {
          passed: true,
          missing_items: [],
          reasoning,
        };
      } else {
        submission.status = "rejected";
        submission.rejection_count = (submission.rejection_count || 0) + 1;
        submission.ai_verdict = {
          passed: false,
          missing_items: missingItems.length > 0 ? missingItems : ["Acceptance criteria requirements incomplete"],
          reasoning,
        };
      }

      await submission.save();
      return submission;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUBJECTIVE MODE — Structural checks only, ALWAYS requires human sign-off
    // ──────────────────────────────────────────────────────────────────────────
    if (mode === "subjective") {
      const structural = checkStructuralValidity(submission.artifact_url, submission.artifact_type);

      const missingItems = structural.valid ? [] : [structural.issue];
      const reasoning = structural.valid
        ? "Structural validation passed. Awaiting human sign-off from Product Lead / Lead Architect for design and creative quality."
        : `Structural check flagged issues: ${structural.issue}. Awaiting Product Lead / Lead Architect review.`;

      // Subjective submissions ALWAYS land in pending_review
      submission.status = "pending_review";
      submission.ai_verdict = {
        passed: structural.valid,
        missing_items: missingItems,
        reasoning,
      };

      await submission.save();
      return submission;
    }

    await submission.save();
    return submission;
  } catch (err) {
    console.error("❌ [QA Evaluator] Error during evaluation:", err);
    submission.status = "pending_review";
    submission.ai_verdict = {
      passed: null,
      missing_items: ["Evaluation engine error"],
      reasoning: "Evaluation failed unexpectedly, manual review required: " + (err.message || String(err)),
    };
    await submission.save();
    return submission;
  }
}

module.exports = {
  evaluateSubmission,
  checkStructuralValidity,
  parseAiVerdictJson,
};
