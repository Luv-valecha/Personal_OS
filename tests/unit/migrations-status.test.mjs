import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
test("the migrations the app checks for are exactly the V4 files in db/migrations (add new ones to lib/migrations-status.js)", async () => {
  const { V4_MIGRATIONS } = await import("@/lib/migrations-status");
  const files = fs.readdirSync("db/migrations").filter((f) => /^\d{3}_.*\.sql$/.test(f) && Number(f.slice(0, 3)) >= 6).sort();
  assert.deepEqual([...V4_MIGRATIONS].sort(), files);
});
