// Measures REAL latency on YOUR setup so you can decide whether caching helps. Run:  npm run cache:bench
// Needs DATABASE_URL (Neon) and UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in .env.local. Uses ~ (N×2 + 2) Redis commands.
import pg from "pg"; import dotenv from "dotenv"; import { createUpstashBackend } from "../lib/cache/upstash.js";
dotenv.config({ path: ".env.local", quiet: true });
const N = Number(process.env.BENCH_N) || 25;
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const time = async (fn) => { const t = performance.now(); await fn(); return performance.now() - t; };
const report = (name, a) => console.log(`${name.padEnd(46)} p50 ${pct(a, 50).toFixed(1).padStart(7)} ms   p95 ${pct(a, 95).toFixed(1).padStart(7)} ms   (n=${a.length})`);
const url = process.env.DATABASE_URL; if (!url) { console.error("DATABASE_URL missing"); process.exit(1); }
const db = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } }); await db.connect();
await db.query("SELECT 1");   // warm the connection so we measure query time, not TLS setup
// The REAL dashboard loader (all widgets visible) for the first user in this database — read-only.
const { getDashboard } = await import("../lib/queries.js"); const u = (await db.query("SELECT id FROM users ORDER BY created_at LIMIT 1")).rows[0];
const dashTimes = []; if (u) { const all = new Set(["overview", "tasks", "deadlines", "calendar", "money", "focus", "priority", "timeline", "quicklinks", "splits", "projects", "notes", "activity"]); const today = new Date().toISOString().slice(0, 10);
  await getDashboard(u.id, today, "Asia/Kolkata", all); for (let i = 0; i < N; i++) dashTimes.push(await time(() => getDashboard(u.id, today, "Asia/Kolkata", all))); }
const dbTimes = []; for (let i = 0; i < N; i++) dbTimes.push(await time(() => db.query("SELECT t.id, t.title, t.priority, t.due_date, p.name FROM tasks t LEFT JOIN projects p ON p.id=t.project_id WHERE t.completed=false ORDER BY t.manual_position LIMIT 100")));
report("Database: open-tasks query (warm connection)", dbTimes);
if (dashTimes.length) report("Database: FULL dashboard load (all widgets)", dashTimes);
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const r = createUpstashBackend({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN, timeoutMs: 3000 });
  await r.set("lo4:bench", "x".repeat(2000), 60);
  const rt = []; for (let i = 0; i < N; i++) rt.push(await time(() => r.mget(["lo4:bench:ver", "lo4:bench"])));   // exactly what one cache lookup costs
  report("Redis: one cache lookup (pipelined GET×2)", rt); await r.del("lo4:bench");
  if (dashTimes.length) { const hit = pct(rt, 50), miss = pct(dashTimes, 50); console.log(`\nDashboard: a cache hit replaces ${miss.toFixed(0)} ms (DB, p50) with ${hit.toFixed(0)} ms (Redis, p50) → ${miss > hit * 1.3 ? "caching helps from here" : "NO clear gain from here — set DASHBOARD_CACHE=0 if your Vercel-side numbers look the same"}.`); }
console.log("\nA JARVIS cache hit costs one Redis lookup; a miss costs the AI call (typically hundreds of ms to seconds) + the lookup.\nCompare the rows above for plain data reads — only cache those if Redis is clearly faster than the database for you.");
} else console.log("(Redis not configured — set UPSTASH_REDIS_REST_URL / _TOKEN to benchmark it)");
await db.end();
