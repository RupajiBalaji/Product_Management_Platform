import { GoogleGenAI } from "@google/genai";
import { apiFetch } from "@/lib/db";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenAI({ apiKey: API_KEY || "DUMMY_KEY" });

// Rotating active models pool
const ROTATING_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

let currentModelIdx = 0;

async function runGeminiWithRotation(prompt: string): Promise<string> {
  const poolLen = ROTATING_MODELS.length;
  let lastErr = null;

  for (let attempt = 0; attempt < poolLen; attempt++) {
    const candidateIdx = (currentModelIdx + attempt) % poolLen;
    const modelName = ROTATING_MODELS[candidateIdx];

    try {
      const response = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      if (response?.text) {
        currentModelIdx = (candidateIdx + 1) % poolLen;
        return response.text;
      }
    } catch (err: any) {
      console.warn(`[Gemini Client] Model ${modelName} failed or quota hit, rotating...`, err?.message || err);
      lastErr = err;
    }
  }

  throw lastErr || new Error("All Gemini models in rotation pool failed or exhausted quota.");
}

export async function generateAISummary(prompt: string): Promise<string> {
  // First attempt backend server rotation engine
  try {
    const data = await apiFetch("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ question: prompt }),
    });
    if (data?.answer) return data.answer;
  } catch {
    // Fall back to direct client-side rotation if backend is unreachable
  }

  try {
    return await runGeminiWithRotation(prompt);
  } catch (err) {
    console.error("Gemini error:", err);
    return "AI summary could not be generated. Please verify your GEMINI_API_KEY.";
  }
}

export async function askProjectAI(question: string, context: string): Promise<string> {
  // First attempt backend server rotation engine
  try {
    const data = await apiFetch("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ question, context }),
    });
    if (data?.answer) return data.answer;
  } catch {
    // Fall back to direct client-side rotation if backend is unreachable
  }

  const systemPrompt = `You are an intelligent project management assistant.
Context:
${context}

Question: ${question}`;

  try {
    return await runGeminiWithRotation(systemPrompt);
  } catch (err) {
    console.error("Gemini error:", err);
    return "Unable to process your question. Please verify your GEMINI_API_KEY.";
  }
}
