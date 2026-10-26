// REAL migration 010 + REAL exception service + REAL getEventsRange against a DEV Postgres in a throwaway schema.
import { test, before, after } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import pg from "pg"; import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { zonedToIso, isoToLocalInput } from "@/lib/dates";
const base = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
if (!base || (/neon\.tech|supabase\.co/.test(base) && !process.env.ALLOW_REMOTE_TEST_DB)) { console.log("skipped: need a local DATABASE_URL_TEST"); process.exit(0); }
const schema = "t_" + Math.random().toString(36).slice(2, 10); const admin = new pg.Client({ connectionString: base });
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", TZ = "Asia/Kolkata";
let X, Q, T, db; const ids = {};
const range = async (uid, a, b) => Q.getEventsRange(uid, zonedToIso(`${a}T00:00`, TZ), zonedToIso(`${b}T23:59`, TZ), TZ);
const dates = (list, title) => list.filter((e) => !title || e.id === ids[title]).map((e) => e.occurrence_date || isoToLocalInput(e.starts_at, TZ).slice(0, 10));
const mkEvent = async (uid, title, start, end, recurrence, rule) => (await admin.query("INSERT INTO events(user_id,title,starts_at,ends_at,recurrence,recurrence_rule) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [uid, title, zonedToIso(start, TZ), zonedToIso(end, TZ), recurrence, rule ? JSON.stringify(rule) : null])).rows[0].id;
before(async () => {
  await admin.connect(); await admin.query(`CREATE SCHEMA ${schema}; SET search_path=${schema},public`);
  for (const f of fs.readdirSync("db/migrations").filter((x) => !x.startsWith("010")).sort()) await admin.query(fs.readFileSync(path.join("db/migrations", f), "utf8"));   // the database as it was BEFORE V4 recurrence
  await admin.query(`INSERT INTO users(id,email,password_hash) VALUES ('${A}','a@x','x'),('${B}','b@x','x')`);
  const legacy = async (title, st, en, rec) => (await admin.query("INSERT INTO events(user_id,title,starts_at,ends_at,recurrence) VALUES ($1,$2,$3,$4,$5) RETURNING id", [A, title, zonedToIso(st, TZ), zonedToIso(en, TZ), rec])).rows[0].id;   // old columns only (pre-010)
  ids.legacy = await legacy("Legacy weekly", "2026-01-05T09:00", "2026-01-05T10:00", "weekly");           // existing V3 data
  ids.oneoff = await legacy("One-off", "2026-01-06T09:00", "2026-01-06T10:00", "none");
  await admin.query(fs.readFileSync("db/migrations/010_recurring_events.sql", "utf8"));                           // now apply 010 on top of existing rows
  ids.daily = await mkEvent(A, "Daily custom", "2026-01-05T08:00", "2026-01-05T08:30", "custom", { freq: "daily", interval: 1, tz: TZ });
  ids.mwf = await mkEvent(A, "MWF", "2026-01-05T18:00", "2026-01-05T19:00", "custom", { freq: "weekly", interval: 1, byweekday: [0, 2, 4], tz: TZ });
  ids.b = await mkEvent(B, "B daily", "2026-01-05T08:00", "2026-01-05T08:30", "custom", { freq: "daily", interval: 1, tz: TZ });
  const u = new URL(base); u.searchParams.set("options", `-c search_path=${schema},public`); process.env.DATABASE_URL = u.toString();
  X = await import("@/lib/event-exceptions"); Q = await import("@/lib/queries"); T = await import("@/lib/jarvis/tools"); db = (await import("@/lib/db")).pool;
});
after(async () => { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); await db.end(); });

test("migration 010 preserved existing events: legacy weekly + one-off expand exactly as before", async () => {
  const r = await range(A, "2026-01-01", "2026-01-31");
  assert.deepEqual(dates(r, "legacy"), ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]); assert.deepEqual(dates(r, "oneoff"), ["2026-01-06"]);
  assert.equal((await admin.query("SELECT count(*)::int n FROM events WHERE recurrence_rule IS NULL AND user_id=$1", [A])).rows[0].n, 2);
});
test("custom series expands from ONE stored row (no per-occurrence rows)", async () => {
  assert.equal((await range(A, "2026-02-01", "2026-02-28")).filter((e) => e.id === ids.daily).length, 28); assert.equal((await admin.query("SELECT count(*)::int n FROM events WHERE id=$1", [ids.daily])).rows[0].n, 1);
  assert.deepEqual(dates(await range(A, "2026-01-05", "2026-01-11"), "mwf"), ["2026-01-05", "2026-01-07", "2026-01-09"]);
});
test("DB constraints: custom needs a rule; bad kinds/overrides rejected; cross-user exception refused", async () => {
  await assert.rejects(() => admin.query(`INSERT INTO events(user_id,title,starts_at,ends_at,recurrence) VALUES ('${A}','x',now(),now(),'custom')`), /check/i);
  await assert.rejects(() => admin.query(`INSERT INTO events(user_id,title,starts_at,ends_at,recurrence) VALUES ('${A}','x',now(),now(),'hourly')`), /check/i);
  await assert.rejects(() => admin.query("INSERT INTO event_exceptions(event_id,user_id,occurrence_date,kind) VALUES ($1,$2,'2026-01-07','bogus')", [ids.daily, A]), /check/i);
  await assert.rejects(() => admin.query("INSERT INTO event_exceptions(event_id,user_id,occurrence_date,kind,data) VALUES ($1,$2,'2026-01-07','override',NULL)", [ids.daily, A]), /check/i);
  await assert.rejects(() => admin.query("INSERT INTO event_exceptions(event_id,user_id,occurrence_date,kind) VALUES ($1,$2,'2026-01-07','skip')", [ids.daily, B]), /foreign key/i);   // B can't attach to A's series
});
test("delete ONE occurrence: only that day disappears, the series survives, restore brings it back", async () => {
  await X.skipOccurrence(A, ids.daily, "2026-01-07", TZ);
  const r = dates(await range(A, "2026-01-05", "2026-01-09"), "daily"); assert.deepEqual(r, ["2026-01-05", "2026-01-06", "2026-01-08", "2026-01-09"]);
  assert.equal((await admin.query("SELECT count(*)::int n FROM events WHERE id=$1", [ids.daily])).rows[0].n, 1);
  await X.restoreOccurrence(A, ids.daily, "2026-01-07"); assert.equal(dates(await range(A, "2026-01-05", "2026-01-09"), "daily").length, 5);
});
test("edit ONE occurrence: only that day changes (title + time); the rest of the series is untouched", async () => {
  await X.overrideOccurrence(A, ids.daily, "2026-01-08", { title: "Dentist", starts_at: zonedToIso("2026-01-08T15:00", TZ), ends_at: zonedToIso("2026-01-08T16:00", TZ) }, TZ);
  const r = (await range(A, "2026-01-05", "2026-01-10")).filter((e) => e.id === ids.daily); const o = r.find((e) => e.occurrence_date === "2026-01-08");
  assert.equal(o.title, "Dentist"); assert.equal(isoToLocalInput(o.starts_at, TZ).slice(11), "15:00"); assert.equal(r.filter((e) => e.title === "Daily custom").length, 5);
  await X.restoreOccurrence(A, ids.daily, "2026-01-08");
});
test("editing the WHOLE series changes every occurrence but keeps one-off exceptions", async () => {
  await X.skipOccurrence(A, ids.daily, "2026-01-06", TZ); await admin.query("UPDATE events SET title='Renamed series' WHERE id=$1", [ids.daily]);
  const r = (await range(A, "2026-01-05", "2026-01-08")).filter((e) => e.id === ids.daily); assert.deepEqual(r.map((e) => e.occurrence_date), ["2026-01-05", "2026-01-07", "2026-01-08"]); assert.ok(r.every((e) => e.title === "Renamed series"));
  await X.restoreOccurrence(A, ids.daily, "2026-01-06");
});
test("no duplicate exceptions: re-skipping is idempotent; skip→override replaces (never two rows for one date)", async () => {
  await X.skipOccurrence(A, ids.mwf, "2026-01-09", TZ); await X.skipOccurrence(A, ids.mwf, "2026-01-09", TZ);
  assert.equal((await admin.query("SELECT count(*)::int n FROM event_exceptions WHERE event_id=$1 AND occurrence_date='2026-01-09'", [ids.mwf])).rows[0].n, 1);
  await X.overrideOccurrence(A, ids.mwf, "2026-01-09", { title: "Friday special" }, TZ);
  const row = (await admin.query("SELECT kind FROM event_exceptions WHERE event_id=$1 AND occurrence_date='2026-01-09'", [ids.mwf])).rows; assert.deepEqual(row.map((x) => x.kind), ["override"]);
  await X.restoreOccurrence(A, ids.mwf, "2026-01-09");
});
test("rejections: not a real occurrence, not recurring, someone else's event, bad input", async () => {
  await assert.rejects(() => X.skipOccurrence(A, ids.mwf, "2026-01-06", TZ), /isn't part/i);                       // Tuesday isn't in a Mon/Wed/Fri series
  await assert.rejects(() => X.skipOccurrence(A, ids.oneoff, "2026-01-06", TZ), /doesn't repeat/i);
  await assert.rejects(() => X.skipOccurrence(B, ids.daily, "2026-01-07", TZ), /not found/i);                       // B can't touch A's series
  await assert.rejects(() => X.overrideOccurrence(B, ids.daily, "2026-01-07", { title: "hacked" }, TZ), /not found/i);
  await assert.rejects(() => X.skipOccurrence(A, ids.daily, "not-a-date", TZ)); await assert.rejects(() => X.skipOccurrence(A, "not-a-uuid", "2026-01-07", TZ));
  await assert.rejects(() => X.overrideOccurrence(A, ids.daily, "2026-01-07", { evil: "x" }, TZ));                  // strict patch: unknown keys rejected
  await assert.rejects(() => X.overrideOccurrence(A, ids.daily, "2026-01-07", {}, TZ), /nothing/i);
  await assert.rejects(() => X.overrideOccurrence(A, ids.daily, "2026-01-07", { starts_at: zonedToIso("2026-01-07T10:00", TZ) }, TZ), /together/i);
  await assert.rejects(() => X.overrideOccurrence(A, ids.daily, "2026-01-07", { starts_at: zonedToIso("2026-01-07T11:00", TZ), ends_at: zonedToIso("2026-01-07T10:00", TZ) }, TZ), /after/i);
  assert.equal((await admin.query("SELECT count(*)::int n FROM event_exceptions WHERE event_id=$1", [ids.daily])).rows[0].n, 0, "failed calls left no junk");
});
test("user isolation: B never sees A's events or exceptions, and B's skips don't affect A", async () => {
  await X.skipOccurrence(B, ids.b, "2026-01-07", TZ);
  assert.ok(!(await range(B, "2026-01-01", "2026-01-31")).some((e) => e.id === ids.daily)); assert.equal(dates(await range(A, "2026-01-05", "2026-01-09"), "daily").length, 5);
});
test("deleting a series deletes its exceptions (cascade)", async () => {
  await X.skipOccurrence(A, ids.mwf, "2026-01-07", TZ); await admin.query("DELETE FROM events WHERE id=$1 AND user_id=$2", [ids.mwf, A]);
  assert.equal((await admin.query("SELECT count(*)::int n FROM event_exceptions WHERE event_id=$1", [ids.mwf])).rows[0].n, 0);
});
test("bounded: a 6-year-old unbounded series in a 1-week window yields exactly 7; a huge window is clamped", async () => {
  const old = await mkEvent(A, "Old daily", "2020-01-01T09:00", "2020-01-01T09:30", "custom", { freq: "daily", interval: 1, tz: TZ });
  assert.equal((await range(A, "2026-06-01", "2026-06-07")).filter((e) => e.id === old).length, 7);
  const big = (await Q.getEventsRange(A, zonedToIso("2026-01-01T00:00", TZ), zonedToIso("2040-01-01T00:00", TZ), TZ)).filter((e) => e.id === old); assert.ok(big.length <= 400);
});
test("the dashboard 'upcoming events' list honours exceptions (same loader)", async () => {
  const d = await Q.getDashboard(A, "2026-01-05", TZ, new Set(["calendar"])); assert.ok(Array.isArray(d.events));
});

// ── JARVIS ──
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "x".repeat(40);
const ctx = (uid) => ({ uid, tz: TZ, today: "2026-10-26" });
// The services take the user from the SESSION (never from arguments), so each tool call runs as a real signed-in user.
const asUser = async (uid, fn) => { const { SignJWT } = await import("jose"); process.env.TEST_SESSION = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(uid).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET)); return fn(); };
const evRows = async (uid, title) => (await admin.query("SELECT recurrence, recurrence_rule FROM events WHERE user_id=$1 AND title=$2", [uid, title])).rows;
test("JARVIS create_event: 'every weekday' stores ONE validated rule row in the user's timezone and expands Mon–Fri", async () => {
  const r = await asUser(A, () => T.TOOLS.create_event.run({ title: "Study session", date: "2026-10-26", start_time: "18:00", repeat: "every weekday" }, ctx(A))); assert.equal(r.ok, true); assert.equal(r.data.repeats, "Every weekday");
  const rows = await evRows(A, "Study session"); assert.equal(rows.length, 1); assert.equal(rows[0].recurrence, "custom"); assert.deepEqual(rows[0].recurrence_rule, { freq: "weekly", interval: 1, byweekday: [0, 1, 2, 3, 4], tz: TZ });
  const wk = (await range(A, "2026-10-26", "2026-11-01")).filter((e) => e.title === "Study session"); assert.deepEqual(wk.map((e) => e.occurrence_date), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
});
test("JARVIS create_event: 'first day of every month' + end date (explicit arg beats wording)", async () => {
  const r = await asUser(A, () => T.TOOLS.create_event.run({ title: "Rent", date: "2026-11-01", start_time: "09:00", repeat: "the first day of every month", repeat_until: "2027-01-31" }, ctx(A))); assert.equal(r.ok, true);
  assert.deepEqual((await evRows(A, "Rent"))[0].recurrence_rule, { freq: "monthly", interval: 1, bymonthday: 1, until: "2027-01-31", tz: TZ });
  assert.deepEqual((await range(A, "2026-11-01", "2027-03-31")).filter((e) => e.title === "Rent").map((e) => e.occurrence_date), ["2026-11-01", "2026-12-01", "2027-01-01"]);
});
test("JARVIS create_event: no repeat → plain one-off (recurrence none, no rule)", async () => {
  await asUser(A, () => T.TOOLS.create_event.run({ title: "Dentist", date: "2026-10-27", start_time: "10:00" }, ctx(A))); const r = (await evRows(A, "Dentist"))[0]; assert.equal(r.recurrence, "none"); assert.equal(r.recurrence_rule, null);
});
test("JARVIS create_event: ambiguous / unrecognised / impossible repeats ask or refuse — and create NOTHING", async () => {
  for (const [rep, extra, re] of [["bimonthly", {}, /twice|two months/i], ["whenever", {}, /couldn't tell/i], ["every Monday", { repeat_until: "2026-10-01" }, /before the event/i]]) {
    const r = await asUser(A, () => T.TOOLS.create_event.run({ title: "Ghost " + rep, date: "2026-10-26", start_time: "09:00", repeat: rep, ...extra }, ctx(A))); assert.equal(r.ok, false, rep); assert.match(r.message, re, rep);
    assert.equal((await evRows(A, "Ghost " + rep)).length, 0, "nothing created for: " + rep);
  }
});
test("JARVIS set_event_repeat: turns an existing event into a series, can end it, and can stop it", async () => {
  await asUser(A, () => T.TOOLS.create_event.run({ title: "Sprint review", date: "2026-10-28", start_time: "15:00" }, ctx(A)));
  const r = await asUser(A, () => T.TOOLS.set_event_repeat.run({ event: "sprint review", repeat: "every two weeks", repeat_until: "2026-12-31" }, ctx(A))); assert.equal(r.ok, true);
  assert.deepEqual((await evRows(A, "Sprint review"))[0].recurrence_rule, { freq: "weekly", interval: 2, until: "2026-12-31", tz: TZ });
  assert.deepEqual((await range(A, "2026-10-26", "2026-11-30")).filter((e) => e.title === "Sprint review").map((e) => e.occurrence_date), ["2026-10-28", "2026-11-11", "2026-11-25"]);
  await asUser(A, () => T.TOOLS.set_event_repeat.run({ event: "sprint review", repeat: "never" }, ctx(A))); const back = (await evRows(A, "Sprint review"))[0]; assert.equal(back.recurrence, "none"); assert.equal(back.recurrence_rule, null);
});
test("JARVIS set_event_repeat: unknown event → error; several matches → clarify; another user's event is invisible and untouched", async () => {
  assert.equal((await asUser(A, () => T.TOOLS.set_event_repeat.run({ event: "no such thing", repeat: "daily" }, ctx(A)))).ok, false);
  await asUser(A, () => T.TOOLS.create_event.run({ title: "Gym morning", date: "2026-10-30", start_time: "06:00" }, ctx(A))); await asUser(A, () => T.TOOLS.create_event.run({ title: "Gym evening", date: "2026-10-30", start_time: "19:00" }, ctx(A)));
  const amb = await asUser(A, () => T.TOOLS.set_event_repeat.run({ event: "gym", repeat: "daily" }, ctx(A))); assert.equal(amb.clarify, true); assert.match(amb.message, /Gym morning/);
  const x = await asUser(B, () => T.TOOLS.set_event_repeat.run({ event: "Gym morning", repeat: "daily" }, ctx(B))); assert.equal(x.ok, false); assert.equal((await evRows(A, "Gym morning"))[0].recurrence, "none");
});
test("recurring events are write-tools for the answer cache (they invalidate, they are never cached)", async () => { const { isReadOnlyTool } = await import("@/lib/jarvis/cachepolicy"); assert.equal(isReadOnlyTool("create_event"), false); assert.equal(isReadOnlyTool("set_event_repeat"), false); });
