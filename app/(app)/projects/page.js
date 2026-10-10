import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getToday } from "@/lib/server-utils";
import ProjectsClient from "@/components/modules/ProjectsClient";
export const metadata = { title: "Projects" };
export default async function ProjectsPage({ searchParams }) {
  const user = await requireUser(); const today = await getToday(); const sp = await searchParams;
  const projects = await query(`
    SELECT p.*,
      (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id=p.id) AS total,
      (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id=p.id AND t.completed) AS done,
      COALESCE((SELECT json_agg(json_build_object('id',t.id,'title',t.title,'completed',t.completed) ORDER BY t.completed, t.created_at) FROM (SELECT * FROM tasks WHERE project_id=p.id AND user_id=$1 ORDER BY completed, created_at DESC LIMIT 30) t),'[]') AS tasks,
      COALESCE((SELECT json_agg(x) FROM (SELECT i.id, i.title, i.description, i.status, i.priority, i.tags, i.project_id, (SELECT COALESCE(json_agg(json_build_object('id',t.id,'title',t.title,'completed',t.completed) ORDER BY t.created_at), '[]'::json) FROM tasks t WHERE t.source_idea_id=i.id AND t.user_id=$1) AS tasks FROM ideas i WHERE i.project_id=p.id AND i.user_id=$1 ORDER BY i.created_at DESC LIMIT 30) x),'[]') AS ideas,
      COALESCE((SELECT json_agg(json_build_object('id',n.id,'title',n.title)) FROM (SELECT id,title FROM notes WHERE project_id=p.id AND user_id=$1 ORDER BY updated_at DESC LIMIT 10) n),'[]') AS notes,
      COALESCE((SELECT json_agg(json_build_object('id',f.id,'name',f.name)) FROM (SELECT id,name FROM files WHERE project_id=p.id AND user_id=$1 ORDER BY created_at DESC LIMIT 10) f),'[]') AS files
    FROM projects p WHERE p.user_id=$1 ORDER BY (p.status='archived'), p.updated_at DESC LIMIT 200`, [user.id]);
  return <ProjectsClient projects={projects} today={today} initialQuery={sp?.q || ""} />;
}
