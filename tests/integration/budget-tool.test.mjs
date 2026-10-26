// REAL get_budget tool + real queries against a DEV Postgres in a throwaway schema.
import { test, before, after } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import pg from "pg"; import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
const base = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
if (!base || (/neon\.tech|supabase\.co/.test(base) && !process.env.ALLOW_REMOTE_TEST_DB)) { console.log("skipped: need a local DATABASE_URL_TEST"); process.exit(0); }
const schema = "t_" + Math.random().toString(36).slice(2, 10); const admin = new pg.Client({ connectionString: base });
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", C = "33333333-3333-3333-3333-333333333333", TODAY = "2026-10-10";
let T, S, Q, db; const call = (uid, cur) => S.currencyStore.run(cur, () => T.TOOLS.get_budget.run({}, { uid, today: TODAY, tz: "UTC" }));
before(async () => {
  await admin.connect(); await admin.query(`CREATE SCHEMA ${schema}; SET search_path=${schema},public`);
  for (const f of fs.readdirSync("db/migrations").sort()) await admin.query(fs.readFileSync(path.join("db/migrations", f), "utf8"));
  await admin.query(`INSERT INTO users(id,email,password_hash) VALUES ('${A}','a@x','x'),('${B}','b@x','x'),('${C}','c@x','x');
    INSERT INTO dashboard_settings(user_id,monthly_budget,currency) VALUES ('${A}',10000,'$'),('${B}',5000,'€'),('${C}',0,'₹');
    INSERT INTO expenses(user_id,amount,category,spent_on) VALUES ('${A}',1000,'food','2026-10-01'),('${A}',1500,'food','2026-10-10'),('${A}',999,'food','2026-09-30'),('${A}',700,'food','2026-10-20'),('${B}',4000,'x','2026-10-05'),('${C}',300,'x','2026-10-02');`);
  const u = new URL(base); u.searchParams.set("options", `-c search_path=${schema},public`); process.env.DATABASE_URL = u.toString();
  T = await import("@/lib/jarvis/tools"); S = T; Q = await import("@/lib/queries"); db = (await import("@/lib/db")).pool;
});
after(async () => { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); await db.end(); });

test("exact figures: budget 10,000, spent 2,500 this month-to-date (last month & future days excluded)", async () => {
  const r = await call(A, "$"); assert.equal(r.ok, true); const d = r.data;
  assert.equal(d.budget, 10000); assert.equal(d.spent_this_month, 2500); assert.equal(d.remaining, 7500); assert.equal(d.percent_used, 25);
  assert.equal(d.days_left_including_today, 22); assert.equal(d.daily_allowance, Math.round(7500 / 22)); assert.equal(d.projected_month_total, Math.round((2500 / 10) * 31)); assert.equal(d.over_budget, false); assert.equal(d.projected_over_budget, false);
});
test("JARVIS and the dashboard use the SAME month-to-date number", async () => assert.equal((await call(A, "$")).data.spent_this_month, (await Q.getMoney(A, TODAY)).month));
test("the answer uses the user's own currency symbol, never a hardcoded ₹", async () => {
  const card = JSON.stringify((await call(A, "$")).card); assert.ok(card.includes("$2,500") && card.includes("$10,000"), card); assert.ok(!card.includes("₹"));
  assert.ok(JSON.stringify((await call(B, "€")).card).includes("€4,000"));
});
test("over budget is reported plainly", async () => {
  await admin.query(`INSERT INTO expenses(user_id,amount,category,spent_on) VALUES ('${B}',2000,'x','2026-10-08')`);
  const d = (await call(B, "€")).data; assert.equal(d.spent_this_month, 6000); assert.equal(d.over_budget, true); assert.equal(d.remaining, -1000); assert.equal(d.daily_allowance, 0); assert.match(JSON.stringify((await call(B, "€")).card), /Over budget by €1,000/);
});
test("no budget set → says so (no invented number) and still reports spending", async () => {
  const r = await call(C, "₹"); assert.equal(r.data.budget, null); assert.equal(r.data.spent_this_month, 300); assert.match(JSON.stringify(r.card), /No monthly budget set/);
});
test("user isolation: each user sees only their own budget and spending", async () => { assert.equal((await call(A, "$")).data.budget, 10000); assert.equal((await call(B, "€")).data.budget, 5000); assert.notEqual((await call(A, "$")).data.spent_this_month, (await call(B, "€")).data.spent_this_month); });
test("currency can't leak between concurrent requests", async () => {
  const [x, y] = await Promise.all([call(A, "$"), (async () => { await new Promise((r) => setTimeout(r, 5)); return call(B, "€"); })()]);
  assert.ok(JSON.stringify(x.card).includes("$") && !JSON.stringify(x.card).includes("€")); assert.ok(JSON.stringify(y.card).includes("€") && !JSON.stringify(y.card).includes("$"));
});
test("the other expense tools now use the user's currency too (previously always ₹)", async () => {
  const r = await S.currencyStore.run("$", () => T.TOOLS.get_expense_summary.run({ period: "month" }, { uid: A, today: TODAY, tz: "UTC" }));
  assert.equal(r.data.currency, "$"); assert.ok(JSON.stringify(r.card).includes("$2,500"), JSON.stringify(r.card));
});
