// Full-stack cache test. Spawns: mock Upstash (in-process) + mock Gemini + the REAL app (`next start`, needs a prior `next build`).
// DEV DB ONLY. Proves: AI answers are cached & served without calling the AI; writes invalidate; users are isolated; commands are never replayed;
// Redis outage / quota / garbage degrade gracefully; with no Redis configured nothing is cached.
import { spawn } from "node:child_process"; import pg from "pg"; import { SignJWT } from "jose"; import dotenv from "dotenv"; import crypto from "node:crypto";
import { startMockUpstash } from "../mock-upstash.mjs";
dotenv.config({ path: ".env.local", quiet: true });
const dbUrl = process.env.DATABASE_URL; if (!/localhost|127\.0\.0\.1/.test(dbUrl)) { console.log("refusing: not a local DB"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = await startMockUpstash({ port: 4021 });
const kids = []; const run = (cmd, args, env) => { const c = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: "ignore" }); kids.push(c); return c; };
run("node", ["tests/mock-gemini.mjs"], { GEMINI_PORT: "4011" });
const base = { GEMINI_API_BASE: "http://127.0.0.1:4011", GEMINI_API_KEY: "test", CACHE_BREAKER_BASE_MS: "1500", CACHE_TIMEOUT_MS: "400" };
run("npx", ["next", "start", "-p", "3101"], { ...base, UPSTASH_REDIS_REST_URL: up.url, UPSTASH_REDIS_REST_TOKEN: up.token });   // cache ON
const noRedisEnv = { ...base }; delete noRedisEnv.UPSTASH_REDIS_REST_URL; delete noRedisEnv.UPSTASH_REDIS_REST_TOKEN;
run("npx", ["next", "start", "-p", "3102"], { ...noRedisEnv, UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" });          // cache OFF
for (const port of [3101, 3102]) for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${port}/login`); break; } catch { await sleep(500); } }

const db = new pg.Client({ connectionString: dbUrl }); await db.connect(); const q = async (s, p) => (await db.query(s, p)).rows;
const tag = crypto.randomBytes(3).toString("hex"); const mk = async (n) => (await q("INSERT INTO users(email,password_hash) VALUES ($1,'x') RETURNING id", [`${n}-${tag}@e2e.test`]))[0].id;
const ids = { A: await mk("a"), B: await mk("b"), C: await mk("c"), D: await mk("d"), E: await mk("e"), F: await mk("f"), G: await mk("g") }; for (const id of Object.values(ids)) await q("INSERT INTO dashboard_settings(user_id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
const jwt = (id) => new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(id).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const ck = Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([k, v]) => [k, `session=${await jwt(v)}`])));
const J = async (port, cookie, message) => (await fetch(`http://127.0.0.1:${port}/api/jarvis`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ message, history: [], requestId: crypto.randomUUID() }) })).json();
const gem = async () => (await (await fetch("http://127.0.0.1:4011/__count")).json()).n;
const status = async (port, cookie) => (await fetch(`http://127.0.0.1:${port}/api/cache/status`, { headers: { cookie } })).json();
let pass = 0, failn = 0; const ok = (n, c, x = "") => { c ? pass++ : failn++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  → " + x}`); };
const ASK = "what is my average coffee spend";

try {
  // ── A: caching, normalisation, invalidation ──
  await J(3101, ck.A, "I spent 20 on coffee");                                    // AI-path WRITE (mock → create_expense); must never be cached
  let g0 = await gem(); let r1 = await J(3101, ck.A, ASK); let g1 = await gem();
  ok("1st read-only AI question calls the AI (miss) and is not marked cached", g1 - g0 === 2 && !r1.cached && r1.type === "result", JSON.stringify({ d: g1 - g0, r1 }).slice(0, 200));
  let r2 = await J(3101, ck.A, ASK); let g2 = await gem();
  ok("2nd identical question is served from Redis: cached:true, ZERO AI calls, identical content", r2.cached === true && g2 === g1 && JSON.stringify(r2.cards) === JSON.stringify(r1.cards) && r2.text === r1.text, JSON.stringify({ d: g2 - g1, c: r2.cached }));
  let r3 = await J(3101, ck.A, `  What is my AVERAGE coffee spend?  `);
  ok("trivially different phrasing (case/space/punctuation) shares the entry", r3.cached === true && (await gem()) === g2);
  await J(3101, ck.A, "Add task: invalidate me");                                  // rules-path write → bumps the user's version
  let g3 = await gem(); let r4 = await J(3101, ck.A, ASK); let g4 = await gem();
  ok("after a write the cached answer is gone (fresh AI call, not cached)", !r4.cached && g4 - g3 === 2, JSON.stringify({ d: g4 - g3, c: r4.cached }));
  let r5 = await J(3101, ck.A, ASK); ok("…and the fresh answer is cached again", r5.cached === true && (await gem()) === g4);
  // ── writes are never replayed ──
  await J(3101, ck.A, "I spent 20 on coffee"); await J(3101, ck.A, "I spent 20 on coffee");
  const exp = await q("SELECT count(*)::int n FROM expenses WHERE user_id=$1 AND description ILIKE '%coffee%'", [ids.A]);
  ok("an action phrased as a statement is executed every time (3 coffees = 3 expense rows), never answered from cache", exp[0].n === 3, JSON.stringify(exp));
  // ── isolation ──
  let g5 = await gem(); let rb = await J(3101, ck.B, ASK); let g6 = await gem();
  ok("another user asking the same question does NOT get A's cached answer", !rb.cached && g6 - g5 === 2, JSON.stringify({ d: g6 - g5, c: rb.cached }));
  ok("…and B's own answer reflects B's data (B has no coffee expenses, A has 3)", JSON.stringify(rb.cards) !== JSON.stringify(r1.cards), JSON.stringify(rb.cards).slice(0, 160));
  // ── rules-path commands bypass the cache entirely ──
  const cmds0 = up.stats.commands; await J(3101, ck.A, "show me today's tasks"); const used = up.stats.commands - cmds0;
  ok("rules-path questions never touch Redis for reads (saves quota)", used === 0, `commands used: ${used}`);
  // ── status endpoint ──
  const st = await status(3101, ck.A); const raw = JSON.stringify(st);
  ok("status endpoint: mode=upstash, counters present, no secrets/keys/urls", st.mode === "upstash" && st.hits >= 2 && st.misses >= 2 && !raw.includes(up.token) && !raw.includes("127.0.0.1:4021") && !raw.includes("lo4:u:"), raw.slice(0, 200));
  const un = await fetch("http://127.0.0.1:3101/api/cache/status"); ok("status endpoint requires sign-in (401)", un.status === 401, un.status);
  ok("Redis never holds the user's raw question text or secrets", !JSON.stringify(await (await fetch(up.url + "/__dump")).json()).includes("average coffee"));
  // ── dashboard page data (server-rendered HTML) ──
  const dash = async (port, cookie) => { const t0 = performance.now(); const html = (await (await fetch(`http://127.0.0.1:${port}/dashboard`, { headers: { cookie } })).text()).toLowerCase(); /* titles are capitalised by the quick-add parser */ return { html, ms: performance.now() - t0 }; };
  await q("INSERT INTO tasks(user_id,title) VALUES ($1,'dash-alpha')", [ids.F]);
  const d1 = await dash(3101, ck.F); ok("dashboard renders the user's tasks (miss → DB)", d1.html.includes("dash-alpha"), "title not in HTML");
  await q("UPDATE tasks SET title='dash-beta' WHERE user_id=$1", [ids.F]);                          // direct DB change: NO app write, so NO invalidation
  const d2 = await dash(3101, ck.F); ok("2nd dashboard load is served from Redis (still shows the old title; proves the DB wasn't read)", d2.html.includes("dash-alpha") && !d2.html.includes("dash-beta"), "served fresh?");
  const dEntry = (await (await fetch(up.url + "/__dump")).json()).find(([k]) => k.startsWith(`lo4:u:${ids.F}:dashboard:`)); ok("a dashboard entry for THIS user exists in Redis", !!dEntry);
  await J(3101, ck.F, "Add task: dash-gamma");                                                       // a real app write → bumps the version
  const d3 = await dash(3101, ck.F); ok("after a real write the dashboard is fresh (new + directly-changed data both visible)", d3.html.includes("dash-gamma") && d3.html.includes("dash-beta") && !d3.html.includes("dash-alpha"), "stale after write");
  const d4 = await dash(3101, ck.A); ok("another user's dashboard never shows F's cached tasks", !d4.html.includes("dash-"));
  console.log(`      (sandbox timing, local DB — NOT representative of Neon: miss ${d1.ms.toFixed(0)} ms, hit ${d2.ms.toFixed(0)} ms)`);
  await q("INSERT INTO tasks(user_id,title) VALUES ($1,'ctl-alpha')", [ids.G]); await dash(3102, ck.G); await q("UPDATE tasks SET title='ctl-beta' WHERE user_id=$1", [ids.G]);
  const c2 = await dash(3102, ck.G); ok("control (no Redis): a direct DB change is visible immediately — nothing cached", c2.html.includes("ctl-beta") && !c2.html.includes("ctl-alpha"));
  await fetch(up.url + "/__mode", { method: "POST", body: JSON.stringify({ mode: "500" }) });
  const d5 = await dash(3101, ck.F); ok("Redis outage: dashboard still renders (HTTP 200 content, fresh from the database)", d5.html.includes("dash-gamma") && d5.html.includes("dash-beta"));
  await fetch(up.url + "/__mode", { method: "POST", body: JSON.stringify({ mode: "ok" }) }); await sleep(2200);
  // ── malformed entry ──
  const dump = await (await fetch(up.url + "/__dump")).json(); const entry = dump.find(([k]) => k.startsWith(`lo4:u:${ids.A}:jarvis:`));
  await fetch(up.url + "/__poke", { method: "POST", body: JSON.stringify({ key: entry[0], value: "{{garbage" }) });
  let g7 = await gem(); let rg = await J(3101, ck.A, ASK); ok("a corrupted cache entry is treated as a miss and answered normally", !rg.cached && rg.type === "result" && (await gem()) - g7 === 2, JSON.stringify(rg).slice(0, 160));

  // ── outage: Redis returns 500 → JARVIS keeps working from the AI/DB ──
  await fetch(up.url + "/__mode", { method: "POST", body: JSON.stringify({ mode: "500" }) });
  let g8 = await gem(); const o1 = await J(3101, ck.C, ASK); const o2 = await J(3101, ck.C, ASK); const o3 = await J(3101, ck.C, ASK);
  ok("Redis outage: every question still gets a correct answer (never an error, never cached)", [o1, o2, o3].every((r) => r.type === "result" && !r.cached), JSON.stringify([o1.type, o2.type, o3.type]));
  const stDown = await status(3101, ck.C); ok("breaker opens during the outage", stDown.breaker.open === true && stDown.errors > 0, JSON.stringify(stDown.breaker));
  const before = up.stats.requests; await J(3101, ck.C, ASK); await J(3101, ck.C, ASK); ok("while the breaker is open Redis is not hammered (0 requests)", up.stats.requests === before, `${up.stats.requests - before} requests`);
  // write during outage must still succeed (cache invalidation failure must not fail the write)
  const w = await J(3101, ck.C, "Add task: written during outage"); ok("a write during the outage still succeeds truthfully", w.type === "result" && (await q("SELECT 1 FROM tasks WHERE user_id=$1 AND title ILIKE 'written during outage%'", [ids.C])).length === 1, JSON.stringify(w).slice(0, 160));
  // recovery
  await fetch(up.url + "/__mode", { method: "POST", body: JSON.stringify({ mode: "ok" }) }); await sleep(2200);
  await J(3101, ck.C, ASK); const rec = await J(3101, ck.C, ASK); ok("after Redis recovers caching resumes", rec.cached === true, JSON.stringify(rec).slice(0, 120));
  // quota
  await fetch(up.url + "/__mode", { method: "POST", body: JSON.stringify({ mode: "429" }) }); const q1 = await J(3101, ck.D, ASK); const stq = await status(3101, ck.D);
  ok("quota exhausted (HTTP 429): answers still work and the breaker opens at once", q1.type === "result" && stq.breaker.open === true && stq.breaker.lastError === "quota", JSON.stringify([q1.type, stq.breaker]));
  await fetch(up.url + "/__mode", { method: "POST", body: JSON.stringify({ mode: "ok" }) });
  // ── no Redis configured at all (production build) ──
  const n1 = await gem(); const x1 = await J(3102, ck.E, ASK); const x2 = await J(3102, ck.E, ASK); const n2 = await gem();
  ok("with NO Redis configured JARVIS works and nothing is cached (2 questions = 4 AI calls)", x1.type === "result" && x2.type === "result" && !x1.cached && !x2.cached && n2 - n1 === 4, JSON.stringify({ d: n2 - n1 }));
  const stOff = await status(3102, ck.E); ok("status reports cache off", stOff.mode === "off" && stOff.enabled === false, JSON.stringify(stOff).slice(0, 120));
} catch (e) { failn++; console.log("ERROR", e); }
finally {
  await q("DELETE FROM users WHERE id = ANY($1)", [Object.values(ids)]); await db.end(); await up.close(); kids.forEach((k) => k.kill("SIGTERM"));
  console.log(`\n${pass} passed, ${failn} failed`); process.exit(failn ? 1 : 0);
}
