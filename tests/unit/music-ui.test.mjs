import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
import { miniPlayerVisible as vis } from "@/lib/music-ui";
const mp = fs.readFileSync("components/music/MiniPlayer.jsx", "utf8"), prov = fs.readFileSync("components/music/MusicProvider.jsx", "utf8");
test("the bar shows only when there is a current track AND it hasn't been dismissed", () => {
  assert.equal(vis({ queue: ["a", "b"], index: 0, dismissed: false }), true); assert.equal(vis({ queue: ["a", "b"], index: 0, dismissed: true }), false);
  for (const s of [{ queue: [], index: -1 }, { queue: ["a"], index: -1 }, { queue: ["a"], index: 5 }, { queue: null, index: 0 }]) assert.equal(vis({ ...s, dismissed: false }), false, JSON.stringify(s));
});
test("dismissing does NOT touch the queue (it's a different action from 'Clear queue')", () => {
  const dismiss = prov.match(/dismiss\(\)\s*\{[^}]*\}/)[0]; assert.ok(!/setQueue|setIndex|removeAttribute|clearQueue/.test(dismiss), dismiss); assert.match(dismiss, /pause\(\)/); assert.match(dismiss, /setDismissed\(true\)/);
  assert.match(prov, /clearQueue\(\)[^\n]*setQueue\(\[\]\)/, "Clear queue still empties the queue");
});
test("starting playback (any track, or the play toggle) brings the player back", () => {
  assert.match(prov.match(/const loadIndex[\s\S]*?setIndex\(i\)/)[0], /setDismissed\(false\)/); assert.match(prov.match(/toggle\(\)\s*\{[^\n]*/)[0], /setDismissed\(false\)/);
});
test("the choice survives reloads and page changes (persisted), and the page padding follows visibility", () => {
  assert.match(prov, /setDismissed\(!!s\.dismissed\)/); assert.match(prov, /index, volume, shuffle, repeat, dismissed \}\)/); assert.match(prov, /classList\.toggle\("has-mini", miniPlayerVisible/);
});
test("REGRESSION: the ✕ is visible on PHONES (it used to be 'hidden sm:inline-flex', i.e. missing on small screens) and dismisses instead of clearing", () => {
  const line = mp.split("\n").find((l) => l.includes('aria-label="Close player"')); assert.ok(line, "close button exists");
  assert.ok(!/\bhidden\b/.test(line) && !/sm:inline-flex/.test(line), "must not be hidden at any width: " + line); assert.match(line, /onClick=\{m\.dismiss\}/); assert.ok(!/clearQueue/.test(line));
  assert.match(mp, /miniPlayerVisible\(\{ queue: m\.queue, index: m\.index, dismissed: m\.dismissed \}\)/);
});
