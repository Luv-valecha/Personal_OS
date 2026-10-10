import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import IdeasClient from "@/components/modules/IdeasClient";
export const metadata = { title: "Ideas" };
export default async function IdeasPage({ searchParams }) {
  const user = await requireUser(); const sp = await searchParams;
  const [ideas, projects] = await Promise.all([
    query(`SELECT i.*, p.name AS project_name,
        COALESCE((SELECT json_agg(json_build_object('id', t.id, 'title', t.title, 'completed', t.completed) ORDER BY t.created_at) FROM tasks t WHERE t.source_idea_id=i.id AND t.user_id=$1), '[]') AS tasks
      FROM ideas i LEFT JOIN projects p ON p.id=i.project_id AND p.user_id=$1 WHERE i.user_id=$1 ORDER BY i.created_at DESC LIMIT 500`, [user.id]),
    query("SELECT id, name FROM projects WHERE user_id=$1 AND status<>'archived' ORDER BY name", [user.id]),
  ]);
  return <IdeasClient ideas={ideas} projects={projects} initialQuery={sp?.q || ""} openId={sp?.open || ""} initialProject={sp?.project || ""} />;
}
