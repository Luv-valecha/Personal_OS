import test from "node:test"; import assert from "node:assert/strict";
import { recurrenceRuleSchema as R, eventSchema } from "@/lib/validation"; import { normalizeRecurrence } from "@/lib/recurrence-input";
const ok = (r) => R.safeParse(r), bad = (r) => assert.equal(R.safeParse(r).success, false, JSON.stringify(r));
test("valid rules parse; interval defaults to 1; weekdays are sorted and de-duplicated", () => {
  assert.equal(ok({ freq: "daily" }).data.interval, 1); assert.deepEqual(ok({ freq: "weekly", byweekday: [4, 0, 2, 0] }).data.byweekday, [0, 2, 4]);
  for (const r of [{ freq: "monthly", bymonthday: -1 }, { freq: "monthly", bymonthday: 31, interval: 3 }, { freq: "yearly", count: 5 }, { freq: "daily", until: "2026-12-31", tz: "Asia/Kolkata" }]) assert.equal(ok(r).success, true, JSON.stringify(r));
});
test("nonsense is REJECTED, not silently ignored", () => {
  bad({ freq: "hourly" }); bad({ freq: "daily", interval: 0 }); bad({ freq: "daily", interval: 1.5 }); bad({ freq: "daily", interval: 366 }); bad({ freq: "yearly", interval: 21 }); bad({ freq: "weekly", interval: 53 });
  bad({ freq: "weekly", byweekday: [7] }); bad({ freq: "weekly", byweekday: [] }); bad({ freq: "weekly", byweekday: ["mon"] });
  bad({ freq: "monthly", bymonthday: 0 }); bad({ freq: "monthly", bymonthday: 32 }); bad({ freq: "monthly", bymonthday: -2 });
  bad({ freq: "daily", count: 0 }); bad({ freq: "daily", count: 1001 }); bad({ freq: "daily", until: "2026-02-30" }); bad({ freq: "daily", until: "tomorrow" }); bad({ freq: "daily", tz: "Mars/Olympus" });
});
test("irrelevant combinations are rejected", () => { bad({ freq: "daily", byweekday: [1] }); bad({ freq: "weekly", bymonthday: 5 }); bad({ freq: "yearly", byweekday: [1] }); bad({ freq: "daily", until: "2026-12-31", count: 3 }); });
test("unknown keys (injection / typos) are rejected", () => { bad({ freq: "daily", rrule: "FREQ=DAILY" }); bad({ freq: "daily", __proto__x: 1, evil: "<script>" }); bad({ freq: "daily", tz: "UTC", sql: "'; DROP TABLE events;--" }); bad("daily"); bad(null); bad([]); });
test("eventSchema accepts a rule, 'custom', legacy values — and rejects unknown recurrence words", () => {
  const base = { title: "t", starts_at: "2026-01-05T03:30:00.000Z", ends_at: "2026-01-05T04:30:00.000Z" };
  assert.equal(eventSchema.safeParse({ ...base, recurrence: "custom", recurrence_rule: { freq: "weekly" } }).success, true);
  for (const r of ["none", "daily", "weekly", "monthly"]) assert.equal(eventSchema.safeParse({ ...base, recurrence: r }).success, true, r);
  assert.equal(eventSchema.safeParse({ ...base, recurrence: "hourly" }).success, false); assert.equal(eventSchema.safeParse({ ...base, recurrence_rule: { freq: "nope" } }).success, false);
});
test("normalizeRecurrence: rule ⇒ custom + user tz; legacy word clears a stale rule; custom without rule is an error; end before start is an error", () => {
  const base = { title: "t", starts_at: "2026-01-05T03:30:00.000Z", ends_at: "2026-01-05T04:30:00.000Z" }; const rule = { freq: "weekly", interval: 1 };
  assert.deepEqual(normalizeRecurrence({ ...base, recurrence_rule: rule }, "Asia/Kolkata").value, { ...base, recurrence: "custom", recurrence_rule: { ...rule, tz: "Asia/Kolkata" } });
  assert.equal(normalizeRecurrence({ ...base, recurrence_rule: { ...rule, tz: "UTC" } }, "Asia/Kolkata").value.recurrence_rule.tz, "UTC");   // an explicit series tz is kept
  assert.deepEqual(normalizeRecurrence({ ...base, recurrence: "daily", recurrence_rule: undefined }, "UTC").value.recurrence_rule, null);
  assert.equal(normalizeRecurrence({ ...base, recurrence: "none" }, "UTC").value.recurrence_rule, null);
  assert.ok(normalizeRecurrence({ ...base, recurrence: "custom" }, "UTC").error);
  assert.ok(normalizeRecurrence({ ...base, recurrence_rule: { ...rule, until: "2025-12-31" } }, "UTC").error);
  assert.equal(normalizeRecurrence({ title: "only title" }, "UTC").value.recurrence, undefined);   // an unrelated edit doesn't touch recurrence fields
  assert.equal("recurrence_rule" in normalizeRecurrence({ title: "only title" }, "UTC").value, false);
});
