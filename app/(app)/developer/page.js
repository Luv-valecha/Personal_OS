import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import DevClient from "@/components/modules/DevClient";
export const metadata = { title: "Developer" };
export default async function DevPage() {
  const user = await requireUser();
  const items = await query("SELECT * FROM dev_projects WHERE user_id=$1 ORDER BY created_at LIMIT 200", [user.id]);
  return <DevClient items={items} />;
}
