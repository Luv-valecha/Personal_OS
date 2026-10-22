import "server-only";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { fail, refresh } from "@/lib/crud";
import { isThemeId } from "@/lib/themes";

export const THEME_COOKIE_OPTS = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" };
// The ONE place a theme choice is persisted (used by the Settings picker and by JARVIS). Validates against the registry.
export async function applyTheme(uid, theme) {
  if (!isThemeId(theme)) throw fail("Unknown theme");
  // A manual choice keeps the slideshow running but restarts its countdown from this theme.
  await query("UPDATE dashboard_settings SET theme=$2, active_custom_theme=CASE WHEN $2='custom' THEN active_custom_theme ELSE NULL END, slideshow_next_at=CASE WHEN slideshow_enabled AND NOT slideshow_paused THEN now() + make_interval(mins => slideshow_interval_min) ELSE slideshow_next_at END, updated_at=now() WHERE user_id=$1", [uid, theme]);
  (await cookies()).set("theme", theme, THEME_COOKIE_OPTS); refresh(); return true;
}
