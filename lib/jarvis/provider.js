import "server-only";
import { JarvisError } from "@/lib/jarvis/errors";

// Replaceable AI provider. The orchestrator only calls `generate({system, contents, tools})` and expects
// {parts:[{text}|{functionCall:{name,args}}]} back — swap this file to use another model/provider.
// Server-only: the API key never reaches the browser, is never logged, and is never returned in responses.
export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;
export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function generate({ system, contents, tools }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new JarvisError("NO_KEY", "JARVIS AI isn't configured (no GEMINI_API_KEY).");
  const base = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  let res;
  try {
    res = await fetch(`${base}/models/${encodeURIComponent(geminiModel())}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS) || 20000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] }, contents,
        tools: [{ functionDeclarations: tools }], toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        generationConfig: { temperature: 0.2, maxOutputTokens: 900 },
      }),
    });
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") throw new JarvisError("TIMEOUT", "The AI took too long to respond. Try again.");
    throw new JarvisError("NETWORK", "Couldn't reach the AI service.");
  }
  if (!res.ok) {
    let msg = ""; try { msg = (await res.json())?.error?.message || ""; } catch {}
    if (res.status === 429) throw new JarvisError("QUOTA", "The free AI quota is used up for now. Try again later — basic commands (e.g. “add task: …”) still work.");
    if (res.status === 404) throw new JarvisError("MODEL", `The model “${geminiModel()}” isn't available. Set GEMINI_MODEL to a current model.`);
    if (res.status === 400 && /api key/i.test(msg)) throw new JarvisError("BAD_KEY", "The Gemini API key is invalid.");
    if (res.status === 401 || res.status === 403) throw new JarvisError("BAD_KEY", "The Gemini API key was rejected (invalid or not permitted).");
    throw new JarvisError("PROVIDER", `The AI service returned an error (${res.status}).`);
  }
  let json; try { json = await res.json(); } catch { throw new JarvisError("MALFORMED", "The AI returned an unreadable response."); }
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) throw new JarvisError("MALFORMED", json?.promptFeedback?.blockReason ? "The AI declined that request." : "The AI returned an empty response.");
  return { parts };
}
