import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { listChecklists } from "@/lib/checklists";
import ChecklistsClient from "@/components/modules/ChecklistsClient";
export const metadata = { title: "Checklists" };
export default async function ChecklistsPage() {
  const user = await requireUser();
  const [lists, projects] = await Promise.all([listChecklists(user.id), query("SELECT id, name FROM projects WHERE user_id=$1 AND status<>'archived' ORDER BY name", [user.id])]);
  return <ChecklistsClient initial={JSON.parse(JSON.stringify(lists))} projects={projects} />;
}
