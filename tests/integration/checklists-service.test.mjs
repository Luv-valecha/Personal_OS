// Runs the REAL lib/checklists.js against a DEV Postgres in a throwaway schema.
import { test, before, after } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import pg from "pg"; import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
const base = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
if (!base || (/neon\.tech|supabase\.co/.test(base) && !process.env.ALLOW_REMOTE_TEST_DB)) { console.log("skipped: need a local DATABASE_URL_TEST"); process.exit(0); }
const schema = "t_" + Math.random().toString(36).slice(2, 10);
const admin = new pg.Client({ connectionString: base });
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", PA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", PB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let svc, db; const texts = async (id) => (await db.query("SELECT text FROM checklist_items WHERE checklist_id=$1 ORDER BY position, created_at", [id])).rows.map((r) => r.text);
before(async () => {
  await admin.connect(); await admin.query(`CREATE SCHEMA ${schema}; SET search_path=${schema},public`);
  for (const f of fs.readdirSync("db/migrations").sort()) await admin.query(fs.readFileSync(path.join("db/migrations", f), "utf8"));
  await admin.query(`INSERT INTO users(id,email,password_hash) VALUES ('${A}','a@x','x'),('${B}','b@x','x'); INSERT INTO projects(id,user_id,name) VALUES ('${PA}','${A}','P'),('${PB}','${B}','Other');`);
  const u = new URL(base); u.searchParams.set("options", `-c search_path=${schema},public`); process.env.DATABASE_URL = u.toString();   // lib/db now points at the throwaway schema
  svc = await import("@/lib/checklists"); db = (await import("@/lib/db")).pool;
});
after(async () => { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); await db.end(); });

test("create, rename, add/edit/toggle/delete items; progress data persists", async () => {
  const c = await svc.createChecklist(A, { title: "  Packing  " }); assert.equal(c.title, "Packing");
  await svc.renameChecklist(A, c.id, "Trip packing");
  const i1 = await svc.addItem(A, c.id, "Passport"), i2 = await svc.addItem(A, c.id, "Charger"), i3 = await svc.addItem(A, c.id, "Socks");
  assert.deepEqual(await texts(c.id), ["Passport", "Charger", "Socks"]);
  await svc.updateItem(A, i1.id, { done: true });
  let row = (await svc.listChecklists(A)).find((x) => x.id === c.id); assert.equal(row.title, "Trip packing"); assert.deepEqual(row.items.map((i) => [i.text, i.done]), [["Passport", true], ["Charger", false], ["Socks", false]]);
  assert.ok((await db.query("SELECT completed_at FROM checklist_items WHERE id=$1", [i1.id])).rows[0].completed_at);
  await svc.updateItem(A, i1.id, { done: false }); assert.equal((await db.query("SELECT completed_at FROM checklist_items WHERE id=$1", [i1.id])).rows[0].completed_at, null);
  await svc.updateItem(A, i2.id, { text: "Phone charger" });   // editing text must not touch done
  await svc.updateItem(A, i2.id, { done: true });              // toggling must not touch text
  assert.deepEqual((await db.query("SELECT text, done FROM checklist_items WHERE id=$1", [i2.id])).rows[0], { text: "Phone charger", done: true });
  await svc.moveItem(A, i3.id, "up"); assert.deepEqual(await texts(c.id), ["Passport", "Socks", "Phone charger"]);
  await svc.moveItem(A, i3.id, "up"); await svc.moveItem(A, i3.id, "up"); assert.deepEqual(await texts(c.id), ["Socks", "Passport", "Phone charger"]);   // top edge is a no-op
  await svc.deleteItem(A, i1.id); assert.deepEqual(await texts(c.id), ["Socks", "Phone charger"]);
  await svc.deleteChecklist(A, c.id); assert.equal((await db.query("SELECT 1 FROM checklist_items WHERE checklist_id=$1", [c.id])).rowCount, 0);
});
test("validation: empty/whitespace titles and items are rejected", async () => {
  await assert.rejects(() => svc.createChecklist(A, { title: "   " })); const c = await svc.createChecklist(A, { title: "V" });
  await assert.rejects(() => svc.addItem(A, c.id, "  ")); await assert.rejects(() => svc.renameChecklist(A, c.id, ""));
});
test("user isolation: B cannot see, rename, add to, edit, move or delete A's checklist", async () => {
  const c = await svc.createChecklist(A, { title: "Private" }); const it = await svc.addItem(A, c.id, "secret item");
  assert.equal((await svc.listChecklists(B)).some((x) => x.id === c.id), false);
  await assert.rejects(() => svc.renameChecklist(B, c.id, "hacked"), /not found/i);
  await assert.rejects(() => svc.addItem(B, c.id, "injected"), /not found/i);
  await assert.rejects(() => svc.updateItem(B, it.id, { done: true }), /not found/i);
  await assert.rejects(() => svc.moveItem(B, it.id, "down"), /not found/i);
  await svc.deleteItem(B, it.id); await svc.deleteChecklist(B, c.id);               // silently affects nothing
  assert.deepEqual(await texts(c.id), ["secret item"]); assert.equal((await svc.listChecklists(A)).some((x) => x.id === c.id), true);
});
test("cannot link a checklist to another user's project; own project works", async () => {
  await assert.rejects(() => svc.createChecklist(A, { title: "x", project_id: PB }), /project not found/i);
  const c = await svc.createChecklist(A, { title: "Setup", project_id: PA }); assert.equal((await svc.listChecklists(A)).find((x) => x.id === c.id).project_name, "P");
});
test("project deletion removes its linked checklist (policy) but not standalone ones", async () => {
  const linked = await svc.createChecklist(A, { title: "linked2", project_id: PA }), solo = await svc.createChecklist(A, { title: "solo2" });
  await db.query("DELETE FROM projects WHERE id=$1 AND user_id=$2", [PA, A]);
  const ids = (await svc.listChecklists(A)).map((x) => x.id); assert.ok(!ids.includes(linked.id)); assert.ok(ids.includes(solo.id));
});
