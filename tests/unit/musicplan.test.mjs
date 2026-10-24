import test from "node:test"; import assert from "node:assert/strict";
import { planPlayback, playAction, resolveSource, sourceKey } from "@/lib/musicplan";
test("plays only what this device can play, keeps playlist order, and says what was skipped", () => {
  const r = planPlayback(["a", "b", "c", "d"], ["d", "b", "a"]); assert.deepEqual(r.ids, ["a", "b", "d"]); assert.equal(r.skipped, 1); assert.match(r.note, /3 of 4/);
  assert.deepEqual(planPlayback(["a", "b"], ["a", "b"]), { ids: ["a", "b"], skipped: 0, note: "" });
});
test("empty list and 'no files linked here' give clear, different messages and never start playback", () => {
  const e = planPlayback([], ["a"]); assert.deepEqual(e.ids, []); assert.match(e.note, /Nothing to play/);
  const n = planPlayback(["a", "b"], []); assert.deepEqual(n.ids, []); assert.match(n.note, /linked on this device/);
});
test("Play button: resumes/pauses its own list, restarts if the queue was changed elsewhere", () => {
  const active = { key: sourceKey(["a", "b"]) };
  assert.equal(playAction({ active, queue: ["a", "b"], current: "a" }), "toggle");
  assert.equal(playAction({ active, queue: ["x"], current: "x" }), "start");      // user played something else meanwhile
  assert.equal(playAction({ active: null, queue: ["a", "b"], current: "a" }), "start");   // nothing started from this widget yet
  assert.equal(playAction({ active, queue: [], current: null }), "start");
});
test("a deleted playlist falls back to 'All songs'", () => { assert.equal(resolveSource("p9", [{ id: "p1" }]), "all"); assert.equal(resolveSource("p1", [{ id: "p1" }]), "p1"); assert.equal(resolveSource(null, []), "all"); assert.equal(resolveSource("all", [{ id: "p1" }]), "all"); });
