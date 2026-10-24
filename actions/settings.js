"use server";
import { cookies } from "next/headers";
import { query, one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { safe, fail, refresh } from "@/lib/crud";
import { customThemeSchema } from "@/lib/validation";
import { isThemeId, MOTION, GLASS } from "@/lib/themes";
import { applyTheme } from "@/lib/theme-service";
import { normalizeLayout } from "@/lib/layout";
import { z } from "zod";

const COOKIE_OPTS = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" };

export async function setTheme(theme) {
  return safe(async () => applyTheme(await requireUserId(), theme));
}
export async function setMotion(motion) {
  return safe(async () => {
    const uid = await requireUserId(); if (!MOTION.includes(motion)) throw fail("Invalid animation setting");
    await query("UPDATE dashboard_settings SET motion=$2, updated_at=now() WHERE user_id=$1", [uid, motion]);
    (await cookies()).set("motion", motion, COOKIE_OPTS); refresh(); return true;
  });
}
export async function setGlass(glass) {
  return safe(async () => {
    const uid = await requireUserId(); if (!GLASS.includes(glass)) throw fail("Invalid glass setting");
    await query("UPDATE dashboard_settings SET glass=$2, updated_at=now() WHERE user_id=$1", [uid, glass]);
    (await cookies()).set("glass", glass, COOKIE_OPTS); refresh(); return true;
  });
}
const prefs = z.object({
  weather_city: z.string().trim().max(80).optional(),
  monthly_budget: z.preprocess((v) => Number(v), z.number().min(0).max(1e9)).optional(),
  currency: z.string().trim().min(1).max(3).optional(),
});
export async function updatePreferences(input) {
  return safe(async () => {
    const uid = await requireUserId(); const d = prefs.parse(input);
    await query("UPDATE dashboard_settings SET weather_city=COALESCE($2,weather_city), monthly_budget=COALESCE($3,monthly_budget), currency=COALESCE($4,currency), updated_at=now() WHERE user_id=$1",
      [uid, d.weather_city ?? null, d.monthly_budget ?? null, d.currency ?? null]);
    refresh(); return true;
  });
}
export async function saveLayout(layout) {
  return safe(async () => {
    const uid = await requireUserId(); const clean = normalizeLayout(layout);
    await query("UPDATE dashboard_settings SET layout=$2, updated_at=now() WHERE user_id=$1", [uid, JSON.stringify(clean)]);
    refresh(); return clean;
  });
}
export async function updateDisplayName(name) {
  return safe(async () => {
    const uid = await requireUserId(); const n = z.string().trim().min(1, "Name is required").max(60).parse(name);
    await query("UPDATE users SET display_name=$2 WHERE id=$1", [uid, n]); refresh(); return n;
  });
}
export async function saveCustomTheme(input) {
  return safe(async () => {
    const uid = await requireUserId(); const d = customThemeSchema.parse(input);
    const count = await one("SELECT count(*)::int AS n FROM themes WHERE user_id=$1", [uid]);
    if (count.n >= 20) throw fail("You can save up to 20 custom themes");
    const row = await one("INSERT INTO themes(user_id,name,tokens) VALUES($1,$2,$3) RETURNING id", [uid, d.name, JSON.stringify(d.tokens)]);
    await query("UPDATE dashboard_settings SET theme='custom', active_custom_theme=$2, updated_at=now() WHERE user_id=$1", [uid, row.id]);
    (await cookies()).set("theme", "custom", COOKIE_OPTS); refresh(); return row;
  });
}
export async function applyCustomTheme(id) {
  return safe(async () => {
    const uid = await requireUserId();
    const t = await one("SELECT id FROM themes WHERE id=$1 AND user_id=$2", [id, uid]); if (!t) throw fail("Theme not found");
    await query("UPDATE dashboard_settings SET theme='custom', active_custom_theme=$2, updated_at=now() WHERE user_id=$1", [uid, id]);
    (await cookies()).set("theme", "custom", COOKIE_OPTS); refresh(); return true;
  });
}
export async function deleteCustomTheme(id) {
  return safe(async () => {
    const uid = await requireUserId();
    await query("DELETE FROM themes WHERE id=$1 AND user_id=$2", [id, uid]);
    await query("UPDATE dashboard_settings SET theme=CASE WHEN active_custom_theme=$2 THEN 'dark' ELSE theme END, active_custom_theme=CASE WHEN active_custom_theme=$2 THEN NULL ELSE active_custom_theme END WHERE user_id=$1", [uid, id]);
    refresh(); return true;
  });
}
export async function deleteFile(id) {
  return safe(async () => { const uid = await requireUserId(); await query("DELETE FROM files WHERE id=$1 AND user_id=$2", [id, uid]); refresh(); return true; });
}
export async function updateFileMeta(id, input) {
  return safe(async () => {
    const uid = await requireUserId();
    const d = z.object({ name: z.string().trim().min(1).max(200).optional(), tags: z.array(z.string().trim().toLowerCase().max(30)).max(20).optional(), project_id: z.string().uuid().nullable().optional() }).parse(input);
    if (d.project_id) { const p = await one("SELECT 1 AS ok FROM projects WHERE id=$1 AND user_id=$2", [d.project_id, uid]); if (!p) throw fail("Project not found"); }
    await query("UPDATE files SET name=COALESCE($3,name), tags=COALESCE($4,tags), project_id=CASE WHEN $5::boolean THEN $6::uuid ELSE project_id END WHERE id=$1 AND user_id=$2",
      [id, uid, d.name ?? null, d.tags ?? null, d.project_id !== undefined, d.project_id ?? null]);
    refresh(); return true;
  });
}
