import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/server-utils";
import SettingsClient from "@/components/modules/SettingsClient";
export const metadata = { title: "Settings" };
export default async function SettingsPage() {
  const user = await requireUser(); const settings = await getSettings(user.id);
  const customThemes = await query("SELECT id, name, tokens FROM themes WHERE user_id=$1 ORDER BY created_at", [user.id]);
  const { getQuickLinks } = await import("@/lib/queries"); const quickLinks = await getQuickLinks(user.id);
  return <SettingsClient quickLinks={quickLinks} user={{ display_name: user.display_name, email: user.email }} customThemes={customThemes}
    settings={{ theme: settings.theme, motion: settings.motion, weather_city: settings.weather_city, monthly_budget: Number(settings.monthly_budget), currency: settings.currency, active_custom_theme: settings.active_custom_theme }} />;
}
