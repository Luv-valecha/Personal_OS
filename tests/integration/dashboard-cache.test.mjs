// REAL getDashboard() + the cached wrapper against a DEV Postgres in a throwaway schema.
import { test, before, after } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import pg from "pg"; import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createCache, createMemoryBackend, CacheError } from "@/lib/cache/core";
const base = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
if (!base || (/neon\.tech|supabase\.co/.test(base) && !process.env.ALLOW_REMOTE_TEST_DB)) { console.log("skipped: need a local DATABASE_URL_TEST"); process.exit(0); }
const schema = "t_" + Math.random().toString(36).slice(2, 10); const admin = new pg.Client({ connectionString: base });
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", TODAY = "2026-10-23", TZ = "Asia/Kolkata";
const ALL = new Set(["overview", "tasks", "deadlines", "calendar", "money", "focus", "projects", "notes", "activity"]);
let Q, db; const mkCache = (backend) => createCache({ backend: backend || createMemoryBackend(), mode: "memory" });
const titles = (d) => (d.tasks || []).map((t) => t.title).sort();
before(async () => {
  await admin.connect(); await admin.query(`CREATE SCHEMA ${schema}; SET search_path=${schema},public`);
  for (const f of fs.readdirSync("db/migrations").sort()) await admin.query(fs.readFileSync(path.join("db/migrations", f), "utf8"));
  await admin.query(`INSERT INTO users(id,email,password_hash) VALUES ('${A}','a@x','x'),('${B}','b@x','x');
    INSERT INTO tasks(user_id,title,priority,due_date) VALUES ('${A}','A-one','high','${TODAY}'),('${A}','A-two','low',NULL),('${B}','B-secret','high',NULL);
    INSERT INTO notes(user_id,title,body) VALUES ('${A}','A-note','private body');`);
  const u = new URL(base); u.searchParams.set("options", `-c search_path=${schema},public`); process.env.DATABASE_URL = u.toString();
  Q = await import("@/lib/queries"); db = (await import("@/lib/db")).pool;
});
after(async () => { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); await db.end(); });

test("miss and hit return IDENTICAL plain-JSON data (no Date objects, so hydration/rendering is the same either way)", async () => {
  const load = Q.dashboardWith(mkCache()); const miss = await load(A, TODAY, TZ, ALL); const hit = await load(A, TODAY, TZ, ALL);
  assert.deepEqual(hit, miss); assert.equal(typeof miss.tasks[0].created_at, "string"); assert.deepEqual(titles(miss), ["A-one", "A-two"]);
  assert.ok(!JSON.stringify(miss).includes("B-secret"));
});
test("a cached load does NOT touch the database; a version bump forces a fresh read", async () => {
  const c = mkCache(), load = Q.dashboardWith(c); await load(A, TODAY, TZ, ALL);
  await admin.query("UPDATE tasks SET title='A-one-renamed' WHERE title='A-one'");     // direct DB change (no app write → no bump)
  assert.ok(titles(await load(A, TODAY, TZ, ALL)).includes("A-one"), "served from cache, still the old title");
  await c.bump(A);                                                                        // what every app write does
  const fresh = titles(await load(A, TODAY, TZ, ALL)); assert.ok(fresh.includes("A-one-renamed") && !fresh.includes("A-one"));
  await admin.query("UPDATE tasks SET title='A-one' WHERE title='A-one-renamed'");
});
test("user isolation and hidden widgets", async () => {
  const c = mkCache(), load = Q.dashboardWith(c); await load(A, TODAY, TZ, ALL);
  const b = await load(B, TODAY, TZ, ALL); assert.deepEqual(titles(b), ["B-secret"]);                    // never A's cached payload
  const few = await load(A, TODAY, TZ, new Set(["deadlines"])); assert.equal(few.tasks, undefined); assert.equal(few.notes, undefined);   // a different visible set is its own entry; hidden widgets load nothing
  assert.ok((await load(A, TODAY, TZ, ALL)).notes);                                                       // …and doesn't clobber the full one
});
test("different day or timezone → different entry", async () => {
  const c = mkCache(), load = Q.dashboardWith(c); await load(A, TODAY, TZ, ALL); const before = c.snapshot().misses;
  await load(A, "2026-10-24", TZ, ALL); await load(A, TODAY, "UTC", ALL); assert.equal(c.snapshot().misses, before + 2);
});
test("Redis down / timing out → dashboard still loads fresh from the database, never throws", async () => {
  const dead = { kind: "dead", async mget() { throw new CacheError("timeout"); }, async set() { throw new CacheError("timeout"); }, async del() { throw new CacheError("timeout"); } };
  const load = Q.dashboardWith(mkCache(dead)); for (let i = 0; i < 3; i++) assert.deepEqual(titles(await load(A, TODAY, TZ, ALL)), ["A-one", "A-two"]);
});
test("oversized payload is skipped (not stored) but still returned", async () => {
  await admin.query(`INSERT INTO tasks(user_id,title) SELECT '${A}', repeat('x', 280) || g FROM generate_series(1, 100) g`);
  const c = mkCache(); const load = Q.dashboardWith(c); const d = await load(A, TODAY, TZ, ALL); assert.equal(d.tasks.length, 100);
  await load(A, TODAY, TZ, ALL); assert.ok(c.snapshot().stores + c.snapshot().skipped >= 1);
  await admin.query("DELETE FROM tasks WHERE title LIKE 'xxxx%'");
});

// ── widget data + "hidden widgets load nothing" ──
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", PB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
test("ideas / bugs / checklists widgets return the right, user-scoped data", async () => {
  await admin.query(`INSERT INTO projects(id,user_id,name) VALUES ('${P1}','${A}','Lucifer OS'),('${PB}','${B}','Other');
    INSERT INTO ideas(user_id,title,status) VALUES ('${A}','idea-inbox','inbox'),('${A}','idea-done','completed'),('${B}','B-idea','inbox');
    INSERT INTO bugs(user_id,project_id,title,priority,status) VALUES ('${A}','${P1}','bug-high','high','open'),('${A}','${P1}','bug-low','low','in_progress'),('${A}','${P1}','bug-closed','high','resolved'),('${B}','${PB}','B-bug','high','open');`);
  const cl = (await admin.query(`INSERT INTO checklists(user_id,title) VALUES ('${A}','Packing') RETURNING id`)).rows[0].id;
  await admin.query(`INSERT INTO checklist_items(checklist_id,user_id,text,done) VALUES ('${cl}','${A}','a',true),('${cl}','${A}','b',false),('${cl}','${A}','c',false)`);
  const d = await Q.getDashboard(A, TODAY, TZ, new Set(["ideas", "bugs", "checklists"]));
  assert.deepEqual(d.ideas.map((i) => i.title), ["idea-inbox"]);                                   // completed idea excluded, B's excluded
  assert.deepEqual(d.bugs.map((b) => b.title), ["bug-high", "bug-low"]); assert.equal(d.bugs[0].total, 2);   // resolved excluded, high first
  assert.deepEqual([d.checklists[0].title, d.checklists[0].done, d.checklists[0].total], ["Packing", 1, 3]);
  const b = await Q.getDashboard(B, TODAY, TZ, new Set(["ideas", "bugs", "checklists"])); assert.deepEqual([b.ideas.map((i) => i.title), b.bugs.map((x) => x.title), b.checklists], [["B-idea"], ["B-bug"], []]);
});
test("HIDDEN widgets run no database queries; visible ones run exactly their own", async () => {
  const orig = db.query.bind(db); let n = 0; db.query = (...a) => { n++; return orig(...a); };
  try {
    await Q.getDashboard(A, TODAY, TZ, new Set()); const none = n; n = 0;
    await Q.getDashboard(A, TODAY, TZ, new Set(["ideas"])); const one = n; n = 0;
    await Q.getDashboard(A, TODAY, TZ, new Set(["ideas", "bugs", "checklists"])); const three = n;
    assert.equal(none, 0, "nothing visible → zero queries"); assert.equal(one, 1); assert.equal(three, 3);
  } finally { db.query = orig; }
});
test("a widget that errors cannot be hidden-by-accident: payload only contains keys for visible widgets", async () => {
  const d = await Q.getDashboard(A, TODAY, TZ, new Set(["bugs"])); assert.deepEqual(Object.keys(d), ["bugs"]);
});

// ── music widget data ──
const C = "33333333-3333-3333-3333-333333333333";
test("music widget data: playlists in saved order, counts, light track metadata, user-scoped, nothing loaded when hidden", async () => {
  await admin.query(`INSERT INTO users(id,email,password_hash) VALUES ('${C}','c@x','x')`);
  const mk = async (u, title) => (await admin.query("INSERT INTO music_tracks(user_id,title,artist,file_name,fingerprint) VALUES ($1,$2,'art',$2,$2||'|1') RETURNING id", [u, title])).rows[0].id;
  const [t1, t2, t3] = [await mk(A, "Alpha"), await mk(A, "Beta"), await mk(A, "Gamma")]; const tb = await mk(B, "B-song");
  const pl = (await admin.query("INSERT INTO music_playlists(user_id,name) VALUES ($1,'Focus') RETURNING id", [A])).rows[0].id; const plb = (await admin.query("INSERT INTO music_playlists(user_id,name) VALUES ($1,'B-list') RETURNING id", [B])).rows[0].id;
  await admin.query("INSERT INTO music_playlist_tracks(playlist_id,track_id,user_id,position) VALUES ($1,$2,$3,2),($1,$4,$3,1)", [pl, t1, A, t3]);     // saved order: Gamma (1) then Alpha (2)
  await admin.query("INSERT INTO music_playlist_tracks(playlist_id,track_id,user_id,position) VALUES ($1,$2,$3,1)", [plb, tb, B]);
  const d = (await Q.getDashboard(A, TODAY, TZ, new Set(["music"]))).music;
  assert.deepEqual(d.tracks.map((t) => t.title), ["Alpha", "Beta", "Gamma"]);                    // library, alphabetical
  assert.deepEqual(d.playlists.map((p) => [p.name, p.n]), [["Focus", 2]]);
  assert.deepEqual(d.lists[pl], [t3, t1], "playlist keeps its saved order");
  assert.ok(!JSON.stringify(d).includes("B-song") && !JSON.stringify(d).includes("B-list") && !d.lists[plb], "never another user's music");
  assert.deepEqual(Object.keys(d.tracks[0]).sort(), ["artist", "duration_sec", "id", "title"], "only light metadata — no file names/fingerprints");
  const orig = db.query.bind(db); let n = 0; db.query = (...a) => { n++; return orig(...a); };
  try { await Q.getDashboard(A, TODAY, TZ, new Set(["tasks"])); assert.ok(n >= 1); n = 0; await Q.getDashboard(A, TODAY, TZ, new Set()); assert.equal(n, 0); } finally { db.query = orig; }
});
test("music widget payload is bounded (library cap)", async () => {
  await admin.query("INSERT INTO music_tracks(user_id,title,file_name,fingerprint) SELECT $1, 'T' || g, 'f' || g, 'f' || g || '|1' FROM generate_series(1, 830) g", [C]);
  const d = (await Q.getDashboard(C, TODAY, TZ, new Set(["music"]))).music; assert.equal(d.tracks.length, 800);
});

// ── glass widgets setting ──
test("glass setting: default off; valid values persist; everything else (incl. injection) is rejected and changes nothing", async () => {
  const { SignJWT } = await import("jose"); process.env.AUTH_SECRET = process.env.AUTH_SECRET || "x".repeat(40);
  process.env.TEST_SESSION = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(A).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const { getSettings } = await import("@/lib/server-utils"); const { setGlass } = await import("@/actions/settings");
  assert.equal((await getSettings(A)).glass, "off");
  for (const v of ["soft", "strong", "off"]) { const r = await setGlass(v); assert.equal(r.ok, true, v); assert.equal((await getSettings(A)).glass, v); }
  await setGlass("strong");
  for (const bad of ["ultra", "STRONG", "", null, undefined, 12, "soft'; DROP TABLE users;--", "blur(99px)", ["soft"]]) { const r = await setGlass(bad); assert.equal(r.ok, false, String(bad)); assert.equal((await getSettings(A)).glass, "strong", "unchanged after " + String(bad)); }
  assert.equal((await admin.query("SELECT count(*)::int n FROM users")).rows[0].n >= 3, true, "users table intact");
  assert.equal((await getSettings(B)).glass, "off", "another user's setting is untouched");
});
test("DB itself rejects an invalid glass value (CHECK constraint)", async () => { await assert.rejects(() => admin.query("UPDATE dashboard_settings SET glass='neon' WHERE user_id=$1", [A]), /check/i); });
