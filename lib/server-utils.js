import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_TZ, todayStr } from "@/lib/dates";
import { one } from "@/lib/db";
import { normalizeLayout } from "@/lib/layout";
import { isThemeId } from "@/lib/themes";

export async function getTz() {
  const jar = await cookies(); const tz = jar.get("tz")?.value;
  try { if (tz) { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } } catch {}
  return DEFAULT_TZ;
}
export async function getToday() { return todayStr(await getTz()); }

// Per-request cached settings (creates the row on first use).
export const getSettings = cache(async (uid) => {
  let s = await one("SELECT * FROM dashboard_settings WHERE user_id=$1", [uid]);
  if (!s) s = await one("INSERT INTO dashboard_settings(user_id, layout) VALUES($1,$2) ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING *", [uid, JSON.stringify(normalizeLayout([]))]);
  s.layout = normalizeLayout(s.layout);
  if (!isThemeId(s.theme)) s.theme = "dark";
  return s;
});
export const getCustomTheme = cache(async (uid, id) => (id ? one("SELECT id, name, tokens FROM themes WHERE id=$1 AND user_id=$2", [id, uid]) : null));
