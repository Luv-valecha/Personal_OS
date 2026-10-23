// Redis-compatible cache core. PURE (no Next.js / env access) so every behaviour is unit-testable with fake backends.
// Redis is only a CACHE: the database stays the source of truth, and every failure path falls back to "just read the DB".
//
// Invalidation model (one cheap command per write, one pipelined round trip per read):
//   • each user has a version token  lo4:u:{uid}:ver   — any write replaces it with a fresh unique token (never repeats)
//   • each entry stores the token that was current when its LOOKUP happened, and is valid only while that token is unchanged
//   • so a write that lands while a slow request is still computing makes that request's entry instantly stale (no race)
import { createHash, randomBytes } from "node:crypto";

export class CacheError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
export const hashParams = (params) => createHash("sha256").update(stable(params ?? null)).digest("hex").slice(0, 32);

export function createMemoryBackend({ now = Date.now, maxEntries = 500 } = {}) {   // dev/test only — NOT shared between serverless instances
  const m = new Map();
  return {
    kind: "memory",
    async mget(keys) { return keys.map((k) => { const e = m.get(k); if (!e) return null; if (e.exp <= now()) { m.delete(k); return null; } return e.v; }); },
    async set(key, value, ttlSec) { if (m.size >= maxEntries && !m.has(key)) m.delete(m.keys().next().value); m.set(key, { v: value, exp: now() + ttlSec * 1000 }); },
    async del(key) { m.delete(key); },
  };
}

export function createCache({ backend, mode = "off", enabled = true, now = Date.now, log = () => {}, maxBytes = 64 * 1024, breaker = {}, prefix = "lo4" } = {}) {
  const B = { threshold: 2, baseMs: 30_000, maxMs: 300_000, ...breaker };
  const live = !!(enabled && backend);
  const stats = { hits: 0, misses: 0, stale: 0, stores: 0, bumps: 0, errors: 0, bypassed: 0, skipped: 0, malformed: 0 };
  let fails = 0, openUntil = 0, openMs = B.baseMs, lastError = null;
  const pending = new Set();                                   // users whose invalidation hasn't reached Redis yet (retried before their next read)
  const verKey = (uid) => `${prefix}:u:${uid}:ver`;
  const entryKey = (uid, ns, params) => `${prefix}:u:${uid}:${ns}:${hashParams(params)}`;
  const usable = () => live && now() >= openUntil;
  const good = () => { fails = 0; openMs = B.baseMs; };
  const bad = (e) => {                                          // quota (HTTP 429) opens the breaker at once; other errors after `threshold` in a row
    stats.errors++; lastError = e?.code || "error"; fails++;
    if (e?.code === "quota" || fails >= B.threshold) { openUntil = now() + openMs; openMs = Math.min(openMs * 2, B.maxMs); fails = 0; log("breaker-open", { code: lastError, retryMs: openUntil - now() }); }
  };
  const newToken = () => `${now().toString(36)}${randomBytes(6).toString("hex")}`;

  async function bumpNow(uid) { await backend.set(verKey(uid), newToken(), 30 * 86400); good(); stats.bumps++; pending.delete(uid); }

  return {
    mode, enabled: live,
    // → { hit:true, value } | { hit:false, token }   (never throws; any problem is just a miss)
    async lookup(uid, ns, params) {
      if (!uid || !usable()) { if (live) stats.bypassed++; return { hit: false, token: null }; }
      try {
        if (pending.has(uid)) await bumpNow(uid);               // finish a missed invalidation first; if it fails we bypass below
        const key = entryKey(uid, ns, params);
        const [ver, raw] = await backend.mget([verKey(uid), key]); good();
        const token = { uid, key, ver: ver || "0" };
        if (raw == null) { stats.misses++; return { hit: false, token }; }
        let e; try { e = JSON.parse(raw); } catch { e = null; }
        if (!e || e.v !== 1 || typeof e.ver !== "string" || !("d" in e)) { stats.malformed++; stats.misses++; return { hit: false, token }; }
        if (e.ver !== token.ver) { stats.stale++; stats.misses++; return { hit: false, token }; }
        stats.hits++; return { hit: true, value: e.d };
      } catch (e) { bad(e); stats.bypassed++; return { hit: false, token: null }; }
    },
    async store(token, value, ttlSec, opts = {}) {
      if (!token || !usable()) return false;
      const ttl = Math.min(Math.max(Math.floor(ttlSec) || 0, 1), 3600);   // always bounded
      let str; try { str = JSON.stringify({ v: 1, ver: token.ver, at: now(), d: value }); } catch { stats.skipped++; return false; }
      if (str.length > (opts.maxBytes || maxBytes)) { stats.skipped++; return false; }
      try { await backend.set(token.key, str, ttl); good(); stats.stores++; return true; } catch (e) { bad(e); return false; }
    },
    // Called after every successful DB write. NEVER throws and never fails the write: if Redis can't be reached the user is
    // remembered and invalidated before their next cached read; meanwhile staleness is bounded by the entry TTL.
    async bump(uid) {
      if (!live || !uid) return false;
      if (!usable()) { if (pending.size < 1000) pending.add(uid); return false; }
      try { await bumpNow(uid); return true; } catch (e) { bad(e); if (pending.size < 1000) pending.add(uid); return false; }
    },
    // read-through helper: cached(uid, ns, params, ttl, loader)
    async cached(uid, ns, params, ttlSec, loader, opts) {
      const r = await this.lookup(uid, ns, params); if (r.hit) return r.value;
      const v = await loader(); await this.store(r.token, v, ttlSec, opts); return v;
    },
    async probe(uid) {                                          // connectivity check (3 commands) — used by /api/cache/status?probe=1
      if (!live) return { ok: false, reason: "disabled" };
      const t0 = now(); const k = `${prefix}:u:${uid}:probe`;
      try { await backend.set(k, "1", 30); const [v] = await backend.mget([k]); await backend.del?.(k); return { ok: v === "1", ms: now() - t0 }; } catch (e) { return { ok: false, reason: e?.code || "error" }; }
    },
    snapshot() { return { mode, enabled: live, breaker: { open: live && now() < openUntil, retryInMs: Math.max(0, openUntil - now()), lastError }, pendingInvalidations: pending.size, ...stats }; },
  };
}
