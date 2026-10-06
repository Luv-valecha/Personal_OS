// Applies db/migrations/*.sql in order, once each. Safe to re-run.  Use --reset to wipe the public schema first (dev only).
const fs = require("fs"); const path = require("path");
const { client } = require("./_env");
(async () => {
  const db = client(); await db.connect();
  try {
    if (process.argv.includes("--reset")) {
      if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset in production");
      await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); console.log("• schema reset");
    }
    await db.query("CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const dir = path.join(__dirname, "..", "db", "migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      const done = await db.query("SELECT 1 FROM _migrations WHERE name=$1", [f]);
      if (done.rowCount) { console.log("• skip", f); continue; }
      await db.query("BEGIN");
      try { await db.query(fs.readFileSync(path.join(dir, f), "utf8")); await db.query("INSERT INTO _migrations(name) VALUES($1)", [f]); await db.query("COMMIT"); console.log("✔ applied", f); }
      catch (e) { await db.query("ROLLBACK"); throw e; }
    }
    console.log("Migrations complete.");
  } catch (e) { console.error("✖ Migration failed:", e.message); process.exitCode = 1; } finally { await db.end(); }
})();
