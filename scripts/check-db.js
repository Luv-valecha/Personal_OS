const { client } = require("./_env");
(async () => {
  const db = client();
  try { await db.connect(); const r = await db.query("SELECT now() AS now, current_database() AS db");
    const t = await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='users'");
    console.log("✔ Connected to", r.rows[0].db, "at", r.rows[0].now.toISOString());
    console.log(t.rows[0].n ? "✔ Tables exist (migrations applied)" : "⚠ Tables missing — run: npm run db:migrate");
  } catch (e) { console.error("✖ Cannot connect:", e.message); process.exitCode = 1; } finally { await db.end().catch(() => {}); }
})();
