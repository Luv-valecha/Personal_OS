import { requireUser } from "@/lib/auth";
import { getSettings, getTz, getToday } from "@/lib/server-utils";
import { getDashboard } from "@/lib/queries";
import DashboardClient from "@/components/dashboard/DashboardClient";

export const metadata = { title: "Dashboard" };
export default async function DashboardPage() {
  const user = await requireUser(); const [tz, today, settings] = [await getTz(), await getToday(), await getSettings(user.id)];
  const visible = new Set(settings.layout.filter((w) => w.visible).map((w) => w.id));
  const data = await getDashboard(user.id, today, tz, visible);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date()));
  const greeting = `${hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, ${user.display_name}`;
  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", month: "long", day: "numeric", timeZone: tz }).format(new Date());
  return <DashboardClient layout={settings.layout} data={data} greeting={greeting} dateLabel={dateLabel}
    ctx={{ today, tz, currency: settings.currency, budget: Number(settings.monthly_budget) || 0, city: settings.weather_city }} />;
}
