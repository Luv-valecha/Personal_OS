import { NextResponse } from "next/server";
import { requireUserId, rateLimit } from "@/lib/auth";
import { runJarvis, LIMITS } from "@/lib/jarvis/orchestrator";
import { geminiConfigured, geminiModel } from "@/lib/jarvis/provider";
import { getSettings, getTz, getToday } from "@/lib/server-utils";

// Idempotency: the same requestId from the same user returns the first result instead of executing twice.
const seen = new Map();
const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  try { await requireUserId(); return json({ configured: geminiConfigured(), model: geminiConfigured() ? geminiModel() : null }); }
  catch { return json({ error: "Unauthorized" }, 401); }
}

export async function POST(req) {
  let uid; try { uid = await requireUserId(); } catch { return json({ error: "Unauthorized" }, 401); }
  if (!rateLimit(`jarvis:${uid}`, 15, 60 * 1000) || !rateLimit(`jarvis-day:${uid}`, 300, 24 * 60 * 60 * 1000)) return json({ type: "error", code: "RATE", text: "You're sending requests too quickly. Wait a moment and try again.", cards: [] }, 429);
  let body; try { body = await req.json(); } catch { return json({ type: "error", text: "Bad request.", cards: [] }, 400); }
  const message = typeof body?.message === "string" ? body.message : ""; if (message.length > LIMITS.message * 2) return json({ type: "error", text: `Message is too long (max ${LIMITS.message} characters).`, cards: [] }, 413);
  const history = Array.isArray(body?.history) ? body.history.slice(-LIMITS.history).filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.text === "string") : [];
  const rid = typeof body?.requestId === "string" ? `${uid}:${body.requestId.slice(0, 64)}` : null;
  if (rid && seen.has(rid)) return json(await seen.get(rid));
  const work = (async () => {
    const [tz, today, settings] = [await getTz(), await getToday(), await getSettings(uid)];
    try { return await runJarvis({ message, history, confirmToken: typeof body?.confirmToken === "string" ? body.confirmToken : null, ctx: { uid, tz, today, settings } }); }
    catch (e) { if (e?.message === "UNAUTHENTICATED") return { type: "error", text: "Your session expired. Please sign in again.", cards: [] }; console.error("[jarvis route]", e?.message); return { type: "error", text: "Something went wrong.", cards: [] }; }
  })();
  if (rid) { seen.set(rid, work); setTimeout(() => seen.delete(rid), 60000); if (seen.size > 500) seen.clear(); }
  return json(await work);
}
