// DEV Postgres only; runs in a throwaway schema (001–008).
import { test, before, after } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import pg from "pg"; import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
const url = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
if (!url || (/neon\.tech|supabase\.co/.test(url) && !process.env.ALLOW_REMOTE_TEST_DB)) { console.log("skipped: need a local DATABASE_URL_TEST"); process.exit(0); }
const schema = "t_" + Math.random().toString(36).slice(2, 10);
const db = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
const n = async (s, p) => Number((await db.query(s, p)).rows[0].c);
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", PA = "aaaaaaaa-0000-0000-0000-000000000001", PA2 = "aaaaaaaa-0000-0000-0000-000000000002", PB = "bbbbbbbb-0000-0000-0000-000000000001";
before(async () => {
  await db.connect(); await db.query(`CREATE SCHEMA ${schema}; SET search_path=${schema},public`);
  for (const f of fs.readdirSync("db/migrations").sort()) await db.query(fs.readFileSync(path.join("db/migrations", f), "utf8"));
  await db.query(`INSERT INTO users(id,email,password_hash) VALUES ('${A}','a@x','x'),('${B}','b@x','x');
    INSERT INTO projects(id,user_id,name) VALUES ('${PA}','${A}','P'),('${PA2}','${A}','P2'),('${PB}','${B}','Other');`);
});
after(async () => { await db.query(`DROP SCHEMA ${schema} CASCADE`); await db.end(); });

test("all migrations 001–008 apply cleanly and 008 is re-runnable", async () => { await db.query(fs.readFileSync("db/migrations/008_bugs_checklists.sql", "utf8")); });
test("bug statuses/priorities are constrained", async () => {
  await assert.rejects(() => db.query(`INSERT INTO bugs(user_id,project_id,title,status) VALUES ('${A}','${PA}','x','bogus')`), /check/i);
  await db.query(`INSERT INTO bugs(user_id,project_id,title) VALUES ('${A}','${PA}','ok')`);
});
test("DB refuses a bug linked to ANOTHER user's project", async () => {
  await assert.rejects(() => db.query(`INSERT INTO bugs(user_id,project_id,title) VALUES ('${A}','${PB}','sneaky')`), /foreign key/i);
});
test("DB refuses a checklist linked to another user's project, and items on another user's checklist", async () => {
  await assert.rejects(() => db.query(`INSERT INTO checklists(user_id,project_id,title) VALUES ('${A}','${PB}','sneaky')`), /foreign key/i);
  const { rows } = await db.query(`INSERT INTO checklists(user_id,title) VALUES ('${B}','B list') RETURNING id`);
  await assert.rejects(() => db.query(`INSERT INTO checklist_items(checklist_id,user_id,text) VALUES ($1,'${A}','sneaky')`, [rows[0].id]), /foreign key/i);
});
test("project delete removes its bugs, linked checklists and their items — and nothing else", async () => {
  const cl = (await db.query(`INSERT INTO checklists(user_id,project_id,title) VALUES ('${A}','${PA}','linked') RETURNING id`)).rows[0].id;
  await db.query(`INSERT INTO checklist_items(checklist_id,user_id,text) VALUES ($1,'${A}','i1'),($1,'${A}','i2')`, [cl]);
  await db.query(`INSERT INTO checklists(user_id,title) VALUES ('${A}','standalone')`);
  await db.query(`INSERT INTO bugs(user_id,project_id,title) VALUES ('${A}','${PA2}','other-project-bug')`);
  await db.query("DELETE FROM projects WHERE id=$1 AND user_id=$2", [PA, A]);
  assert.equal(await n("SELECT count(*) c FROM bugs WHERE project_id=$1", [PA]), 0);
  assert.equal(await n("SELECT count(*) c FROM checklists WHERE id=$1", [cl]), 0);
  assert.equal(await n("SELECT count(*) c FROM checklist_items WHERE checklist_id=$1", [cl]), 0);
  assert.equal(await n("SELECT count(*) c FROM checklists WHERE title='standalone'"), 1);
  assert.equal(await n("SELECT count(*) c FROM bugs WHERE title='other-project-bug'"), 1);
  assert.equal(await n("SELECT count(*) c FROM checklists WHERE title='B list'"), 1);
});
test("deleting a checklist removes only its items", async () => {
  const cl = (await db.query(`INSERT INTO checklists(user_id,title) VALUES ('${A}','tmp') RETURNING id`)).rows[0].id;
  await db.query(`INSERT INTO checklist_items(checklist_id,user_id,text) VALUES ($1,'${A}','x')`, [cl]);
  await db.query("DELETE FROM checklists WHERE id=$1 AND user_id=$2", [cl, A]);
  assert.equal(await n("SELECT count(*) c FROM checklist_items WHERE checklist_id=$1", [cl]), 0);
});
