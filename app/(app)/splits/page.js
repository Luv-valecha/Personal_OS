import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getBalances } from "@/lib/splits";
import { getSettings } from "@/lib/server-utils";
import SplitsClient from "@/components/modules/SplitsClient";
export const metadata = { title: "Splits" };
export default async function SplitsPage({ searchParams }) {
  const user = await requireUser(); const sp = await searchParams; const settings = await getSettings(user.id);
  const [friends, entries] = await Promise.all([
    getBalances(user.id),
    query(`SELECT e.id, e.friend_id, e.kind, e.amount::float AS amount, e.reason, e.entry_date::text AS entry_date, e.group_ref FROM split_entries e WHERE e.user_id=$1 ORDER BY e.entry_date DESC, e.created_at DESC LIMIT 600`, [user.id]),
  ]);
  return <SplitsClient friends={friends} entries={entries} currency={settings.currency} initialFriend={sp?.friend || ""} />;
}
