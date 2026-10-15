// Maps a JARVIS orchestrator result to the compact, widget-friendly JSON the Android companion expects.
const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%\/?#\[\]]*$/;      // relative paths only — never an absolute URL
const safePath = (p) => (typeof p === "string" && p.length < 300 && SAFE_PATH.test(p) ? p : null);

function slimCard(c) {
  if (!c || typeof c !== "object") return null;
  if (c.type === "list") return { type: "list", title: String(c.title || "").slice(0, 160), items: (c.items || []).slice(0, 8).map((i) => ({ text: String(i.text || "").slice(0, 160), sub: i.sub ? String(i.sub).slice(0, 120) : "" })), note: c.note ? String(c.note).slice(0, 120) : "" };
  return { type: "record", title: String(c.title || "").slice(0, 160), lines: (c.lines || []).slice(0, 6).map((l) => String(l).slice(0, 200)) };
}
function pickOpenPath(r) {
  for (const c of r.cards || []) { const p = safePath(c?.links?.[0]?.href); if (p) return p; }
  for (const c of r.cards || []) { const p = safePath(c?.items?.[0]?.href); if (p) return p; }
  if ((r.clientActions || []).some((a) => a.type === "focus")) return "/focus?start=1";
  return null;
}
export function toMobile(r) {
  const question = r.type === "clarify" || (r.type === "answer" && /\?\s*$/.test(r.text || ""));
  const status = r.type === "error" ? "error" : r.type === "confirm" ? "confirm" : question ? "question" : "ok";
  // `summary` is intentionally generic (no amounts/names) — it is what the home-screen widget may show.
  const summary = { ok: "Answer ready", question: "JARVIS has a question", confirm: "Confirmation needed", error: r.code === "QUOTA" ? "AI quota reached" : r.code === "NO_KEY" ? "AI not set up" : "Something went wrong" }[status];
  let text = String(r.text || "").slice(0, 1200);
  if ((r.clientActions || []).some((a) => a.type === "focus")) text += "\n\nOpen Lucifer OS to run the focus timer (timers live in the app).";
  return { ok: status !== "error", status, text, summary, cards: (r.cards || []).map(slimCard).filter(Boolean).slice(0, 4), openPath: pickOpenPath(r), confirm: r.confirm ? { token: r.confirm.token } : null, via: r.via || null, code: r.code || null };
}
