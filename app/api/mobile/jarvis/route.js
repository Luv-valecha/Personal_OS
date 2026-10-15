import { authenticateMobile, mjson } from "@/lib/mobile-auth";
import { runAsUser } from "@/lib/request-context";
import { rateLimit } from "@/lib/auth";
import { runJarvis, LIMITS } from "@/lib/jarvis/orchestrator";
import { toMobile } from "@/lib/mobile-response";
import { getSettings } from "@/lib/server-utils";
import { DEFAULT_TZ, todayStr } from "@/lib/dates";

// POST /api/mobile/jarvis — the SAME JARVIS orchestrator/tools/ownership checks as the website, reached with a Bearer token.
// The acting user comes ONLY from the verified token (never from the request body).
const seen = new Map();                       // idempotency: same requestId from the same user → first result, executed once
const okTz = (tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; } };

export async function POST(req) {
  const { auth, res } = await authenticateMobile(req); if (res) return res; const uid = auth.uid;
  if (!rateLimit(`jarvis:${uid}`, 15, 60 * 1000) || !rateLimit(`jarvis-day:${uid}`, 300, 24 * 60 * 60 * 1000)) return mjson({ ok: false, status: "error", code: "RATE", text: "Too many requests. Wait a moment and try again.", summary: "Too many requests", cards: [] }, 429);
  let body; try { body = await req.json(); } catch { return mjson({ ok: false, status: "error", text: "Bad request.", cards: [] }, 400); }
  const message = typeof body?.message === "string" ? body.message : ""; if (message.length > LIMITS.message * 2) return mjson({ ok: false, status: "error", text: `Message is too long (max ${LIMITS.message} characters).`, cards: [] }, 413);
  const history = Array.isArray(body?.history) ? body.history.slice(-LIMITS.history).filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.text === "string") : [];
  const rid = typeof body?.requestId === "string" && body.requestId ? `${uid}:${body.requestId.slice(0, 64)}` : null;
  if (rid && seen.has(rid)) return mjson(await seen.get(rid));
  const tz = okTz(typeof body?.tz === "string" ? body.tz.slice(0, 60) : DEFAULT_TZ);
  const work = runAsUser(uid, async () => {
    try {
      const settings = await getSettings(uid);
      const r = await runJarvis({ message, history, confirmToken: typeof body?.confirmToken === "string" ? body.confirmToken : null, ctx: { uid, tz, today: todayStr(tz), settings } });
      return toMobile(r);
    } catch (e) { console.error("[mobile jarvis]", e?.message); return toMobile({ type: "error", text: "Something went wrong on the server.", cards: [] }); }
  });
  if (rid) { seen.set(rid, work); setTimeout(() => seen.delete(rid), 60000); if (seen.size > 500) seen.clear(); }
  return mjson(await work);
}
