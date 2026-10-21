// Integration test (needs a DEV Postgres): DATABASE_URL_TEST or DATABASE_URL. Runs in a throwaway schema; never touches real tables.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import pg from "pg";
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
if (!url) { console.log("skipped: no DATABASE_URL_TEST"); process.exit(0); }
if (/neon\.tech|supabase\.co/.test(url) && !process.env.ALLOW_REMOTE_TEST_DB) { console.log("refusing remote DB without ALLOW_REMOTE_TEST_DB=1"); process.exit(0); }
const schema = "t_" + Math.random().toString(36).slice(2, 10);
const db = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
const dir = path.resolve("db/migrations");
const run = (f) => db.query(fs.readFileSync(path.join(dir, f), "utf8"));
const n = async (sql, p) => Number((await db.query(sql, p)).rows[0].c);
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
const P1 = "aaaaaaaa-0000-0000-0000-000000000001", P2 = "aaaaaaaa-0000-0000-0000-000000000002", PB = "bbbbbbbb-0000-0000-0000-000000000001";

before(async () => {
  await db.connect(); await db.query(`CREATE SCHEMA ${schema}; SET search_path=${schema},public`);
  for (const f of ["001_init.sql", "002_v2.sql", "003_v3.sql", "004_splits.sql", "005_mobile_tokens.sql"]) await run(f);   // pre-V4 state
  await db.query(`INSERT INTO users(id,email,password_hash) VALUES ('${A}','a@x','x'),('${B}','b@x','x');
    INSERT INTO projects(id,user_id,name) VALUES ('${P1}','${A}','P1'),('${P2}','${A}','P2'),('${PB}','${B}','Other');
    INSERT INTO tasks(user_id,project_id,title,due_date) VALUES ('${A}','${P1}','t-p1','2026-11-01'),('${A}','${P2}','t-p2',NULL),('${A}',NULL,'t-none',NULL),('${B}','${PB}','t-other',NULL);
    INSERT INTO ideas(user_id,project_id,title) VALUES ('${A}','${P1}','i-p1'),('${A}','${P2}','i-p2');
    INSERT INTO notes(user_id,project_id,title) VALUES ('${A}','${P1}','n-p1');
    INSERT INTO deadlines(user_id,project_id,title,due_date) VALUES ('${A}','${P1}','d-p1',current_date);
    INSERT INTO files(user_id,project_id,name,size_bytes) VALUES ('${A}','${P1}','f-p1',1);`);
});
after(async () => { await db.query(`DROP SCHEMA ${schema} CASCADE`); await db.end(); });

test("006 preserves all existing rows and leaves due_date untouched", async () => {
  const before = await n("SELECT count(*) c FROM tasks");
  await run("006_v4_core.sql");
  assert.equal(await n("SELECT count(*) c FROM tasks"), before);
  assert.equal(await n("SELECT count(*) c FROM tasks WHERE scheduled_date IS NOT NULL"), 0);        // new column is optional/empty
  assert.equal((await db.query("SELECT due_date::text d FROM tasks WHERE title='t-p1'")).rows[0].d, "2026-11-01");
});
test("006 is idempotent (safe to re-run)", async () => { await run("006_v4_core.sql"); });

test("failed project delete rolls back completely (no partial deletion)", async () => {
  await db.query("CREATE FUNCTION boom() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'simulated failure'; END $$ LANGUAGE plpgsql");
  await db.query("CREATE TRIGGER boom_t BEFORE DELETE ON files FOR EACH ROW EXECUTE FUNCTION boom()");
  await assert.rejects(() => db.query("DELETE FROM projects WHERE id=$1 AND user_id=$2", [P1, A]), /simulated failure/);
  assert.equal(await n("SELECT count(*) c FROM tasks WHERE project_id=$1", [P1]), 1);
  assert.equal(await n("SELECT count(*) c FROM projects WHERE id=$1", [P1]), 1);
  await db.query("DROP TRIGGER boom_t ON files; DROP FUNCTION boom()");
});

test("deleting a project deletes its tasks, ideas, notes, deadlines, files — and nothing else", async () => {
  await db.query("DELETE FROM projects WHERE id=$1 AND user_id=$2", [P1, A]);
  for (const t of ["tasks", "ideas", "notes", "deadlines", "files"]) assert.equal(await n(`SELECT count(*) c FROM ${t} WHERE project_id=$1`, [P1]), 0, t);
  assert.equal(await n("SELECT count(*) c FROM tasks WHERE title='t-p2'"), 1);       // other project intact
  assert.equal(await n("SELECT count(*) c FROM ideas WHERE title='i-p2'"), 1);
  assert.equal(await n("SELECT count(*) c FROM tasks WHERE title='t-none'"), 1);     // unassigned task intact
  assert.equal(await n("SELECT count(*) c FROM tasks WHERE title='t-other'"), 1);    // other user intact
});
test("service-style delete with the wrong user_id deletes nothing (ownership)", async () => {
  const r = await db.query("DELETE FROM projects WHERE id=$1 AND user_id=$2", [P2, B]);
  assert.equal(r.rowCount, 0); assert.equal(await n("SELECT count(*) c FROM tasks WHERE project_id=$1", [P2]), 1);
});
