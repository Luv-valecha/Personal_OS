// Calls the REAL event server actions over HTTP (what the calendar UI calls), as signed-in dev users. DEV DB ONLY.
import fs from "node:fs"; import pg from "pg"; import { SignJWT } from "jose"; import dotenv from "dotenv"; import crypto from "node:crypto";
dotenv.config({ path: ".env.local", quiet: true });
const BASE = process.env.BASE || "http://localhost:3100", url = process.env.DATABASE_URL; if (!/localhost|127\.0\.0\.1/.test(url)) { console.log("refusing: not a local DB"); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json", "utf8")).node; const id = (n) => Object.entries(manifest).find(([, v]) => v.exportedName === n)?.[0];
const db = new pg.Client({ connectionString: url }); await db.connect(); const q = async (s, p) => (await db.query(s, p)).rows;
const mk = async (n) => (await q("INSERT INTO users(email,password_hash) VALUES ($1,'x') RETURNING id", [`${n}-${crypto.randomBytes(3).toString("hex")}@e2e.test`]))[0].id;
const A = await mk("ev-a"), B = await mk("ev-b"); for (const u of [A, B]) await q("INSERT INTO dashboard_settings(user_id) VALUES ($1) ON CONFLICT DO NOTHING", [u]);
const cookie = async (u) => "session=" + await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(u).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const ca = await cookie(A), cb = await cookie(B);
async function act(name, args, c) { const res = await fetch(BASE + "/calendar", { method: "POST", headers: { "next-action": id(name), "content-type": "text/plain;charset=UTF-8", cookie: c }, body: JSON.stringify(args) }); const t = await res.text(); const m = t.match(/\{"ok":(true|false)[^\n]*/); return { ok: m ? m[1] === "true" : null, raw: (m?.[0] || t).slice(0, 200) }; }
let pass = 0, failn = 0; const ok = (n, c, x = "") => { c ? pass++ : failn++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  → " + x}`); };
const iso = (d, t) => new Date(`${d}T${t}:00+05:30`).toISOString();   // default app tz is Asia/Kolkata
const body = (o) => ({ title: "Standup", description: "", location: "", all_day: false, starts_at: iso("2026-11-02", "09:00"), ends_at: iso("2026-11-02", "09:30"), reminder_minutes: "", recurrence: "none", ...o });
try {
  let r = await act("createEvent", [body({ recurrence: "custom", recurrence_rule: { freq: "weekly", interval: 1, byweekday: [0, 2, 4] } })], ca); ok("createEvent with a custom rule succeeds", r.ok === true, r.raw);
  const ev = (await q("SELECT * FROM events WHERE user_id=$1 AND title='Standup'", [A]))[0]; ok("stored as ONE row: recurrence=custom, rule saved, the user's tz filled in server-side", ev && ev.recurrence === "custom" && ev.recurrence_rule.freq === "weekly" && ev.recurrence_rule.tz === "Asia/Kolkata", JSON.stringify(ev?.recurrence_rule));
  r = await act("createEvent", [body({ title: "Bad", recurrence: "custom", recurrence_rule: { freq: "daily", byweekday: [1] } })], ca); ok("invalid rule (weekdays on a daily repeat) is rejected and nothing is stored", r.ok === false && (await q("SELECT 1 FROM events WHERE title='Bad' AND user_id=$1", [A])).length === 0, r.raw);
  r = await act("createEvent", [body({ title: "Bad2", recurrence: "custom", recurrence_rule: { freq: "daily", rrule: "x" } })], ca); ok("unknown rule keys are rejected", r.ok === false && (await q("SELECT 1 FROM events WHERE title='Bad2'")).length === 0, r.raw);
  r = await act("createEvent", [body({ title: "Bad3", recurrence: "custom" })], ca); ok("'custom' without a rule is rejected", r.ok === false, r.raw);
  r = await act("createEvent", [body({ title: "Bad4", recurrence: "weekly", recurrence_rule: { freq: "daily", until: "2020-01-01" } })], ca); ok("an end date before the start is rejected", r.ok === false && (await q("SELECT 1 FROM events WHERE title='Bad4'")).length === 0, r.raw);

  r = await act("deleteEventOccurrence", [ev.id, "2026-11-04"], ca); ok("delete ONE occurrence (Wed 4 Nov) → ok; series intact", r.ok === true && (await q("SELECT 1 FROM events WHERE id=$1", [ev.id])).length === 1, r.raw);
  ok("exactly one 'skip' exception row exists", JSON.stringify((await q("SELECT kind, occurrence_date::text d FROM event_exceptions WHERE event_id=$1", [ev.id])).map((x) => [x.kind, x.d])) === '[["skip","2026-11-04"]]');
  r = await act("deleteEventOccurrence", [ev.id, "2026-11-03"], ca); ok("a date that isn't in the series (Tuesday) is refused", r.ok === false && /isn't part/.test(r.raw), r.raw);
  r = await act("updateEventOccurrence", [ev.id, "2026-11-06", { title: "Standup (moved)", starts_at: iso("2026-11-06", "15:00"), ends_at: iso("2026-11-06", "15:30") }], ca); ok("edit ONE occurrence → ok", r.ok === true, r.raw);
  r = await act("updateEventOccurrence", [ev.id, "2026-11-06", { starts_at: iso("2026-11-06", "15:00") }], ca); ok("changing only one end of the time range is refused", r.ok === false, r.raw);
  r = await act("deleteEventOccurrence", [ev.id, "2026-11-02"], cb); ok("ANOTHER user cannot delete A's occurrence", r.ok === false && !(await q("SELECT 1 FROM event_exceptions WHERE occurrence_date='2026-11-02' AND event_id=$1", [ev.id])).length, r.raw);
  r = await act("updateEventOccurrence", [ev.id, "2026-11-09", { title: "hacked" }], cb); ok("ANOTHER user cannot edit A's occurrence", r.ok === false, r.raw);
  r = await act("restoreEventOccurrence", [ev.id, "2026-11-04"], ca); ok("restore brings the skipped occurrence back (exception removed)", r.ok === true && (await q("SELECT 1 FROM event_exceptions WHERE event_id=$1 AND occurrence_date='2026-11-04'", [ev.id])).length === 0, r.raw);
  r = await act("updateEvent", [ev.id, { title: "Standup renamed" }], ca); ok("editing the WHOLE series (title only) keeps the rule and exceptions", r.ok === true && (await q("SELECT recurrence_rule->>'freq' f FROM events WHERE id=$1", [ev.id]))[0].f === "weekly" && (await q("SELECT 1 FROM event_exceptions WHERE event_id=$1", [ev.id])).length === 1, r.raw);
  r = await act("updateEvent", [ev.id, { recurrence: "none" }], ca); ok("switching to 'does not repeat' clears the rule", r.ok === true && (await q("SELECT recurrence_rule r FROM events WHERE id=$1", [ev.id]))[0].r === null, r.raw);
  r = await act("updateEvent", [ev.id, { recurrence: "weekly" }], ca); ok("legacy 'weekly' still works and stores no rule", r.ok === true && (await q("SELECT recurrence, recurrence_rule r FROM events WHERE id=$1", [ev.id]))[0].recurrence === "weekly");
  r = await act("deleteEvent", [ev.id], ca); ok("deleting the series removes it and its exceptions", r.ok === true && (await q("SELECT 1 FROM event_exceptions WHERE event_id=$1", [ev.id])).length === 0 && (await q("SELECT 1 FROM events WHERE id=$1", [ev.id])).length === 0);
  const page = await fetch(BASE + "/calendar", { headers: { cookie: ca } }); ok("calendar page renders", page.status === 200);
} catch (e) { failn++; console.log("ERROR", e); }
finally { await q("DELETE FROM users WHERE id = ANY($1)", [[A, B]]); await db.end(); console.log(`\n${pass} passed, ${failn} failed`); process.exit(failn ? 1 : 0); }
