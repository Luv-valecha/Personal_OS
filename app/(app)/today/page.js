import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings, getTz, getToday } from "@/lib/server-utils";
import { getDashboard, getNotifications } from "@/lib/queries";
import { addDays } from "@/lib/dates";
import TodayView from "@/components/today/TodayView";

export const metadata = { title: "Today" };
export default async function TodayPage() {
  const user = await requireUser(); const tz = await getTz(); const today = await getToday(); const settings = await getSettings(user.id);
  const [data, notifications, projectWork] = await Promise.all([
    getDashboard(user.id, today, tz, new Set(["overview", "priority", "timeline", "tasks", "deadlines", "focus"])),
    getNotifications(user.id, today, tz),
    // projects that have tasks due today or overdue (reuses the existing project ↔ task relationship)
    query(`SELECT p.id, p.name, COUNT(t.id) FILTER (WHERE t.completed=false AND t.due_date<=$2)::int AS due,
             (SELECT COUNT(*)::int FROM tasks a WHERE a.project_id=p.id AND a.completed) AS done, (SELECT COUNT(*)::int FROM tasks a WHERE a.project_id=p.id) AS total
           FROM projects p JOIN tasks t ON t.project_id=p.id AND t.user_id=$1 WHERE p.user_id=$1 AND p.status NOT IN ('archived','completed')
           GROUP BY p.id HAVING COUNT(t.id) FILTER (WHERE t.completed=false AND t.due_date<=$2) > 0 ORDER BY due DESC LIMIT 5`, [user.id, today]),
  ]);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date()));
  const greeting = `${hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, ${user.display_name}`;
  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", month: "long", day: "numeric", timeZone: tz }).format(new Date());
  return <TodayView data={data} greeting={greeting} dateLabel={dateLabel} notifications={notifications} projectWork={projectWork}
    ctx={{ today, tz, nextWeek: addDays(today, 7), currency: settings.currency, budget: Number(settings.monthly_budget) || 0, city: settings.weather_city, taskSort: settings.task_sort }} />;
}
