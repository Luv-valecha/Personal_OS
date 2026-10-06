import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getTz, getToday } from "@/lib/server-utils";
import { getFocusTotals } from "@/lib/queries";
import FocusClient from "@/components/modules/FocusClient";
export const metadata = { title: "Focus" };
export default async function FocusPage() {
  const user = await requireUser(); const tz = await getTz(); const today = await getToday();
  const [totals, recent, tasks, daily] = await Promise.all([
    getFocusTotals(user.id, today, tz),
    query("SELECT id, label, kind, seconds, started_at FROM focus_sessions WHERE user_id=$1 ORDER BY started_at DESC LIMIT 12", [user.id]),
    query("SELECT id, title FROM tasks WHERE user_id=$1 AND completed=false ORDER BY due_date NULLS LAST LIMIT 20", [user.id]),
    query(`SELECT (started_at AT TIME ZONE $2)::date::text AS day, SUM(seconds)::int AS seconds FROM focus_sessions WHERE user_id=$1 AND kind='focus' AND started_at > now() - interval '8 days' GROUP BY 1 ORDER BY 1`, [user.id, tz]),
  ]);
  return <FocusClient totals={totals} recent={recent} tasks={tasks} daily={daily} tz={tz} today={today} />;
}
