import test from "node:test"; import assert from "node:assert/strict";
import { deterministicIntent as D } from "@/lib/jarvis/deterministic";
const TZ = "Asia/Kolkata";
test("task questions route to list_tasks with real filters (not an unfiltered list)", () => {
  assert.deepEqual(D("Show me today's tasks", TZ), { tool: "list_tasks", args: { when: "today" } });
  assert.deepEqual(D("show me overdue tasks", TZ).args, { when: "overdue", status: "open" });
  assert.deepEqual(D("How many tasks have I completed this month?", TZ).args, { count_only: true, status: "completed", completed_when: "this_month" });
});
test("'add a task for tomorrow' sets the scheduled date, not the deadline", () => {
  const a = D("Add a task for tomorrow to review the paper", TZ); assert.equal(a.tool, "create_task");
  assert.ok(a.args.scheduled_date && !a.args.due_date, JSON.stringify(a));
});
test("'due' / 'by' make it a deadline", () => {
  const a = D("add task: submit report due tomorrow", TZ); assert.ok(a.args.due_date && !a.args.scheduled_date, JSON.stringify(a));
  const b = D("add task: submit report by friday", TZ); assert.ok(b.args.due_date && !b.args.scheduled_date, JSON.stringify(b));
});
test("no date → neither field is set", () => { const a = D("add task: water plants", TZ); assert.ok(!a.args.due_date && !a.args.scheduled_date); });
test("@project with spaces is passed through for server-side validation (tasks and ideas)", () => {
  assert.equal(D("Add task: Finish report tomorrow @Lucifer OS", TZ).args.project, "Lucifer OS");
  const i = D("Add idea: Adaptive memory updates @MemTransUNet", TZ); assert.deepEqual(i, { tool: "create_idea", args: { title: "Adaptive memory updates", project: "MemTransUNet" } });
  assert.deepEqual(D("Add idea: plain idea", TZ).args, { title: "Plain idea" });
});
test("unrelated text falls through to the AI (null)", () => { assert.equal(D("what's the capital of France", TZ), null); });
test("theme commands", () => {
  assert.deepEqual(D("Switch to Hell theme", TZ), { tool: "set_theme", args: { theme: "Hell" } });
  assert.deepEqual(D("Change my theme to Dark", TZ), { tool: "set_theme", args: { theme: "Dark" } });
  assert.deepEqual(D("Use the default theme", TZ), { tool: "set_theme", args: { theme: "default" } });
  assert.equal(D("What themes are available?", TZ).tool, "list_themes");
  assert.equal(D("switch to dashboard", TZ), null);   // not a theme name → must not hijack navigation-ish text
});
