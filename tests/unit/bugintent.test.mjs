import test from "node:test"; import assert from "node:assert/strict";
import { bugIntent as B } from "@/lib/jarvis/bugintent"; import { deterministicIntent as D } from "@/lib/jarvis/deterministic";
test("spec phrases", () => {
  assert.deepEqual(B("Show me the open bugs in Lucifer OS"), { tool: "list_bugs", args: { status: "open", project: "Lucifer OS" } });
  assert.deepEqual(B("Mark the dashboard rendering bug as resolved"), { tool: "update_bug", args: { bug: "dashboard rendering", status: "resolved" } });
  assert.deepEqual(B("Create a bug for the mobile navigation overflow"), null);   // no project → AI asks "which project?" (never guessed)
  assert.deepEqual(B("Create a bug in Lucifer OS for the broken task editor"), { tool: "create_bug", args: { title: "broken task editor", project: "Lucifer OS" } });
  assert.deepEqual(B("Add bug: Mobile navigation overflows @Lucifer OS"), { tool: "create_bug", args: { title: "Mobile navigation overflows", project: "Lucifer OS" } });
  assert.deepEqual(B("Add a bug to my Lucifer OS project: nav overflow"), { tool: "create_bug", args: { title: "nav overflow", project: "Lucifer OS" } });
});
test("variants and non-matches", () => {
  assert.deepEqual(B("list bugs"), { tool: "list_bugs", args: {} }); assert.equal(B("show me resolved bugs").args.status, "resolved");
  assert.equal(B("mark the login bug as fixed").args.status, "resolved"); assert.equal(B("mark the login bug as won't fix").args.status, "wont_fix");
  assert.equal(B("Add bug: no project given"), null); assert.equal(B("there is a bug in my code"), null);
});
test("router: bug rules run before generic parsing; 'bug' text never becomes a task", () => { assert.equal(D("Add bug: Nav overflow @Lucifer OS", "Asia/Kolkata").tool, "create_bug"); });
