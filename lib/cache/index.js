import "server-only";
import { createCache, createMemoryBackend } from "@/lib/cache/core";
import { createUpstashBackend } from "@/lib/cache/upstash";
import { requireUserId } from "@/lib/auth";

// Provider selection (server-only env; nothing here is ever sent to the browser):
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  → Upstash (shared by all serverless instances)
//   neither, NODE_ENV != production                    → in-process memory (dev convenience; NOT shared across instances)
//   neither, production                                → cache OFF (an unshared per-instance cache could serve stale data)
//   CACHE_DISABLED=1                                   → cache OFF regardless (instant kill switch)
function build() {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const debug = process.env.CACHE_DEBUG === "1" || process.env.NODE_ENV !== "production";
  const log = debug ? (ev, d) => console.debug("[cache]", ev, d ? JSON.stringify(d) : "") : (ev, d) => ev === "breaker-open" && console.warn("[cache] Redis unreachable/limited — falling back to the database", d?.code || "");
  if (process.env.CACHE_DISABLED === "1") return createCache({ mode: "off", enabled: false, log });
  if (url && token && /^https?:\/\//.test(url)) return createCache({ backend: createUpstashBackend({ url, token, timeoutMs: Number(process.env.CACHE_TIMEOUT_MS) || 800 }), mode: "upstash", log, breaker: { baseMs: Number(process.env.CACHE_BREAKER_BASE_MS) || 30_000 } });
  if (process.env.NODE_ENV !== "production") return createCache({ backend: createMemoryBackend(), mode: "memory", log });
  return createCache({ mode: "off", enabled: false, log });
}
export const cache = globalThis.__lo4cache || (globalThis.__lo4cache = build());

// Invalidate the signed-in user's cached reads after a successful write. Never throws; never blocks a write from succeeding.
export async function bumpCurrentUser() { try { await cache.bump(await requireUserId()); } catch { /* no session or cache unavailable — nothing to invalidate */ } }
