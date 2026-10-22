// Runs the REAL filter SQL against a dev Postgres in a throwaway schema.
import { test, before, after } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import pg from "pg"; import dotenv from "dotenv";
import { buildTaskFilter } from "@/lib/jarvis/taskquery";
dotenv.config({ path: ".env.local", quiet: true });
const url = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
if (!url || (/neon\.tech|supabase\.co/.test(url) && !process.env.ALLOW_REMOTE_TEST_DB)) { console.log("skipped: need a local DATABASE_URL_TEST"); process.exit(0); }
const schema = "t_" + Math.random().toString(36).slice(2, 10);
const db = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", PL = "aaaaaaaa-0000-0000-0000-000000000001", PR = "aaaaaaaa-0000-0000-0000-000000000002", PB = "bbbbbbbb-0000-0000-0000-000000000001";
const T = "2026-10-22", ctx = { uid: A, today: T, tz: "UTC" };
const titles = async (args, c = ctx) => { const f = buildTaskFilter(args, c); return (await db.query(`SELECT t.title FROM tasks t WHERE ${f.where} ORDER BY ${f.orderBy} LIMIT ${f.limit}`, f.params)).rows.map((r) => r.title).sort(); };
const count = async (args, c = ctx) => { const f = buildTaskFilter(args, c); return Number((await db.query(`SELECT count(*) c FROM tasks t WHERE ${f.where}`, f.params)).rows[0].c); };

before(async () => {
  await db.connect(); await db.query(`CREATE SCHEMA ${schema}; SET search_path=${schema},public`);
  for (const f of fs.readdirSync("db/migrations").filter((x) => /^00[1-6]_/.test(x)).sort()) await db.query(fs.readFileSync(path.join("db/migrations", f), "utf8"));
  await db.query(`INSERT INTO users(id,email,password_hash) VALUES ('${A}','a@x','x'),('${B}','b@x','x');
   INSERT INTO projects(id,user_id,name) VALUES ('${PL}','${A}','Lucifer OS'),('${PR}','${A}','Research'),('${PB}','${B}','Lucifer OS');`);
  const ins = `INSERT INTO tasks(user_id,project_id,title,priority,due_date,scheduled_date,completed,completed_at) VALUES `;
  await db.query(ins + [
    `('${A}','${PL}','sched-today-LOS','high',NULL,'${T}',false,NULL)`,
    `('${A}','${PR}','sched-today-research','low',NULL,'${T}',false,NULL)`,
    `('${A}','${PL}','sched-tomorrow','medium',NULL,'2026-10-23',false,NULL)`,
    `('${A}',NULL,'due-today-unscheduled','medium','${T}',NULL,false,NULL)`,
    `('${A}',NULL,'due-today-but-sched-later','medium','${T}','2026-10-25',false,NULL)`,   // scheduled later → NOT a "today" task on the either-basis
    `('${A}','${PL}','overdue-high','high','2026-10-10',NULL,false,NULL)`,
    `('${A}',NULL,'due-this-week','low','2026-10-24',NULL,false,NULL)`,
    `('${A}',NULL,'due-next-week','low','2026-10-28',NULL,false,NULL)`,
    `('${A}','${PL}','done-this-month','high',NULL,NULL,true,'2026-10-05 10:00+00')`,
    `('${A}',NULL,'done-last-month','medium',NULL,NULL,true,'2026-09-15 10:00+00')`,
    `('${A}',NULL,'no-dates','medium',NULL,NULL,false,NULL)`,
    `('${B}','${PB}','OTHER-USER-today','high',NULL,'${T}',false,NULL)`,
  ].join(","));
});
after(async () => { await db.query(`DROP SCHEMA ${schema} CASCADE`); await db.end(); });

test("today (either basis): scheduled today OR due today when unscheduled", async () => assert.deepEqual(await titles({ when: "today" }), ["due-today-unscheduled", "sched-today-LOS", "sched-today-research"]));
test("scheduled-only today / due-only today are different sets", async () => {
  assert.deepEqual(await titles({ when: "today", date_field: "scheduled" }), ["sched-today-LOS", "sched-today-research"]);
  assert.deepEqual(await titles({ when: "today", date_field: "due" }), ["due-today-but-sched-later", "due-today-unscheduled"]);
});
test("tomorrow", async () => assert.deepEqual(await titles({ when: "tomorrow" }), ["sched-tomorrow"]));
test("overdue = open with due date before today", async () => assert.deepEqual(await titles({ when: "overdue" }), ["overdue-high"]));
test("due this week (Mon–Sun)", async () => assert.deepEqual(await titles({ when: "this_week", date_field: "due" }), ["due-this-week", "due-today-but-sched-later", "due-today-unscheduled"]));
test("project filter (own project only; other user's same-named project excluded)", async () => assert.deepEqual(await titles({ project_id: PL }), ["overdue-high", "sched-today-LOS", "sched-tomorrow"]));
test("completed / incomplete high priority", async () => {
  assert.deepEqual(await titles({ status: "completed" }), ["done-last-month", "done-this-month"]);
  assert.deepEqual(await titles({ status: "open", priority: "high" }), ["overdue-high", "sched-today-LOS"]);
});
test("combination: project + date + priority", async () => {
  assert.deepEqual(await titles({ when: "today", date_field: "scheduled", project_id: PL, priority: "high" }), ["sched-today-LOS"]);
  assert.deepEqual(await titles({ when: "today", date_field: "scheduled", project_id: PR, priority: "high" }), []);   // empty result
});
test("how many completed this month → exact DB count", async () => { assert.equal(await count({ status: "completed", completed_when: "this_month" }), 1); assert.equal(await count({ status: "completed", completed_when: "last_month" }), 1); });
test("next three tasks: limit + due ordering", async () => assert.equal((await titles({ limit: 3, sort: "due", status: "open" })).length, 3));
test("user isolation", async () => {
  assert.ok(!(await titles({ when: "today" })).includes("OTHER-USER-today"));
  assert.deepEqual(await titles({ when: "today" }, { ...ctx, uid: B }), ["OTHER-USER-today"]);
  assert.deepEqual(await titles({ project_id: PB }), []);   // another user's project id yields nothing for user A
});
test("hostile search string is just data", async () => assert.deepEqual(await titles({ search: "x'; DROP TABLE tasks;--" }), []));
