import "server-only";
import crypto from "node:crypto";
// Signed, short-lived confirmation tokens: the browser can only confirm exactly what the server previewed, for the same user.
const secret = () => { const s = process.env.AUTH_SECRET; if (!s || s.length < 32) throw new Error("AUTH_SECRET missing"); return s; };
const b64 = (b) => Buffer.from(b).toString("base64url");
export function signConfirm(uid, tool, args, ttlMs = 5 * 60 * 1000) {
  const body = b64(JSON.stringify({ u: uid, t: tool, a: args, e: Date.now() + ttlMs }));
  return `${body}.${crypto.createHmac("sha256", secret()).update(body).digest("base64url")}`;
}
export function verifyConfirm(uid, token) {
  const [body, sig] = String(token || "").split("."); if (!body || !sig) return null;
  const good = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(good); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); if (p.u !== uid || p.e < Date.now()) return null; return { tool: p.t, args: p.a }; } catch { return null; }
}
