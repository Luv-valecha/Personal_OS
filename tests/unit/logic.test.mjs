import test from "node:test"; import assert from "node:assert/strict";
import { sortTasks, SORT_MODES } from "@/lib/tasksort";
import { scoreTask, pickPriority } from "@/lib/priority";
import { parseCommand } from "@/lib/commands";
import { parseQuickTask } from "@/lib/nlp";
import { deterministicIntent } from "@/lib/jarvis/deterministic";
import { normalizeLayout } from "@/lib/layout";
import { guessFromName, fingerprintOf } from "@/lib/music-client";
import { addDays, diffDays } from "@/lib/dates";

const T = (o) => ({ id: o.id, title: o.title ?? o.id, priority: "medium", due_date: null, completed: false, created_at: "2026-01-01T00:00:00Z", manual_position: 0, ...o });
test("tasksort: manual uses manual_position; auto modes don't mutate input", () => {
  const a = [T({ id: "a", manual_position: 3, priority: "low", due_date: "2026-02-01" }), T({ id: "b", manual_position: 1, priority: "high", due_date: "2026-03-01" }), T({ id: "c", manual_position: 2, priority: "medium", due_date: "2026-01-15", created_at: "2026-05-01T00:00:00Z" })];
  const snap = JSON.stringify(a);
  assert.deepEqual(sortTasks(a, "manual").map((t) => t.id), ["b", "c", "a"]);
  assert.deepEqual(sortTasks(a, "priority").map((t) => t.id), ["b", "c", "a"]);
  assert.deepEqual(sortTasks(a, "due").map((t) => t.id), ["c", "a", "b"]);
  assert.deepEqual(sortTasks(a, "created").map((t) => t.id), ["c", "b", "a"]); // b/a tie on date → manual position
  assert.equal(JSON.stringify(a), snap);                                  // pure: saved manual order untouched
  assert.deepEqual(sortTasks(a, "manual").map((t) => t.id), ["b", "c", "a"]); // switching back restores manual order
  assert.equal(SORT_MODES.length, 5);
});
test("tasksort: completed tasks sink; ties fall back to manual position", () => {
  const r = sortTasks([T({ id: "x", completed: true, manual_position: 0 }), T({ id: "y", manual_position: 5 }), T({ id: "z", manual_position: 4 })], "due");
  assert.deepEqual(r.map((t) => t.id), ["z", "y", "x"]);
});
test("priority: overdue > due today > high priority > later", () => {
  const today = "2026-10-07";
  const o = scoreTask(T({ id: "o", due_date: "2026-10-05" }), today).score, d = scoreTask(T({ id: "d", due_date: today }), today).score, h = scoreTask(T({ id: "h", priority: "high" }), today).score, l = scoreTask(T({ id: "l", due_date: "2026-12-01" }), today).score;
  assert.ok(o > d && d > h && h > l);
  assert.equal(pickPriority([T({ id: "d", due_date: today }), T({ id: "o", due_date: "2026-10-01" })], today).task.id, "o");
  assert.equal(pickPriority([T({ id: "done", completed: true, due_date: "2020-01-01" })], today), null);
});
test("commands: explicit verbs run, ambiguous input opens a form, plain words fall through", () => {
  assert.equal(parseCommand("add idea: build an AI email organizer", "UTC").type, "create");
  assert.equal(parseCommand("Start 45 minute focus", "UTC").minutes, 45);
  assert.equal(parseCommand("add event: Gym", "UTC").type, "form");          // no time → never guess
  assert.equal(parseCommand("add event: Gym tomorrow 6pm", "UTC").type, "create");
  assert.equal(parseCommand("github", "UTC"), null);
  assert.equal(parseCommand("start 999 minute focus", "UTC"), null);
});
test("nlp: dates, priority, tags", () => {
  const p = parseQuickTask("finish ML report tomorrow !high #uni", "UTC"); const today = new Date().toISOString().slice(0, 10);
  assert.equal(p.title, "Finish ML report"); assert.equal(p.priority, "high"); assert.deepEqual(p.tags, ["uni"]); assert.equal(diffDays(p.due_date, today) >= 0, true);
});
test("jarvis deterministic: explicit commands map to tools; nothing is guessed", () => {
  assert.equal(deterministicIntent("add task: finish ML report tomorrow", "UTC").tool, "create_task");
  assert.equal(deterministicIntent("add idea: build an AI email organizer", "UTC").args.title, "Build an AI email organizer");
  assert.deepEqual(deterministicIntent("Rahul owes me 300 for lunch", "UTC"), { tool: "add_split_entry", args: { friend: "Rahul", kind: "lent", amount: 300, reason: "lunch" } });
  assert.equal(deterministicIntent("I owe Aman 200 for cab", "UTC").args.kind, "borrowed");
  assert.equal(deterministicIntent("how much have i spent this month", "UTC").tool, "get_expense_summary");
  assert.equal(deterministicIntent("overdue", "UTC").tool, "list_tasks");
  assert.equal(deterministicIntent("what do you think about my day", "UTC"), null);
  assert.equal(deterministicIntent("add expense: coffee", "UTC"), null);       // no amount → AI/clarification, not a guess
});
test("layout: new widgets slot in after predecessors for old saved layouts", () => {
  const out = normalizeLayout([{ id: "overview", visible: true, size: "lg" }, { id: "money", visible: false, size: "md" }]).map((w) => w.id);
  assert.ok(out.indexOf("splits") > out.indexOf("money")); assert.equal(normalizeLayout([{ id: "money", visible: false }]).find((w) => w.id === "money").visible, false);
});
test("music: file name fallbacks and fingerprints", () => {
  assert.deepEqual(guessFromName("01 - Pink Floyd - Time.mp3"), { artist: "Pink Floyd", title: "Time" });
  assert.deepEqual(guessFromName("my_song.wav"), { artist: "", title: "my song" });
  assert.equal(fingerprintOf({ name: "a.mp3", size: 10 }), "a.mp3|10");
});
test("dates helpers", () => { assert.equal(addDays("2026-02-28", 1), "2026-03-01"); });
