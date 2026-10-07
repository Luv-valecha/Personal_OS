import "server-only";
import { query, one } from "@/lib/db";
import { THEME_IDS } from "@/lib/themes";

// Slideshow entries are either a built-in theme id ("batman") or "custom:<uuid>" for a user's saved custom theme.
export const MIN_INTERVAL = 5, MAX_INTERVAL = 10080;
export const isBuiltin = (id) => THEME_IDS.includes(id) && id !== "custom";

// Resolve a slideshow entry into the {theme, active_custom_theme} columns stored in dashboard_settings.
export const entryToTheme = (e) => (e.startsWith("custom:") ? { theme: "custom", custom: e.slice(7) } : { theme: e, custom: null });
export const currentEntry = (s) => (s.theme === "custom" && s.active_custom_theme ? `custom:${s.active_custom_theme}` : s.theme);

// Valid entries only: built-ins that exist and custom themes owned by this user.
export async function cleanEntries(uid, entries) {
  const out = []; const seen = new Set();
  const mine = new Set((await query("SELECT id FROM themes WHERE user_id=$1", [uid])).map((r) => r.id));
  for (const e of Array.isArray(entries) ? entries : []) {
    if (typeof e !== "string" || seen.has(e)) continue;
    if (isBuiltin(e) || (e.startsWith("custom:") && mine.has(e.slice(7)))) { seen.add(e); out.push(e); }
  }
  return out;
}

// Atomically advance the slideshow if it is due. Safe to call from many tabs/devices: the conditional UPDATE
// (WHERE slideshow_next_at <= now()) means only one caller wins. Skipped intervals (app closed for hours) are
// counted so the rotation stays deterministic. Returns the new settings row or null if nothing was due.
export async function advanceIfDue(uid, force = false) {
  const s = await one("SELECT * FROM dashboard_settings WHERE user_id=$1", [uid]);
  if (!s || !s.slideshow_enabled || (s.slideshow_paused && !force)) return null;
  const list = await cleanEntries(uid, s.slideshow_themes);
  if (list.length < 2) return null;
  const intervalMs = s.slideshow_interval_min * 60000; const next = s.slideshow_next_at ? new Date(s.slideshow_next_at).getTime() : 0; const now = Date.now();
  if (!force && next > now) return null;
  const steps = force ? 1 : Math.max(1, Math.floor((now - next) / intervalMs) + 1);
  const idx = list.indexOf(currentEntry(s));
  const target = entryToTheme(list[((idx < 0 ? -1 : idx) + steps + list.length * 1000) % list.length]);
  return one(
    `UPDATE dashboard_settings SET theme=$2, active_custom_theme=$3, slideshow_next_at=$4, updated_at=now()
     WHERE user_id=$1 AND ($5::boolean OR slideshow_next_at IS NULL OR slideshow_next_at <= now()) RETURNING *`,
    [uid, target.theme, target.custom, new Date(now + intervalMs), force]);
}
