import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import IdeasClient from "@/components/modules/IdeasClient";
export const metadata = { title: "Ideas" };
export default async function IdeasPage({ searchParams }) {
  const user = await requireUser(); const sp = await searchParams;
  const ideas = await query("SELECT * FROM ideas WHERE user_id=$1 ORDER BY created_at DESC LIMIT 500", [user.id]);
  return <IdeasClient ideas={ideas} initialQuery={sp?.q || ""} />;
}
