import test from "node:test"; import assert from "node:assert/strict";
import { repeatFromEvent as from, repeatToPayload as to } from "@/lib/repeat-ui"; import { recurrenceRuleSchema } from "@/lib/validation";
const valid = (p) => assert.equal(recurrenceRuleSchema.safeParse(p.recurrence_rule).success, true, JSON.stringify(p));
test("does not repeat", () => assert.deepEqual(to(from({ recurrence: "none" })), { recurrence: "none", recurrence_rule: null }));
test("LEGACY events survive an untouched edit unchanged (still the one-word value, no rule)", () => { for (const r of ["daily", "weekly", "monthly"]) assert.deepEqual(to(from({ recurrence: r })), { recurrence: r, recurrence_rule: null }); });
test("presets: every weekday, every year", () => {
  assert.deepEqual(to({ ...from({}), preset: "weekday" }), { recurrence: "custom", recurrence_rule: { freq: "weekly", interval: 1, byweekday: [0, 1, 2, 3, 4] } });
  assert.deepEqual(to({ ...from({}), preset: "yearly" }), { recurrence: "custom", recurrence_rule: { freq: "yearly", interval: 1 } });
});
test("a legacy preset WITH an end becomes an equivalent rule", () => assert.deepEqual(to({ ...from({ recurrence: "weekly" }), ends: "count", count: 6 }), { recurrence: "custom", recurrence_rule: { freq: "weekly", interval: 1, count: 6 } }));
test("custom: every 2 weeks on Mon/Wed until a date; every 3 months on the 15th; last day of month", () => {
  const c = { ...from({}), preset: "custom" };
  assert.deepEqual(to({ ...c, interval: 2, unit: "weeks", weekdays: [2, 0, 2], ends: "until", until: "2026-12-31" }).recurrence_rule, { freq: "weekly", interval: 2, byweekday: [0, 2], until: "2026-12-31" });
  assert.deepEqual(to({ ...c, interval: 3, unit: "months", monthMode: "day", monthDay: 15 }).recurrence_rule, { freq: "monthly", interval: 3, bymonthday: 15 });
  assert.deepEqual(to({ ...c, interval: 1, unit: "months", monthMode: "last" }).recurrence_rule, { freq: "monthly", interval: 1, bymonthday: -1 });
  assert.deepEqual(to({ ...c, interval: 1, unit: "days", weekdays: [1, 2] }).recurrence_rule, { freq: "daily", interval: 1 });   // weekdays are ignored for non-weekly units, never sent
});
test("every payload the picker can build passes the SERVER schema", () => {
  const c = { ...from({}), preset: "custom" };
  for (const v of [{ ...c, unit: "days", interval: 3 }, { ...c, unit: "weeks", interval: 2, weekdays: [0, 4] }, { ...c, unit: "months", monthMode: "last" }, { ...c, unit: "years" }, { ...c, unit: "weeks", ends: "count", count: 10 }, { ...c, unit: "days", ends: "until", until: "2027-01-01" }, { ...from({}), preset: "weekday", ends: "count", count: 5 }]) valid(to(v));
});
test("bad input yields a clear error instead of a bad payload", () => {
  const c = { ...from({}), preset: "custom" };
  for (const v of [{ ...c, interval: 0 }, { ...c, interval: 1.5 }, { ...c, ends: "until", until: "" }, { ...c, ends: "count", count: 0 }, { ...c, ends: "count", count: 5000 }, { ...c, unit: "months", monthMode: "day", monthDay: 40 }]) assert.ok(to(v).error, JSON.stringify(v));
});
test("round trip: an existing custom rule loads into the picker and saves back identically", () => {
  for (const rule of [{ freq: "weekly", interval: 2, byweekday: [0, 2], until: "2026-12-31" }, { freq: "monthly", interval: 1, bymonthday: -1, count: 12 }, { freq: "daily", interval: 4 }, { freq: "yearly", interval: 1 }, { freq: "monthly", interval: 2, bymonthday: 5 }]) {
    const back = to(from({ recurrence: "custom", recurrence_rule: rule })); assert.deepEqual(back.recurrence_rule, rule, JSON.stringify(rule));
  }
  assert.equal(from({ recurrence: "custom", recurrence_rule: { freq: "weekly", interval: 1, byweekday: [0, 1, 2, 3, 4] } }).preset, "weekday");
});
import { seriesTimesForEdit as ste } from "@/lib/repeat-ui"; import { zonedToIso } from "@/lib/dates";
test("editing 'all events' from an occurrence keeps the SERIES start date and applies the new time/length", () => {
  const e = { series_starts_at: zonedToIso("2026-01-05T09:00", "Asia/Kolkata"), starts_at: zonedToIso("2026-03-16T09:00", "Asia/Kolkata") };   // opened from the Mar 16 occurrence
  assert.deepEqual(ste(e, "2026-03-16T10:30", "2026-03-16T11:15", "Asia/Kolkata"), { start: "2026-01-05T10:30", end: "2026-01-05T11:15" });
  assert.deepEqual(ste(e, "2026-03-16T22:00", "2026-03-17T01:00", "Asia/Kolkata"), { start: "2026-01-05T22:00", end: "2026-01-06T01:00" });   // overnight length preserved
});
