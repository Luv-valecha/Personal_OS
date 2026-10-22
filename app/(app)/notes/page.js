import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import NotesClient from "@/components/modules/NotesClient";
export const metadata = { title: "Notes" };
export default async function NotesPage({ searchParams }) {
  const user = await requireUser(); const sp = await searchParams;
  const notes = await query(`SELECT id, title, body, tags, pinned, archived, project_id, updated_at FROM notes WHERE user_id=$1 ORDER BY pinned DESC, updated_at DESC LIMIT 400`, [user.id]);
  return <NotesClient notes={notes} initialQuery={sp?.q || ""} openId={sp?.open || ""} />;
}
