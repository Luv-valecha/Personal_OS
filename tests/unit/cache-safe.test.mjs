// The real safe() wrapper + real singleton cache (memory backend in test): proves writes invalidate and reads don't.
import test, { before } from "node:test"; import assert from "node:assert/strict"; import { SignJWT } from "jose";
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "x".repeat(40); process.env.CACHE_DEBUG = "0";
let safe, cache, fail; const UID = "33333333-3333-3333-3333-333333333333";
before(async () => {
  process.env.TEST_SESSION = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(UID).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  ({ safe, fail } = await import("@/lib/crud")); ({ cache } = await import("@/lib/cache/index"));
});
const bumps = () => cache.snapshot().bumps;
test("successful action → user's cache is invalidated", async () => { const b = bumps(); const r = await safe(async () => 1); assert.equal(r.ok, true); assert.equal(bumps(), b + 1); });
test("read-only action ({read:true}) does NOT invalidate", async () => { const b = bumps(); await safe(async () => 1, { read: true }); assert.equal(bumps(), b); });
test("validation/expected failures do NOT invalidate (nothing was written)", async () => { const b = bumps(); const r = await safe(async () => { throw fail("nope"); }); assert.equal(r.ok, false); assert.equal(bumps(), b); });
test("unexpected failure DOES invalidate (it may have written part-way) and still returns a truthful error", async () => { const b = bumps(); const r = await safe(async () => { throw new Error("db exploded"); }); assert.equal(r.ok, false); assert.match(r.error, /went wrong/); assert.equal(bumps(), b + 1); });
test("end to end with the real cache: a cached answer dies after a safe() write", async () => {
  const l = await cache.lookup(UID, "jarvis", { q: "x" }); await cache.store(l.token, { type: "answer", text: "old" }, 60); assert.equal((await cache.lookup(UID, "jarvis", { q: "x" })).hit, true);
  await safe(async () => 1); assert.equal((await cache.lookup(UID, "jarvis", { q: "x" })).hit, false);
});
