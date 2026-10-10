import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getToday, getSettings } from "@/lib/server-utils";
import TasksClient from "@/components/modules/TasksClient";
export const metadata = { title: "Tasks" };
export default async function TasksPage({ searchParams }) {
  const user = await requireUser(); const today = await getToday(); const sp = await searchParams; const settings = await getSettings(user.id);
  const [tasks, projects] = await Promise.all([
    query(`SELECT t.*, p.name AS project_name, si.title AS source_idea_title,
        COALESCE(json_agg(json_build_object('id', s.id, 'title', s.title, 'completed', s.completed) ORDER BY s.created_at) FILTER (WHERE s.id IS NOT NULL), '[]') AS subtasks
      FROM tasks t LEFT JOIN projects p ON p.id=t.project_id LEFT JOIN ideas si ON si.id=t.source_idea_id AND si.user_id=$1 LEFT JOIN subtasks s ON s.task_id=t.id
      WHERE t.user_id=$1 AND (t.completed=false OR t.completed_at > now() - interval '90 days')
      GROUP BY t.id, p.name, si.title ORDER BY t.completed, t.due_date NULLS LAST, t.created_at DESC LIMIT 600`, [user.id]),
    query("SELECT id, name FROM projects WHERE user_id=$1 AND status NOT IN ('archived') ORDER BY name", [user.id]),
  ]);
  return <TasksClient tasks={tasks} projects={projects} today={today} initialQuery={sp?.q || ""} openId={sp?.open || ""} initialView={sp?.view || ""} taskSort={settings.task_sort} />;
}
