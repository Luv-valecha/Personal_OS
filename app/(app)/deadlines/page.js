import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getToday } from "@/lib/server-utils";
import DeadlinesClient from "@/components/modules/DeadlinesClient";
export const metadata = { title: "Deadlines" };
export default async function DeadlinesPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requireUser(); const today = await getToday();
  const [deadlines, projects] = await Promise.all([
    query(`SELECT d.*, p.name AS project_name FROM deadlines d LEFT JOIN projects p ON p.id=d.project_id WHERE d.user_id=$1 ORDER BY d.completed, d.due_date LIMIT 300`, [user.id]),
    query("SELECT id, name FROM projects WHERE user_id=$1 AND status<>'archived' ORDER BY name", [user.id]),
  ]);
  return <DeadlinesClient deadlines={deadlines} projects={projects} today={today} filter={["overdue", "today"].includes(sp?.filter) ? sp.filter : ""} />;
}
