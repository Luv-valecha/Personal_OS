import test, { before, after } from "node:test"; import assert from "node:assert/strict";
import { startMockUpstash } from "../mock-upstash.mjs"; import { createUpstashBackend } from "@/lib/cache/upstash"; import { createCache } from "@/lib/cache/core";
let m; before(async () => { m = await startMockUpstash({ token: "secret-token-123" }); }); after(() => m.close());
const set = (mode) => fetch(m.url + "/__mode", { method: "POST", body: JSON.stringify({ mode }) });
const be = (o = {}) => createUpstashBackend({ url: m.url, token: "secret-token-123", timeoutMs: 300, ...o });

test("set/get round trip over the real REST protocol; reads are ONE http request for two GETs", async () => {
  await set("ok"); const b = be(); await b.set("k1", "hello", 30); const before = { ...m.stats };
  assert.deepEqual(await b.mget(["k1", "missing"]), ["hello", null]); assert.equal(m.stats.requests - before.requests, 1); assert.equal(m.stats.commands - before.commands, 2);
});
test("keys expire (EX is honoured)", async () => { const b = be(); await b.set("short", "v", 1); await new Promise((r) => setTimeout(r, 1200)); assert.deepEqual(await b.mget(["short"]), [null]); });
test("HTTP 429 → quota; 500 → http; garbage → parse; wrong token → http; slow → timeout; refused → network", async () => {
  await set("429"); await assert.rejects(() => be().mget(["a"]), { code: "quota" });
  await set("500"); await assert.rejects(() => be().mget(["a"]), { code: "http" });
  await set("garbage"); await assert.rejects(() => be().mget(["a"]), { code: "parse" });
  await set("ok"); await assert.rejects(() => be({ token: "wrong" }).mget(["a"]), { code: "http" });
  await set("slow"); await assert.rejects(() => be().mget(["a"]), { code: "timeout" }); await set("ok");
  await assert.rejects(() => createUpstashBackend({ url: "http://127.0.0.1:1", token: "t", timeoutMs: 300 }).mget(["a"]), (e) => ["network", "timeout"].includes(e.code));
});
test("the token never appears in error messages", async () => { await set("500"); try { await be().mget(["a"]); } catch (e) { assert.ok(!String(e.message).includes("secret-token-123")); } await set("ok"); });
test("full stack: cache over Upstash — miss, hit, invalidate; outage degrades to misses without throwing", async () => {
  await set("ok"); const c = createCache({ backend: be(), mode: "upstash" });
  const r = await c.lookup("U1", "jarvis", { q: "a" }); assert.equal(r.hit, false); await c.store(r.token, { text: "x" }, 60);
  assert.equal((await c.lookup("U1", "jarvis", { q: "a" })).hit, true); await c.bump("U1"); assert.equal((await c.lookup("U1", "jarvis", { q: "a" })).hit, false);
  await set("429"); const r2 = await c.lookup("U1", "jarvis", { q: "a" }); assert.equal(r2.hit, false); assert.equal(c.snapshot().breaker.open, true); await set("ok");
});
