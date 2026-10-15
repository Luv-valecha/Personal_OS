import "server-only";
import crypto from "node:crypto";
import { query, one } from "@/lib/db";
import { rateLimit } from "@/lib/auth";

const PATTERN = /^lo_[A-Za-z0-9_-]{43}$/;
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
export const MAX_ACTIVE_TOKENS = 10;

export async function createApiToken(uid, name) {
  const n = String(name || "").trim().slice(0, 60); if (!n) throw Object.assign(new Error("Give the device a name"), { expected: true });
  const active = await one("SELECT count(*)::int AS n FROM api_tokens WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now()", [uid]);
  if (active.n >= MAX_ACTIVE_TOKENS) throw Object.assign(new Error(`You already have ${MAX_ACTIVE_TOKENS} linked devices. Revoke one first.`), { expected: true });
  const token = "lo_" + crypto.randomBytes(32).toString("base64url");
  const row = await one("INSERT INTO api_tokens(user_id, name, token_hash) VALUES($1,$2,$3) RETURNING id, name, created_at, expires_at", [uid, n, hash(token)]);
  return { token, row };   // `token` is returned to the caller once; only its hash is stored
}

// Returns {uid, tokenId, name, expiresAt} for a valid, unexpired, unrevoked token — otherwise null.
export async function verifyApiToken(token, ip = "?") {
  if (!rateLimit(`apitoken-fail:${ip}`, 60, 60 * 1000)) return { limited: true };
  if (typeof token !== "string" || !PATTERN.test(token)) return null;
  const r = await one("SELECT id, user_id, name, expires_at, last_used_at FROM api_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now() AND scope='jarvis'", [hash(token)]);
  if (!r) return null;
  if (!r.last_used_at || Date.now() - new Date(r.last_used_at).getTime() > 5 * 60 * 1000) await query("UPDATE api_tokens SET last_used_at=now() WHERE id=$1", [r.id]);  // throttled write
  return { uid: r.user_id, tokenId: r.id, name: r.name, expiresAt: r.expires_at };
}
export const listApiTokens = (uid) => query("SELECT id, name, created_at, expires_at, last_used_at, revoked_at FROM api_tokens WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50", [uid]);
export const revokeApiToken = (uid, id) => one("UPDATE api_tokens SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id", [id, uid]);
export const revokeById = (id) => query("UPDATE api_tokens SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL", [id]);
