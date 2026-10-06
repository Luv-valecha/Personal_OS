import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import FilesClient from "@/components/modules/FilesClient";
export const metadata = { title: "Files" };
export default async function FilesPage() {
  const user = await requireUser();
  const [files, projects] = await Promise.all([
    query(`SELECT f.id, f.name, f.mime_type, f.size_bytes, f.tags, f.project_id, f.created_at, p.name AS project_name FROM files f LEFT JOIN projects p ON p.id=f.project_id WHERE f.user_id=$1 ORDER BY f.created_at DESC LIMIT 300`, [user.id]),
    query("SELECT id, name FROM projects WHERE user_id=$1 AND status<>'archived' ORDER BY name", [user.id]),
  ]);
  const max = Math.min(Number(process.env.MAX_UPLOAD_MB) || 4, 4);
  return <FilesClient files={files} projects={projects} maxMb={max} />;
}
