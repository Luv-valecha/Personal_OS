import test from "node:test"; import assert from "node:assert/strict";
import { createCache, createMemoryBackend, hashParams, CacheError } from "@/lib/cache/core";
const mk = (o = {}) => { const t = { v: 1_000_000 }; const now = () => t.v; const backend = o.backend || createMemoryBackend({ now }); return { t, backend, c: createCache({ backend, mode: "memory", now, ...o }) }; };
const failing = (code = "network") => { const calls = { n: 0 }; return { calls, kind: "fail", async mget() { calls.n++; throw new CacheError(code); }, async set() { calls.n++; throw new CacheError(code); }, async del() { calls.n++; throw new CacheError(code); } }; };

test("miss, then hit after store", async () => {
  const { c } = mk(); let r = await c.lookup("u1", "jarvis", { q: "x" }); assert.equal(r.hit, false);
  await c.store(r.token, { text: "hello" }, 60); r = await c.lookup("u1", "jarvis", { q: "x" }); assert.deepEqual([r.hit, r.value], [true, { text: "hello" }]);
  assert.deepEqual([c.snapshot().hits, c.snapshot().misses, c.snapshot().stores], [1, 1, 1]);
});
test("TTL expiry", async () => { const { c, t } = mk(); const r = await c.lookup("u", "n", 1); await c.store(r.token, "v", 10); t.v += 9_000; assert.equal((await c.lookup("u", "n", 1)).hit, true); t.v += 2_000; assert.equal((await c.lookup("u", "n", 1)).hit, false); });
test("TTL is always bounded (0/negative/huge are clamped)", async () => { const seen = []; const b = createMemoryBackend(); const set = b.set; b.set = async (k, v, ttl) => { seen.push(ttl); return set(k, v, ttl); };
  const { c } = mk({ backend: b }); const r = await c.lookup("u", "n", 1); for (const x of [0, -5, 1e9, NaN]) await c.store(r.token, "v", x); assert.ok(seen.every((x) => x >= 1 && x <= 3600), seen.join()); });
test("a write (bump) invalidates cached entries for that user", async () => {
  const { c } = mk(); const r = await c.lookup("u", "jarvis", "q"); await c.store(r.token, "old", 60);
  assert.equal((await c.lookup("u", "jarvis", "q")).hit, true); await c.bump("u"); assert.equal((await c.lookup("u", "jarvis", "q")).hit, false); assert.equal(c.snapshot().stale, 1);
});
test("RACE: a write that lands while a request is still computing makes its result instantly stale", async () => {
  const { c } = mk(); const r = await c.lookup("u", "jarvis", "q");   // request A looks up (version V1) and starts slow work…
  await c.bump("u");                                                   // …a write lands and bumps to V2…
  await c.store(r.token, "computed-before-the-write", 60);             // …A finishes and stores with V1
  assert.equal((await c.lookup("u", "jarvis", "q")).hit, false, "must not serve data computed before the write");
});
test("user isolation: same params never cross users; bumping one user leaves others cached", async () => {
  const { c } = mk(); const a = await c.lookup("A", "jarvis", "same"); await c.store(a.token, "A-data", 60);
  assert.equal((await c.lookup("B", "jarvis", "same")).hit, false);
  const b = await c.lookup("B", "jarvis", "same"); await c.store(b.token, "B-data", 60);
  assert.equal((await c.lookup("A", "jarvis", "same")).value, "A-data"); assert.equal((await c.lookup("B", "jarvis", "same")).value, "B-data");
  await c.bump("A"); assert.equal((await c.lookup("A", "jarvis", "same")).hit, false); assert.equal((await c.lookup("B", "jarvis", "same")).hit, true);
});
test("different filters → different entries; key order doesn't matter", async () => {
  assert.notEqual(hashParams({ p: "a", s: "open" }), hashParams({ p: "a", s: "done" })); assert.equal(hashParams({ a: 1, b: { y: 2, x: 1 } }), hashParams({ b: { x: 1, y: 2 }, a: 1 }));
  const { c } = mk(); const r1 = await c.lookup("u", "t", { s: "open" }); await c.store(r1.token, "OPEN", 60); assert.equal((await c.lookup("u", "t", { s: "done" })).hit, false);
});
test("malformed / wrong-shape cached values are treated as a miss, never thrown", async () => {
  const b = createMemoryBackend(); const { c } = mk({ backend: b }); const r = await c.lookup("u", "n", 1);
  for (const junk of ["not json", "{}", '{"v":2,"ver":"0","d":1}', '{"v":1,"d":1}', "null"]) { await b.set(r.token.key, junk, 60); const x = await c.lookup("u", "n", 1); assert.equal(x.hit, false, junk); }
  assert.ok(c.snapshot().malformed >= 4);
});
test("Redis down: lookups miss, stores no-op, read-through STILL returns the loader's (database) value", async () => {
  const { c } = mk({ backend: failing("network") }); let loads = 0;
  for (let i = 0; i < 4; i++) assert.equal(await c.cached("u", "n", 1, 60, async () => (loads++, "from-db")), "from-db"); assert.equal(loads, 4);
});
test("circuit breaker: opens after consecutive failures, stops calling Redis, recovers later", async () => {
  const f = failing("timeout"); const { c, t } = mk({ backend: f });
  await c.lookup("u", "n", 1); await c.lookup("u", "n", 1); assert.equal(c.snapshot().breaker.open, true); const callsAtOpen = f.calls.n;
  for (let i = 0; i < 20; i++) await c.lookup("u", "n", 1); assert.equal(f.calls.n, callsAtOpen, "no Redis traffic while open (protects quota)");
  t.v += 31_000; assert.equal(c.snapshot().breaker.open, false); await c.lookup("u", "n", 1); assert.ok(f.calls.n > callsAtOpen);
});
test("quota (429) opens the breaker immediately", async () => { const { c } = mk({ backend: failing("quota") }); await c.lookup("u", "n", 1); assert.equal(c.snapshot().breaker.open, true); assert.equal(c.snapshot().breaker.lastError, "quota"); });
test("bump never throws and never fails the caller, even when Redis is down", async () => { const { c } = mk({ backend: failing() }); assert.equal(await c.bump("u"), false); assert.equal(c.snapshot().pendingInvalidations, 1); });
test("missed invalidation is repaired before the next read — stale data is NEVER served", async () => {
  const b = createMemoryBackend(); let down = false; const flaky = { kind: "flaky", async mget(k) { if (down) throw new CacheError("network"); return b.mget(k); }, async set(k, v, t) { if (down) throw new CacheError("network"); return b.set(k, v, t); }, async del(k) { return b.del(k); } };
  const { c, t } = mk({ backend: flaky }); const r = await c.lookup("u", "jarvis", "q"); await c.store(r.token, "stale-soon", 600);
  down = true; await c.bump("u");                                      // DB write succeeded but invalidation couldn't reach Redis
  t.v += 100_000; down = false;                                        // outage over (breaker window passed)
  assert.equal((await c.lookup("u", "jarvis", "q")).hit, false);       // pending bump flushed first → entry invalid
  assert.equal(c.snapshot().pendingInvalidations, 0);
});
test("oversized values are not stored", async () => { const { c } = mk({ maxBytes: 100 }); const r = await c.lookup("u", "n", 1); assert.equal(await c.store(r.token, "x".repeat(500), 60), false); assert.equal((await c.lookup("u", "n", 1)).hit, false); assert.equal(c.snapshot().skipped, 1); });
test("disabled cache (no backend) is a harmless no-op", async () => { const c = createCache({}); assert.equal(c.enabled, false); const r = await c.lookup("u", "n", 1); assert.equal(r.hit, false); assert.equal(await c.store(r.token, 1, 5), false); assert.equal(await c.bump("u"), false); assert.equal(await c.cached("u", "n", 1, 5, async () => 42), 42); });
