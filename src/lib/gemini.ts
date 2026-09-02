import { apiFetch } from "@/lib/db";

/**
 * Generate AI Summary for PM insights by delegating directly to the secure backend server.
 * The API key is stored exclusively in the server environment (Render / .env) and never in code or browser.
 */
export async function generateAISummary(prompt: string): Promise<string> {
  try {
    const data = await apiFetch("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ question: prompt }),
    });
    return data?.answer || "No response generated from AI.";
  } catch (err: any) {
    console.error("AI service error:", err);
    return err?.message || "AI service is currently unavailable. Please verify your server GEMINI_API_KEY.";
  }
}

/**
 * Omnipresent project AI Q&A assistant.
 * Securely delegates question and context to the server's rotating models engine.
 */
export async function askProjectAI(question: string, context?: string): Promise<string> {
  try {
    const data = await apiFetch("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ question, context }),
    });
    return data?.answer || "No response received.";
  } catch (err: any) {
    console.error("AI service error:", err);
    return err?.message || "AI service failed to respond. Please verify GEMINI_API_KEY in server environment.";
  }
}
