// Upstash Redis over its REST API (HTTP) — no connection pool, works on Vercel serverless. Zero dependencies.
// Protocol (official docs): POST <url> with a JSON array ["GET","key"], header "Authorization: Bearer <token>"; reply {result}|{error}.
// POST <url>/pipeline with [[cmd...],[cmd...]] → array of {result}|{error} in order. HTTP 429 = quota/rate exceeded.
import { CacheError } from "@/lib/cache/core";

export function createUpstashBackend({ url, token, timeoutMs = 800, fetchImpl = globalThis.fetch }) {
  const base = String(url).replace(/\/+$/, "");
  async function call(path, body) {
    let res;
    try { res = await fetchImpl(base + path, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs), cache: "no-store" }); }
    catch (e) { throw new CacheError(e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "network"); }
    if (res.status === 429) throw new CacheError("quota", "Upstash rate/quota limit reached");
    if (!res.ok) throw new CacheError("http", `Upstash HTTP ${res.status}`);          // never include the body/token in messages
    try { return await res.json(); } catch { throw new CacheError("parse"); }
  }
  return {
    kind: "upstash",
    async mget(keys) {                                          // one HTTP request, N independent GETs
      const out = await call("/pipeline", keys.map((k) => ["GET", k]));
      if (!Array.isArray(out) || out.length !== keys.length) throw new CacheError("parse");
      return out.map((r) => { if (r?.error) throw new CacheError("redis"); return r?.result ?? null; });
    },
    async set(key, value, ttlSec) { const r = await call("/", ["SET", key, value, "EX", String(ttlSec)]); if (r?.error || r?.result !== "OK") throw new CacheError("redis"); },
    async del(key) { const r = await call("/", ["DEL", key]); if (r?.error) throw new CacheError("redis"); },
  };
}
