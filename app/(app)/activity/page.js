import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getTz } from "@/lib/server-utils";
import ActivityClient from "@/components/modules/ActivityClient";
export const metadata = { title: "Activity" };
export default async function ActivityPage({ searchParams }) {
  const user = await requireUser(); const tz = await getTz(); const sp = await searchParams;
  const kind = sp?.kind || ""; const page = Math.max(0, Number(sp?.page) || 0);
  const rows = await query(`SELECT id, kind, action, label, created_at FROM activities WHERE user_id=$1 AND ($2='' OR kind=$2) ORDER BY created_at DESC LIMIT 41 OFFSET $3`, [user.id, kind, page * 40]);
  return <ActivityClient rows={rows.slice(0, 40)} hasMore={rows.length > 40} kind={kind} page={page} tz={tz} />;
}
