"use server";
import { cookies } from "next/headers";
import { query, one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { safe, fail, refresh } from "@/lib/crud";
import { advanceIfDue, cleanEntries, currentEntry, MIN_INTERVAL, MAX_INTERVAL } from "@/lib/slideshow";
import { z } from "zod";

const COOKIE = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" };
async function payload(uid) {
  const s = await one("SELECT * FROM dashboard_settings WHERE user_id=$1", [uid]);
  const custom = s.theme === "custom" && s.active_custom_theme ? await one("SELECT id, name, tokens FROM themes WHERE id=$1 AND user_id=$2", [s.active_custom_theme, uid]) : null;
  (await cookies()).set("theme", s.theme, COOKIE);
  return { theme: s.theme, custom, entry: currentEntry(s), nextAt: s.slideshow_next_at, enabled: s.slideshow_enabled, paused: s.slideshow_paused };
}

const cfg = z.object({ enabled: z.boolean(), themes: z.array(z.string().max(60)).max(60), interval_min: z.number().int().min(MIN_INTERVAL).max(MAX_INTERVAL) });
// Save configuration. Enabling requires at least two themes. The currently active theme stays active until the first switch.
export async function saveSlideshow(input) {
  return safe(async () => {
    const uid = await requireUserId(); const d = cfg.parse(input); const list = await cleanEntries(uid, d.themes);
    if (d.enabled && list.length < 2) throw fail("Select at least 2 themes for the slideshow");
    await query(`UPDATE dashboard_settings SET slideshow_enabled=$2::boolean, slideshow_paused=false, slideshow_themes=$3, slideshow_interval_min=$4::int,
      slideshow_next_at=CASE WHEN $2::boolean THEN now() + make_interval(mins => $4::int) ELSE NULL END, updated_at=now() WHERE user_id=$1`, [uid, d.enabled, JSON.stringify(list), d.interval_min]);
    refresh(); return payload(uid);
  });
}
// action: next | pause | resume | stop | tick   (tick = advance only if the timer is due; used by the client timer)
export async function slideshowControl(action) {
  return safe(async () => {
    const uid = await requireUserId();
    if (action === "tick") { await advanceIfDue(uid); }
    else if (action === "next") { const r = await advanceIfDue(uid, true); if (!r) throw fail("Slideshow needs at least 2 selected themes"); }
    else if (action === "pause") await query("UPDATE dashboard_settings SET slideshow_paused=true, updated_at=now() WHERE user_id=$1 AND slideshow_enabled", [uid]);
    else if (action === "resume") await query("UPDATE dashboard_settings SET slideshow_paused=false, slideshow_next_at=now() + make_interval(mins => slideshow_interval_min), updated_at=now() WHERE user_id=$1 AND slideshow_enabled", [uid]);
    else if (action === "stop") await query("UPDATE dashboard_settings SET slideshow_enabled=false, slideshow_paused=false, slideshow_next_at=NULL, updated_at=now() WHERE user_id=$1", [uid]);
    else throw fail("Unknown slideshow action");
    refresh(); return payload(uid);
  });
}
// Start using the saved configuration (used by the "Start theme slideshow" command).
export async function startSlideshow() {
  return safe(async () => {
    const uid = await requireUserId(); const s = await one("SELECT slideshow_themes, slideshow_interval_min FROM dashboard_settings WHERE user_id=$1", [uid]);
    const list = await cleanEntries(uid, s.slideshow_themes);
    if (list.length < 2) throw fail("Choose at least 2 themes in Settings → Appearance → Theme slideshow first");
    await query("UPDATE dashboard_settings SET slideshow_enabled=true, slideshow_paused=false, slideshow_next_at=now() + make_interval(mins => slideshow_interval_min), updated_at=now() WHERE user_id=$1", [uid]);
    refresh(); return payload(uid);
  });
}
