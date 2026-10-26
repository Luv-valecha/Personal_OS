import test from "node:test"; import assert from "node:assert/strict"; import { parseRepeat as P } from "@/lib/recurrence-text"; import { recurrenceRuleSchema } from "@/lib/validation";
const S = "2026-10-26";   // a Monday
test("the spec's phrases", () => {
  assert.deepEqual(P("weekly every Monday", S).rule, { freq: "weekly", interval: 1, byweekday: [0] });
  assert.deepEqual(P("every weekday", S).rule, { freq: "weekly", interval: 1, byweekday: [0, 1, 2, 3, 4] });
  assert.deepEqual(P("the first day of every month", S).rule, { freq: "monthly", interval: 1, bymonthday: 1 });
  assert.deepEqual(P("every two weeks until December", S).rule, { freq: "weekly", interval: 2, until: "2026-12-31" });
});
test("intervals and units", () => {
  assert.deepEqual(P("every day", S).rule, { freq: "daily", interval: 1 }); assert.deepEqual(P("daily", S).rule, { freq: "daily", interval: 1 });
  assert.deepEqual(P("every 3 days", S).rule, { freq: "daily", interval: 3 }); assert.deepEqual(P("every other week", S).rule, { freq: "weekly", interval: 2 });
  assert.deepEqual(P("biweekly", S).rule, { freq: "weekly", interval: 2 }); assert.deepEqual(P("every 6 months", S).rule, { freq: "monthly", interval: 6 }); assert.deepEqual(P("annually", S).rule, { freq: "yearly", interval: 1 });
  assert.deepEqual(P("every other day", S).rule, { freq: "daily", interval: 2 });
});
test("weekdays", () => {
  assert.deepEqual(P("every Tuesday and Thursday", S).rule, { freq: "weekly", interval: 1, byweekday: [1, 3] }); assert.deepEqual(P("every mon, wed and fri", S).rule.byweekday, [0, 2, 4]);
  assert.deepEqual(P("every weekend", S).rule.byweekday, [5, 6]); assert.deepEqual(P("every 2 weeks on Monday", S).rule, { freq: "weekly", interval: 2, byweekday: [0] }); assert.deepEqual(P("on mondays", S).rule.byweekday, [0]);
});
test("monthly days", () => {
  assert.deepEqual(P("last day of every month", S).rule, { freq: "monthly", interval: 1, bymonthday: -1 }); assert.deepEqual(P("every month on the 15th", S).rule, { freq: "monthly", interval: 1, bymonthday: 15 });
  assert.deepEqual(P("monthly", S).rule, { freq: "monthly", interval: 1 }); assert.equal(P("every 2 months", S).rule.bymonthday, undefined);   // "2" is the interval, not a day
});
test("end conditions", () => {
  assert.equal(P("daily until 2027-03-01", S).rule.until, "2027-03-01"); assert.equal(P("weekly until 15 December", S).rule.until, "2026-12-15"); assert.equal(P("weekly until December 2027", S).rule.until, "2027-12-31");
  assert.equal(P("daily until March", S).rule.until, "2027-03-31");       // March already passed this year → next March
  assert.equal(P("daily for 10 times", S).rule.count, 10); assert.equal(P("every Monday for 6 weeks", S).rule.until, "2026-12-06"); assert.equal(P("daily for 3 days", S).rule.until, "2026-10-28");
});
test("ambiguous or unrecognised → a clarifying error, never a guess", () => {
  for (const t of ["bimonthly", "twice a week", "", "sometimes", "whenever", "every"]) assert.ok(P(t, S).error, t);
  assert.deepEqual(P("never", S), { none: true }); assert.deepEqual(P("does not repeat", S), { none: true });
});
test("everything the parser produces passes the server schema", () => {
  for (const t of ["weekly every Monday", "every weekday", "first day of every month", "every two weeks until December", "every 3 days", "last day of every month", "every month on the 31st", "annually", "daily for 10 times", "every Monday for 6 weeks", "every weekend"]) { const r = P(t, S); assert.ok(r.rule, t); assert.equal(recurrenceRuleSchema.safeParse(r.rule).success, true, t + " " + JSON.stringify(r.rule)); }
});
