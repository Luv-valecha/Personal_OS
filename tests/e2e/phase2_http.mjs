// Drives the REAL running app (next start) over HTTP with a minted session cookie for seeded DEV users. Rules-path only → needs no Gemini key.
// Usage: BASE=http://localhost:3100 node tests/e2e/phase2_http.mjs   (needs DATABASE_URL + AUTH_SECRET from .env.local; DEV DB ONLY)
import pg from "pg"; import { SignJWT } from "jose"; import dotenv from "dotenv"; import crypto from "node:crypto";
dotenv.config({ path: ".env.local", quiet: true });
const BASE = process.env.BASE || "http://localhost:3100", url = process.env.DATABASE_URL;
if (!/localhost|127\.0\.0\.1/.test(url) && !process.env.ALLOW_REMOTE_TEST_DB) { console.log("refusing: not a local DB"); process.exit(1); }
const db = new pg.Client({ connectionString: url }); await db.connect();
const q = async (s, p) => (await db.query(s, p)).rows;
const tz = (await q("SELECT 'Asia/Kolkata' tz"))[0].tz; const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
const add = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const tag = crypto.randomBytes(3).toString("hex"); const mk = async (n) => (await q("INSERT INTO users(email,password_hash) VALUES ($1,'x') RETURNING id", [`${n}-${tag}@e2e.test`]))[0].id;
const A = await mk("a"), B = await mk("b"), C = await mk("c");
const jwt = (id) => new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(id).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const cc = `session=${await jwt(C)}`, ca = `session=${await jwt(A)}`, cb = `session=${await jwt(B)}`;
const J = async (cookie, message) => (await fetch(BASE + "/api/jarvis", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ message, history: [], requestId: crypto.randomUUID() }) })).json();
let pass = 0, fail = 0; const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  → " + extra}`); };
const proj = async (u, name) => (await q("INSERT INTO projects(user_id,name) VALUES ($1,$2) RETURNING id", [u, name]))[0].id;
const PL = await proj(A, "Lucifer OS"), PRA = await proj(A, "Research Alpha"), PRB = await proj(A, "Research Beta"); await proj(B, "Lucifer OS");
const T = (u, title, o = {}) => q("INSERT INTO tasks(user_id,project_id,title,priority,due_date,scheduled_date) VALUES ($1,$2,$3,$4,$5,$6)", [u, o.p || null, title, o.pr || "medium", o.due || null, o.sch || null]);
await T(A, "A-sched-tomorrow", { sch: add(todayStr, 1) }); await T(A, "A-sched-today", { sch: todayStr, p: PL }); await T(A, "A-overdue", { due: add(todayStr, -3), pr: "high" }); await T(A, "A-nodates"); await T(B, "B-secret-task", { sch: add(todayStr, 1) });
const items = (j) => (j.cards?.[0]?.items || []).map((i) => i.text).sort();

try {
  let j = await J(ca, "What tasks are scheduled for tomorrow?"); ok("filter: scheduled tomorrow → only that task", JSON.stringify(items(j)) === '["A-sched-tomorrow"]', JSON.stringify(j));
  j = await J(ca, "Show me today's tasks"); ok("filter: today → only today's (not all, not other user's)", JSON.stringify(items(j)) === '["A-sched-today"]', JSON.stringify(items(j)));
  j = await J(ca, "show me overdue tasks"); ok("filter: overdue", JSON.stringify(items(j)) === '["A-overdue"]', JSON.stringify(items(j)));
  j = await J(ca, "How many tasks have I completed this month?"); ok("count: completed this month = 0 (exact DB count)", /^0 tasks?/.test(j.cards?.[0]?.title || ""), JSON.stringify(j));
  j = await J(ca, "List tasks in my Lucifer OS project"); ok("filter: project (resolved, multiword)", JSON.stringify(items(j)) === '["A-sched-today"]', JSON.stringify(items(j)));
  j = await J(ca, "Show me incomplete high-priority tasks"); ok("filter: open + high priority", JSON.stringify(items(j)) === '["A-overdue"]', JSON.stringify(items(j)));
  j = await J(ca, "List tasks in my Nonexistent project"); ok("filter: unknown project → error, not an unfiltered list", j.type === "error" && !(j.cards || []).length, JSON.stringify(j));
  j = await J(ca, "List tasks in my Research project"); ok("filter: ambiguous project → clarification", j.type === "clarify", JSON.stringify(j));

  j = await J(ca, "Add task: Finish report @Lucifer OS"); const t1 = await q("SELECT project_id FROM tasks WHERE user_id=$1 AND title='Finish report'", [A]); ok("@project (task, multiword) → correct project", t1[0]?.project_id === PL, JSON.stringify(j));
  j = await J(ca, "Add task: Ghost task @Nonexistent"); ok("@unknown project → error and NOTHING created", j.type === "error" && (await q("SELECT 1 FROM tasks WHERE user_id=$1 AND title ILIKE 'Ghost task%'", [A])).length === 0, JSON.stringify(j));
  j = await J(ca, "Add task: Ambiguous one @Research"); ok("@ambiguous project → clarify and NOTHING created", j.type === "clarify" && (await q("SELECT 1 FROM tasks WHERE user_id=$1 AND title ILIKE 'Ambiguous one%'", [A])).length === 0, JSON.stringify(j));
  j = await J(ca, "Add idea: Adaptive memory updates @Research Alpha"); const i1 = await q("SELECT project_id FROM ideas WHERE user_id=$1 AND title='Adaptive memory updates'", [A]); ok("@project (idea) → correct project", i1[0]?.project_id === PRA, JSON.stringify(j));
  j = await J(ca, "Add a task for tomorrow to review the paper"); const t2 = await q("SELECT scheduled_date::text s, due_date d FROM tasks WHERE user_id=$1 AND title ILIKE '%review the paper%'", [A]); ok("'for tomorrow' → scheduled_date set, due_date untouched", t2[0]?.s === add(todayStr, 1) && t2[0]?.d === null, JSON.stringify(t2));
  j = await J(ca, "Add task: Submit form due tomorrow"); const t3 = await q("SELECT scheduled_date s, due_date::text d FROM tasks WHERE user_id=$1 AND title ILIKE 'Submit form%'", [A]); ok("'due tomorrow' → due_date set, scheduled untouched", t3[0]?.d === add(todayStr, 1) && t3[0]?.s === null, JSON.stringify(t3));

  j = await J(cc, "Remember that I prefer studying in the morning"); ok("memory: remember", j.type === "result" && (await q("SELECT 1 FROM jarvis_memories WHERE user_id=$1 AND content ILIKE '%studying in the morning%'", [C])).length === 1, JSON.stringify(j));
  j = await J(cc, "Remember that I prefer studying in the morning"); ok("memory: duplicate not stored twice", (await q("SELECT 1 FROM jarvis_memories WHERE user_id=$1", [C])).length === 1, JSON.stringify(j));
  j = await J(cc, "Remember my password is hunter2"); ok("memory: secret rejected, nothing stored", (await q("SELECT 1 FROM jarvis_memories WHERE user_id=$1 AND content ILIKE '%hunter2%'", [C])).length === 0 && j.type === "error", JSON.stringify(j));
  j = await J(cc, "What do you remember about me?"); ok("memory: list shows it", /Memory · 1/.test(j.cards?.[0]?.title || "") && items(j).some((x) => /studying/.test(x)), JSON.stringify(j));
  j = await J(cb, "What do you remember about me?"); ok("memory: other user sees NOTHING of A's memory", /Memory · 0/.test(j.cards?.[0]?.title || ""), JSON.stringify(j));
  j = await J(cb, "forget that I prefer studying"); ok("memory: other user cannot delete A's memory", j.type === "error" && (await q("SELECT 1 FROM jarvis_memories WHERE user_id=$1", [C])).length === 1, JSON.stringify(j));
  j = await J(cc, "forget that I prefer studying"); ok("memory: forget removes it", (await q("SELECT 1 FROM jarvis_memories WHERE user_id=$1", [C])).length === 0, JSON.stringify(j));
  const unauth = await fetch(BASE + "/api/jarvis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "remember x" }) }); ok("unauthenticated request → 401", unauth.status === 401, unauth.status);
} catch (e) { fail++; console.log("ERROR", e); } finally {
  await q("DELETE FROM users WHERE id = ANY($1)", [[A, B, C]]);   // cascades all seeded data
  await db.end(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
}
