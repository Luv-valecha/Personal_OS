import "server-only";
import { query, one } from "@/lib/db";
import { fail, logActivity, refresh } from "@/lib/crud";
import { friendNameSchema, splitEntrySchema } from "@/lib/validation";

// Signed contribution of an entry to "what the friend owes me" (negative = I owe them).
export const SIGN_SQL = "CASE e.kind WHEN 'lent' THEN e.amount WHEN 'i_paid_them' THEN e.amount ELSE -e.amount END";
const like = (s) => `%${String(s).replace(/[\\%_]/g, "\\$&")}%`;

// Find a friend by name for this user. Exact (case-insensitive) match wins; otherwise a single partial match; several → ambiguity.
export async function findFriend(uid, name) {
  const n = friendNameSchema.parse(name);
  const exact = await one("SELECT * FROM friends WHERE user_id=$1 AND lower(name)=lower($2)", [uid, n]); if (exact) return { friend: exact };
  const part = await query("SELECT * FROM friends WHERE user_id=$1 AND name ILIKE $2 ORDER BY name LIMIT 6", [uid, like(n)]);
  if (part.length === 1) return { friend: part[0] };
  if (part.length > 1) return { ambiguous: part.map((p) => p.name) };
  return { none: n };
}
export async function addFriend(uid, name) {
  const n = friendNameSchema.parse(name);
  const f = await one("INSERT INTO friends(user_id,name) VALUES($1,$2) ON CONFLICT (user_id, lower(name)) DO UPDATE SET name=friends.name RETURNING *", [uid, n]);
  refresh(); return f;
}
export async function getBalances(uid) {
  return query(`SELECT f.id, f.name, COALESCE(SUM(${SIGN_SQL}),0)::float AS balance, count(e.id)::int AS entries, max(e.entry_date) AS last_date
                FROM friends f LEFT JOIN split_entries e ON e.friend_id=f.id AND e.user_id=$1 WHERE f.user_id=$1 GROUP BY f.id ORDER BY abs(COALESCE(SUM(${SIGN_SQL}),0)) DESC, f.name`, [uid]);
}
export async function addEntry(uid, friendId, input, extra = {}) {
  const own = await one("SELECT id, name FROM friends WHERE id=$1 AND user_id=$2", [friendId, uid]); if (!own) throw fail("Friend not found");
  const d = splitEntrySchema.parse(input);
  const e = await one("INSERT INTO split_entries(user_id,friend_id,kind,amount,reason,entry_date,group_ref) VALUES($1,$2,$3,$4,$5,COALESCE($6::date, CURRENT_DATE),$7) RETURNING *", [uid, friendId, d.kind, d.amount, d.reason || "", d.entry_date || null, extra.group_ref || null]);
  await logActivity(uid, "split", "created", `${own.name}: ${d.kind.replace(/_/g, " ")} ${d.amount}${d.reason ? " — " + d.reason : ""}`);
  refresh(); return { entry: e, friend: own };
}
// Settle up = record the payment that brings the balance with this friend to zero.
export async function settleUp(uid, friendId, note = "Settled up") {
  const f = await one("SELECT id, name FROM friends WHERE id=$1 AND user_id=$2", [friendId, uid]); if (!f) throw fail("Friend not found");
  const b = await one(`SELECT COALESCE(SUM(${SIGN_SQL}),0)::float AS bal FROM split_entries e WHERE e.user_id=$1 AND e.friend_id=$2`, [uid, friendId]);
  const bal = Math.round(b.bal * 100) / 100; if (bal === 0) throw fail(`You and ${f.name} are already settled.`);
  const kind = bal > 0 ? "they_paid_me" : "i_paid_them"; await addEntry(uid, friendId, { kind, amount: Math.abs(bal), reason: note }); return { friend: f, balance: bal };
}
