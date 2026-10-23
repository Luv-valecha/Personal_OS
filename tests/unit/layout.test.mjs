import test from "node:test"; import assert from "node:assert/strict";
import { WIDGETS, DEFAULT_LAYOUT, normalizeLayout } from "@/lib/layout";
const V3 = ["overview", "priority", "tasks", "timeline", "deadlines", "calendar", "quicklinks", "focus", "money", "splits", "projects", "notes", "weather", "activity"];
test("new users: V3 widgets visible as before; the 3 new V4 widgets exist but start hidden (dashboard not crowded)", () => {
  const n = normalizeLayout([]); assert.deepEqual(n.filter((w) => w.visible).map((w) => w.id), V3);
  for (const id of ["ideas", "bugs", "checklists"]) assert.equal(n.find((w) => w.id === id).visible, false, id);
  assert.equal(n.length, Object.keys(WIDGETS).length);
});
test("an existing user's saved V3 layout keeps its order, sizes and hidden choices; new widgets are added HIDDEN", () => {
  const custom = [...V3].reverse().map((id, k) => ({ id, visible: k % 3 !== 0, size: ["sm", "md", "lg"][k % 3] }));      // a realistic, fully customised V3 layout
  const n = normalizeLayout([...custom, { id: "gone-widget", visible: true, size: "md" }]);
  const v3Part = n.filter((w) => V3.includes(w.id));
  assert.deepEqual(v3Part, custom, "all 14 existing widgets: same order, visibility and size");
  assert.ok(!n.some((w) => w.id === "gone-widget"));
  for (const id of ["ideas", "bugs", "checklists"]) assert.equal(n.find((w) => w.id === id).visible, false, id);
  assert.equal(new Set(n.map((w) => w.id)).size, n.length);
});
test("a user who already enabled a new widget keeps it enabled", () => { const n = normalizeLayout([{ id: "bugs", visible: true, size: "lg" }]); assert.deepEqual(n.find((w) => w.id === "bugs"), { id: "bugs", visible: true, size: "lg" }); });
test("normalising is idempotent; garbage input is safe", () => { const a = normalizeLayout([{ id: "tasks", visible: false }]); assert.deepEqual(normalizeLayout(a), a); for (const bad of [null, undefined, "x", 5, [null], [{}], [{ id: 1 }]]) assert.equal(normalizeLayout(bad).length, Object.keys(WIDGETS).length); });
test("every registry widget has a default layout slot and valid size", () => { for (const id of Object.keys(WIDGETS)) { assert.ok(DEFAULT_LAYOUT.some((w) => w.id === id), id); assert.ok(["sm", "md", "lg"].includes(WIDGETS[id].defaultSize)); } });
