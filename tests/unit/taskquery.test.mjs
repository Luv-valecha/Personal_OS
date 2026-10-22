import test from "node:test"; import assert from "node:assert/strict";
import { whenRange, buildTaskFilter, parseTaskQuestion } from "@/lib/jarvis/taskquery";
const T = "2026-10-22"; // Thursday
test("relative ranges (Mon-start weeks)", () => {
  assert.deepEqual(whenRange("today", T), [T, T]); assert.deepEqual(whenRange("tomorrow", T), ["2026-10-23", "2026-10-23"]);
  assert.deepEqual(whenRange("this_week", T), ["2026-10-19", "2026-10-25"]); assert.deepEqual(whenRange("next_week", T), ["2026-10-26", "2026-11-01"]);
  assert.deepEqual(whenRange("this_month", T), ["2026-10-01", "2026-10-31"]); assert.deepEqual(whenRange("last_month", T), ["2026-09-01", "2026-09-30"]);
  assert.deepEqual(whenRange("overdue", T), [null, "2026-10-21"]);
});
test("parser: the spec's example questions all produce distinct, correct filters", () => {
  const P = parseTaskQuestion;
  assert.deepEqual(P("Show me today's tasks"), { when: "today" });
  assert.deepEqual(P("What tasks are scheduled for tomorrow?"), { when: "tomorrow", date_field: "scheduled" });
  assert.deepEqual(P("Show me overdue tasks"), { when: "overdue", status: "open" });
  assert.deepEqual(P("Show me tasks due this week"), { when: "this_week", date_field: "due" });
  assert.deepEqual(P("List tasks in my MemTransUNet project"), { project: "MemTransUNet" });
  assert.deepEqual(P("What tasks are associated with Lucifer OS?"), { project: "Lucifer OS" });
  assert.deepEqual(P("Show me completed tasks"), { status: "completed" });
  assert.deepEqual(P("Show me incomplete high-priority tasks"), { status: "open", priority: "high" });
  assert.deepEqual(P("Show me tasks scheduled for today in my research project"), { when: "today", date_field: "scheduled", project: "research" });
  assert.deepEqual(P("What are my next three tasks?"), { limit: 3, sort: "due", status: "open" });
  assert.deepEqual(P("How many tasks have I completed this month?"), { count_only: true, status: "completed", completed_when: "this_month" });
});
test("parser does not hijack writes or unrelated text", () => {
  for (const s of ["Add task: finish report", "delete the report task", "what's the weather", "schedule the report task for Monday", "remember that my tasks are hard"]) assert.equal(parseTaskQuestion(s), null, s);
});
test("filter builder: parameterised, user-scoped, defaults to open", () => {
  const f = buildTaskFilter({ when: "today", priority: "high" }, { uid: "U", today: T, tz: "Asia/Kolkata" });
  assert.equal(f.params[0], "U"); assert.match(f.where, /t\.completed=false/); assert.match(f.where, /t\.priority=\$2/);
  assert.ok(!f.where.includes("high") && !f.where.includes(T), "values must be bound, never interpolated");
});
test("injection attempt in search/project is bound as data", () => {
  const f = buildTaskFilter({ search: "x'; DROP TABLE tasks;--" }, { uid: "U", today: T, tz: "UTC" });
  assert.ok(!f.where.includes("DROP")); assert.ok(f.params.some((v) => String(v).includes("DROP")));
});
test("limit is clamped", () => { assert.equal(buildTaskFilter({ limit: 9999 }, { uid: "U", today: T, tz: "UTC" }).limit, 25); assert.equal(buildTaskFilter({}, { uid: "U", today: T, tz: "UTC" }).limit, 10); });
