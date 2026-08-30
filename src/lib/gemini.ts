import { GoogleGenAI } from "@google/genai";

const API_KEY = "your_gemini_api_key_here";
const genAI = new GoogleGenAI({ apiKey: API_KEY });

const MODELS = ["gemini-3.5-flash-lite", "gemini-2.5-flash-lite", "gemini-1.5-flash-latest", "gemini-1.5-flash"];

async function runGeminiWithFallback(prompt: string): Promise<string> {
  let lastErr = null;
  for (const modelName of MODELS) {
    try {
      const response = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      if (response?.text) return response.text;
    } catch (err) {
      console.warn(`[Gemini Client] Model ${modelName} failed, trying fallback...`, err);
      lastErr = err;
    }
  }
  throw lastErr || new Error("Failed to generate response across all Gemini models.");
}

export async function generateAISummary(prompt: string): Promise<string> {
  try {
    return await runGeminiWithFallback(prompt);
  } catch (err) {
    console.error("Gemini error:", err);
    return "AI summary could not be generated. Please try again.";
  }
}

export async function askProjectAI(question: string, context: string): Promise<string> {
  const systemPrompt = `You are an intelligent project management assistant for a team management platform.
You have access to the following project and employee data context:

${context}

Answer the following question based strictly on the project data above. Be concise, clear, and data-driven.
If something is not in the data, say so honestly.

Question: ${question}`;

  try {
    return await runGeminiWithFallback(systemPrompt);
  } catch (err) {
    console.error("Gemini error:", err);
    return "Unable to process your question. Please try again.";
  }
}
