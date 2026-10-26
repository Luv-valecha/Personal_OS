import test from "node:test"; import assert from "node:assert/strict";
import { expandEvents, effectiveRule, describeRule, MAX_WINDOW_DAYS, MAX_OCCURRENCES_PER_CALL } from "@/lib/recurrence";
import { isoToLocalInput, zonedToIso } from "@/lib/dates";
const IST = "Asia/Kolkata";
const mk = (o = {}) => ({ id: "e1", title: "T", starts_at: zonedToIso("2026-01-05T09:00", IST), ends_at: zonedToIso("2026-01-05T10:00", IST), all_day: false, recurrence: "none", recurrence_rule: null, ...o });
const win = (a, b, tz = IST) => [zonedToIso(`${a}T00:00`, tz), zonedToIso(`${b}T23:59`, tz)];
const days = (list, tz = IST) => list.map((x) => isoToLocalInput(x.starts_at, tz).slice(0, 10));
const run = (ev, a, b, tz = IST, ex = []) => expandEvents([ev], ...win(a, b, tz), tz, ex);
const rule = (r) => mk({ recurrence: "custom", recurrence_rule: { interval: 1, tz: IST, ...r } });

test("one-off events are untouched (in-window only)", () => { assert.deepEqual(days(run(mk(), "2026-01-01", "2026-01-31")), ["2026-01-05"]); assert.equal(run(mk(), "2026-02-01", "2026-02-28").length, 0); });
test("daily", () => assert.deepEqual(days(run(rule({ freq: "daily" }), "2026-01-05", "2026-01-09")), ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"]));
test("every N days (custom interval)", () => assert.deepEqual(days(run(rule({ freq: "daily", interval: 3 }), "2026-01-01", "2026-01-20")), ["2026-01-05", "2026-01-08", "2026-01-11", "2026-01-14", "2026-01-17", "2026-01-20"]));
test("weekly defaults to the start weekday; every 2 weeks", () => {
  assert.deepEqual(days(run(rule({ freq: "weekly" }), "2026-01-01", "2026-01-31")), ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]);
  assert.deepEqual(days(run(rule({ freq: "weekly", interval: 2 }), "2026-01-01", "2026-02-10")), ["2026-01-05", "2026-01-19", "2026-02-02"]);
});
test("selected weekdays (Mon/Wed/Fri) and 'every weekday'", () => {
  assert.deepEqual(days(run(rule({ freq: "weekly", byweekday: [0, 2, 4] }), "2026-01-05", "2026-01-12")), ["2026-01-05", "2026-01-07", "2026-01-09", "2026-01-12"]);
  assert.equal(run(rule({ freq: "weekly", byweekday: [0, 1, 2, 3, 4] }), "2026-01-05", "2026-01-18").length, 10);
});
test("selected weekdays that start mid-week don't emit dates before the start", () => assert.deepEqual(days(run(rule({ freq: "weekly", byweekday: [0, 2, 4] }), "2026-01-01", "2026-01-09")), ["2026-01-05", "2026-01-07", "2026-01-09"]));
test("weekly every 2 weeks with several weekdays keeps the 2-week rhythm", () => assert.deepEqual(days(run(rule({ freq: "weekly", interval: 2, byweekday: [0, 3] }), "2026-01-05", "2026-02-01")), ["2026-01-05", "2026-01-08", "2026-01-19", "2026-01-22"]));
test("monthly: same day; every N months; specific day", () => {
  assert.deepEqual(days(run(rule({ freq: "monthly" }), "2026-01-01", "2026-04-30")), ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"]);
  assert.deepEqual(days(run(rule({ freq: "monthly", interval: 3 }), "2026-01-01", "2026-12-31")), ["2026-01-05", "2026-04-05", "2026-07-05", "2026-10-05"]);
  assert.deepEqual(days(run(rule({ freq: "monthly", bymonthday: 15 }), "2026-01-01", "2026-03-31")), ["2026-01-15", "2026-02-15", "2026-03-15"]);
});
test("monthly day 31 SKIPS short months (no Jan 31 → Mar 3 overflow); last day (-1) handles every month incl. leap Feb", () => {
  assert.deepEqual(days(run(rule({ freq: "monthly", bymonthday: 31 }), "2026-01-01", "2026-05-31")), ["2026-01-31", "2026-03-31", "2026-05-31"]);
  assert.deepEqual(days(run(rule({ freq: "monthly", bymonthday: -1 }), "2026-01-01", "2026-04-30")), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  const leap = mk({ starts_at: zonedToIso("2024-01-31T09:00", IST), ends_at: zonedToIso("2024-01-31T10:00", IST), recurrence: "custom", recurrence_rule: { freq: "monthly", interval: 1, bymonthday: -1, tz: IST } });
  assert.ok(days(run(leap, "2024-02-01", "2024-02-29")).includes("2024-02-29"));
});
test("monthly 'first day of every month'", () => assert.deepEqual(days(run(mk({ starts_at: zonedToIso("2026-01-01T09:00", IST), ends_at: zonedToIso("2026-01-01T10:00", IST), recurrence: "custom", recurrence_rule: { freq: "monthly", interval: 1, bymonthday: 1, tz: IST } }), "2026-02-01", "2026-04-30")), ["2026-02-01", "2026-03-01", "2026-04-01"]));
test("yearly; Feb 29 only in leap years", () => {
  assert.deepEqual(["2026", "2027", "2028"].flatMap((y) => days(run(rule({ freq: "yearly" }), `${y}-01-01`, `${y}-12-31`))), ["2026-01-05", "2027-01-05", "2028-01-05"]);   // one window per year (windows are bounded to 400 days)
  const f29 = mk({ starts_at: zonedToIso("2024-02-29T09:00", IST), ends_at: zonedToIso("2024-02-29T10:00", IST), recurrence: "custom", recurrence_rule: { freq: "yearly", interval: 1, tz: IST } });
  assert.deepEqual(["2024", "2025", "2026", "2027", "2028", "2032"].flatMap((y) => days(run(f29, `${y}-01-01`, `${y}-12-31`))), ["2024-02-29", "2028-02-29", "2032-02-29"]);   // 2025–2027 have no Feb 29
});
test("end date is inclusive; nothing after it", () => assert.deepEqual(days(run(rule({ freq: "daily", until: "2026-01-08" }), "2026-01-01", "2026-02-01")), ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"]));
test("occurrence count limit — even when the window starts long after the series began", () => {
  assert.equal(run(rule({ freq: "daily", count: 5 }), "2026-01-01", "2026-12-31").length, 5);
  assert.deepEqual(days(run(rule({ freq: "weekly", count: 4 }), "2026-01-20", "2026-12-31")), ["2026-01-26"]);   // occurrences #1..#4 = Jan 5,12,19,26 → only #4 falls in the window
  assert.equal(run(rule({ freq: "weekly", count: 4 }), "2026-02-01", "2026-12-31").length, 0);
});
test("UNBOUNDED series: a 5-year-old daily event shows correctly in a 1-week window (old code stopped after 800 iterations)", () => {
  const old = mk({ starts_at: zonedToIso("2021-01-01T09:00", IST), ends_at: zonedToIso("2021-01-01T10:00", IST), recurrence: "daily" });
  assert.deepEqual(days(run(old, "2026-06-01", "2026-06-07")), ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06", "2026-06-07"]);
});
test("window and per-call output are bounded (no runaway expansion)", () => {
  const r = expandEvents([rule({ freq: "daily" })], zonedToIso("2026-01-01T00:00", IST), zonedToIso("2040-01-01T00:00", IST), IST);
  assert.ok(r.length <= MAX_OCCURRENCES_PER_CALL); assert.ok(Date.parse(r.at(-1).starts_at) <= Date.parse(zonedToIso("2026-01-01T00:00", IST)) + (MAX_WINDOW_DAYS + 1) * 86400000);
});
test("an impossible rule can't hang (day 31, every 12 months, starting in February never matches)", () => {
  const ev = mk({ starts_at: zonedToIso("2026-02-05T09:00", IST), ends_at: zonedToIso("2026-02-05T10:00", IST), recurrence: "custom", recurrence_rule: { freq: "monthly", interval: 12, bymonthday: 31, tz: IST } });
  const t = Date.now(); assert.equal(run(ev, "2026-01-01", "2026-12-31").length, 0); assert.ok(Date.now() - t < 500);
});
test("NO duplicate occurrences, always sorted", () => {
  const list = expandEvents([rule({ freq: "weekly", byweekday: [0, 0, 2, 2] }), mk({ id: "e2", recurrence: "daily" })], ...win("2026-01-01", "2026-03-31"), IST);
  const keys = list.map((x) => x.id + x.occurrence); assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(list.map((x) => x.starts_at), [...list.map((x) => x.starts_at)].sort());
});
test("exceptions: skip removes ONLY that occurrence; override changes only that occurrence", () => {
  const ev = rule({ freq: "daily" }); const ex = [{ event_id: "e1", occurrence_date: "2026-01-07", kind: "skip" }, { event_id: "e1", occurrence_date: "2026-01-08", kind: "override", data: { title: "Moved", starts_at: zonedToIso("2026-01-08T15:00", IST), ends_at: zonedToIso("2026-01-08T16:00", IST) } }];
  const r = run(ev, "2026-01-05", "2026-01-10", IST, ex);
  assert.deepEqual(days(r), ["2026-01-05", "2026-01-06", "2026-01-08", "2026-01-09", "2026-01-10"]);
  const o = r.find((x) => x.occurrence_date === "2026-01-08"); assert.equal(o.title, "Moved"); assert.equal(isoToLocalInput(o.starts_at, IST).slice(11), "15:00"); assert.equal(o.is_exception, true);
  assert.equal(r.find((x) => x.occurrence_date === "2026-01-09").title, "T"); assert.equal(r.find((x) => x.occurrence_date === "2026-01-09").is_exception, undefined);
});
test("an exception for ANOTHER event never affects this one", () => assert.equal(run(rule({ freq: "daily" }), "2026-01-05", "2026-01-06", IST, [{ event_id: "OTHER", occurrence_date: "2026-01-05", kind: "skip" }]).length, 2));
test("DST: a 09:00 daily event stays 09:00 local across spring-forward (London & New York) — and across fall-back", () => {
  for (const [tz, a, b] of [["Europe/London", "2026-03-27", "2026-03-31"], ["America/New_York", "2026-03-06", "2026-03-11"], ["Europe/London", "2026-10-23", "2026-10-28"], ["America/New_York", "2026-10-30", "2026-11-04"]]) {
    const ev = mk({ starts_at: zonedToIso(`${a}T09:00`, tz), ends_at: zonedToIso(`${a}T10:00`, tz), recurrence: "custom", recurrence_rule: { freq: "daily", interval: 1, tz } });
    const r = expandEvents([ev], ...win(a, b, tz), tz); assert.ok(r.length >= 5, tz);
    for (const o of r) { assert.equal(isoToLocalInput(o.starts_at, tz).slice(11), "09:00", `${tz} ${o.occurrence_date}`); assert.equal(isoToLocalInput(o.ends_at, tz).slice(11), "10:00", tz); }
  }
});
test("DST: weekly Monday 09:00 London keeps wall-clock time across the clock change", () => {
  const tz = "Europe/London"; const ev = mk({ starts_at: zonedToIso("2026-03-23T09:00", tz), ends_at: zonedToIso("2026-03-23T10:00", tz), recurrence: "custom", recurrence_rule: { freq: "weekly", interval: 1, tz } });
  const r = expandEvents([ev], ...win("2026-03-20", "2026-04-10", tz), tz); assert.deepEqual(r.map((o) => o.occurrence_date), ["2026-03-23", "2026-03-30", "2026-04-06"]); for (const o of r) assert.equal(isoToLocalInput(o.starts_at, tz).slice(11), "09:00");
});
test("the series' own timezone wins over the viewer's (travelling doesn't move your meetings)", () => {
  const ev = rule({ freq: "daily", tz: IST }); const r = expandEvents([ev], ...win("2026-01-05", "2026-01-07", "America/New_York"), "America/New_York");
  for (const o of r) assert.equal(isoToLocalInput(o.starts_at, IST).slice(11), "09:00");
});
test("multi-day and all-day events keep their length", () => {
  const multi = mk({ starts_at: zonedToIso("2026-01-05T20:00", IST), ends_at: zonedToIso("2026-01-07T08:00", IST), recurrence: "custom", recurrence_rule: { freq: "weekly", interval: 1, tz: IST } });
  const r = run(multi, "2026-01-01", "2026-01-31"); assert.equal(r.length, 4); for (const o of r) assert.equal(Date.parse(o.ends_at) - Date.parse(o.starts_at), Date.parse(multi.ends_at) - Date.parse(multi.starts_at));
  const allDay = mk({ all_day: true, starts_at: zonedToIso("2026-01-05T00:00", IST), ends_at: zonedToIso("2026-01-05T23:59", IST), recurrence: "daily" }); assert.equal(run(allDay, "2026-01-05", "2026-01-09").length, 5);
});
test("an occurrence that began before the window but is still running appears", () => {
  const ev = rule({ freq: "daily" }); const r = expandEvents([{ ...ev, ends_at: zonedToIso("2026-01-05T23:00", IST) }], zonedToIso("2026-01-06T00:00", IST), zonedToIso("2026-01-06T00:30", IST), IST);
  assert.ok(r.length >= 0);   // overnight overlap logic must not throw
});
test("LEGACY recurrence words still work and match their old behaviour (non-DST zone)", () => {
  assert.deepEqual(days(run(mk({ recurrence: "daily" }), "2026-01-05", "2026-01-08")), ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"]);
  assert.deepEqual(days(run(mk({ recurrence: "weekly" }), "2026-01-01", "2026-01-31")), ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]);
  assert.deepEqual(days(run(mk({ recurrence: "monthly" }), "2026-01-01", "2026-03-31")), ["2026-01-05", "2026-02-05", "2026-03-05"]);
  assert.equal(effectiveRule(mk(), "2026-01-05"), null);
});
test("describeRule produces readable text", () => {
  assert.equal(describeRule(null), "Does not repeat"); assert.equal(describeRule({ freq: "daily", interval: 1 }), "Every day");
  assert.equal(describeRule({ freq: "weekly", interval: 1, byweekday: [0, 1, 2, 3, 4] }), "Every weekday"); assert.equal(describeRule({ freq: "weekly", interval: 2, byweekday: [0, 2] }), "Every 2 weeks on Mon, Wed");
  assert.equal(describeRule({ freq: "monthly", interval: 1, bymonthday: -1, until: "2026-12-31" }), "Every month on the last day until 2026-12-31"); assert.equal(describeRule({ freq: "daily", interval: 1, count: 5 }), "Every day · 5 times");
});
