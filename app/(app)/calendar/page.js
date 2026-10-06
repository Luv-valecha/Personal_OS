import { requireUser } from "@/lib/auth";
import { getEventsRange } from "@/lib/queries";
import { getTz, getToday } from "@/lib/server-utils";
import { addDays, startOfMonth, zonedToIso } from "@/lib/dates";
import CalendarClient from "@/components/modules/CalendarClient";
export const metadata = { title: "Calendar" };
export default async function CalendarPage() {
  const user = await requireUser(); const tz = await getTz(); const today = await getToday();
  // Load a window around today (±~2 months); the client navigates within it. Recurring events are expanded server-side.
  const from = addDays(startOfMonth(today), -40), to = addDays(startOfMonth(today), 100);
  const events = await getEventsRange(user.id, zonedToIso(from + "T00:00", tz), zonedToIso(to + "T00:00", tz), tz);
  const raw = events.map((e) => ({ ...e, starts_at: new Date(e.starts_at).toISOString(), ends_at: new Date(e.ends_at).toISOString(), created_at: undefined }));
  return <CalendarClient events={raw} today={today} tz={tz} />;
}
