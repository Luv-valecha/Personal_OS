import test from "node:test"; import assert from "node:assert/strict";
import { extractAtProject, matchProjectRef } from "@/lib/projectref";
const P = [{ id: "1", name: "Lucifer OS" }, { id: "2", name: "MemTransUNet" }, { id: "3", name: "Lucifer" }, { id: "4", name: "Research Alpha" }, { id: "5", name: "Research Beta" }];
test("extract: multi-word, markers, quotes, emails", () => {
  assert.deepEqual(extractAtProject("Finish report tomorrow @Lucifer OS"), { text: "Finish report tomorrow", ref: "Lucifer OS", quoted: false });
  assert.deepEqual(extractAtProject("Fix nav @Lucifer OS !high #ui"), { text: "Fix nav !high #ui", ref: "Lucifer OS", quoted: false });
  assert.equal(extractAtProject('Do it @"Research Alpha"').ref, "Research Alpha");
  assert.equal(extractAtProject("mail me at a@b.com").ref, null); assert.equal(extractAtProject("no project here").ref, null);
});
test("match: exact beats partial, longest exact wins", () => {
  assert.equal(matchProjectRef("Lucifer OS", P).project.id, "1"); assert.equal(matchProjectRef("lucifer", P).project.id, "3");
  assert.equal(matchProjectRef("memtrans", P).project.id, "2");
});
test("match: trailing words are returned, not swallowed", () => { const r = matchProjectRef("Lucifer OS tomorrow", P); assert.equal(r.project.id, "1"); assert.equal(r.rest, "tomorrow"); });
test("match: ambiguity and unknown are reported, never guessed", () => {
  assert.deepEqual(matchProjectRef("Research", P).ambiguous.sort(), ["Research Alpha", "Research Beta"]);
  assert.equal(matchProjectRef("Nonexistent Thing", P).notFound, true);
});
test("match only searches the provided (per-user) project list", () => assert.equal(matchProjectRef("Lucifer OS", [{ id: "9", name: "Other" }]).notFound, true));
