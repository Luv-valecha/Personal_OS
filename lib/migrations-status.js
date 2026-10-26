import "server-only";
import { query } from "@/lib/db";

// The V4 migrations the running code expects. tests/unit/migrations-status.test.mjs fails if a new file in db/migrations isn't listed here.
export const V4_MIGRATIONS = ["006_v4_core.sql", "007_jarvis_memory.sql", "008_bugs_checklists.sql", "009_glass_widgets.sql", "010_recurring_events.sql"];

// → names of expected migrations that have NOT been applied to the connected database ([] if everything is applied or the status can't be read).
export async function pendingMigrations() {
  try { const done = new Set((await query("SELECT name FROM _migrations")).map((r) => r.name)); return V4_MIGRATIONS.filter((m) => !done.has(m)); }
  catch { return []; }   // never block a page because the status check failed
}
