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
for (const u of [A, B, C]) await q("INSERT INTO dashboard_settings(user_id) VALUES ($1) ON CONFLICT DO NOTHING", [u]);
const jwt = (id) => new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(id).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const cc = `session=${await jwt(C)}`, ca = `session=${await jwt(A)}`, cb = `session=${await jwt(B)}`;
const J = async (cookie, message) => (await fetch(BASE + "/api/jarvis", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ message, history: [], requestId: crypto.randomUUID() }) })).json();
let pass = 0, fail = 0; const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  → " + extra}`); };
const proj = async (u, name) => (await q("INSERT INTO projects(user_id,name) VALUES ($1,$2) RETURNING id", [u, name]))[0].id;
const PL = await proj(A, "Lucifer OS"), PRA = await proj(A, "Research Alpha"), PRB = await proj(A, "Research Beta"); const PX = await proj(B, "Lucifer OS");
const bugs = (u, extra = "") => q(`SELECT title, status, priority, project_id, resolved_at FROM bugs WHERE user_id=$1 ${extra} ORDER BY created_at`, [u]);
const theme = async (u) => (await q("SELECT theme FROM dashboard_settings WHERE user_id=$1", [u]))[0].theme;
try {
  let j = await J(ca, "Add bug: Mobile navigation overflows @Lucifer OS"); let b = await bugs(A);
  ok("bug: created in the right project via @project (multiword)", b.length === 1 && b[0].project_id === PL && b[0].title === "Mobile navigation overflows" && b[0].status === "open", JSON.stringify([j, b]));
  j = await J(ca, "Add bug: Ghost bug @Nonexistent"); ok("bug: unknown project → error, nothing created", j.type === "error" && (await bugs(A)).length === 1, JSON.stringify(j));
  j = await J(ca, "Add bug: Ambiguous bug @Research"); ok("bug: ambiguous project → clarify, nothing created", j.type === "clarify" && (await bugs(A)).length === 1, JSON.stringify(j));
  j = await J(ca, "Create a bug in Lucifer OS for the broken task editor"); b = await bugs(A); ok("bug: natural-language create", b.length === 2 && b.some((x) => x.title === "broken task editor" && x.project_id === PL), JSON.stringify([j, b]));
  j = await J(ca, "Show me the open bugs in Lucifer OS"); ok("bug: list open bugs for a project", (j.cards?.[0]?.items || []).length === 2 && /· 2/.test(j.cards[0].title || ""), JSON.stringify(j));
  j = await J(ca, "Show me the open bugs in Research Alpha"); ok("bug: list is project-filtered (empty for other project)", /· 0/.test(j.cards?.[0]?.title || ""), JSON.stringify(j));
  j = await J(ca, "Mark the broken task editor bug as resolved"); b = await bugs(A, "AND title='broken task editor'"); ok("bug: mark resolved sets status + resolved_at", b[0].status === "resolved" && b[0].resolved_at, JSON.stringify([j, b]));
  j = await J(ca, "Show me the open bugs in Lucifer OS"); ok("bug: resolved bug no longer listed as open", /· 1/.test(j.cards?.[0]?.title || ""), JSON.stringify(j));
  j = await J(ca, "Mark the broken task editor bug as open"); b = await bugs(A, "AND title='broken task editor'"); ok("bug: reopening clears resolved_at", b[0].status === "open" && b[0].resolved_at === null, JSON.stringify(b));
  j = await J(cb, "Mark the mobile navigation overflows bug as resolved"); ok("bug: another user cannot touch A's bug", j.type === "error" && (await bugs(A, "AND status='resolved'")).length === 0, JSON.stringify(j));
  j = await J(cb, "Add bug: sneaky @Lucifer OS"); const bb = await bugs(B); ok("bug: B's '@Lucifer OS' resolves to B's OWN project, never A's", bb.length === 1 && bb[0].project_id === PX, JSON.stringify(bb));

  j = await J(cc, "What themes are available?"); ok("theme: list shows registry + current", /Themes/.test(j.cards?.[0]?.title || "") && (j.cards[0].items || []).length >= 18, JSON.stringify(j).slice(0, 200));
  j = await J(cc, "Switch to Iron Man theme"); ok("theme: valid switch is persisted + client action returned", (await theme(C)) === "ironman" && j.clientActions?.some((a) => a.type === "theme" && a.theme === "ironman"), JSON.stringify(j));
  j = await J(cc, "Use the default theme"); ok("theme: 'default' → dark", (await theme(C)) === "dark", await theme(C));
  j = await J(cc, "Change my theme to Neon Pink Glitter"); ok("theme: unknown theme rejected, setting unchanged", j.type === "error" && (await theme(C)) === "dark" && !(j.clientActions || []).length, JSON.stringify(j));
  j = await J(cc, "Switch to man theme"); ok("theme: ambiguous name → clarify, unchanged", j.type === "clarify" && (await theme(C)) === "dark", JSON.stringify(j));
  j = await J(cb, "Switch to Batman theme"); ok("theme: affects only the requesting user", (await theme(B)) === "batman" && (await theme(C)) === "dark" && (await theme(A)) === "dark", `${await theme(B)}/${await theme(C)}`);
} catch (e) { fail++; console.log("ERROR", e); } finally {
  await q("DELETE FROM users WHERE id = ANY($1)", [[A, B, C]]); await db.end(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
}
