"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { safe, fail, refresh } from "@/lib/crud";
import { addFriend, addEntry, settleUp, findFriend } from "@/lib/splits";
import { friendNameSchema, splitEntrySchema } from "@/lib/validation";
import { expensesSvc } from "@/lib/services";
import { getToday } from "@/lib/server-utils";

export async function createFriend(name) { return safe(async () => { const uid = await requireUserId(); return addFriend(uid, name); }); }
export async function renameFriend(id, name) {
  return safe(async () => { const uid = await requireUserId(); const n = friendNameSchema.parse(name);
    try { const r = await one("UPDATE friends SET name=$3 WHERE id=$1 AND user_id=$2 RETURNING id", [id, uid, n]); if (!r) throw fail("Friend not found"); } catch (e) { if (e.code === "23505") throw fail("You already have a friend with that name"); throw e; }
    refresh(); return true; });
}
// Deleting a friend deletes their ledger entries (ON DELETE CASCADE) — the UI asks for confirmation.
export async function deleteFriend(id) { return safe(async () => { const uid = await requireUserId(); await query("DELETE FROM friends WHERE id=$1 AND user_id=$2", [id, uid]); refresh(); return true; }); }
export async function createSplitEntry(friendId, input) { return safe(async () => { const uid = await requireUserId(); return (await addEntry(uid, friendId, input)).entry; }); }
export async function updateSplitEntry(id, input) {
  return safe(async () => { const uid = await requireUserId(); const d = splitEntrySchema.partial().parse(input); if (d.amount === undefined && d.reason === undefined && !d.kind && !d.entry_date) return true;
    const r = await one("UPDATE split_entries SET kind=COALESCE($3,kind), amount=COALESCE($4,amount), reason=COALESCE($5,reason), entry_date=COALESCE($6::date,entry_date) WHERE id=$1 AND user_id=$2 RETURNING id", [id, uid, d.kind ?? null, d.amount ?? null, d.reason ?? null, d.entry_date ?? null]);
    if (!r) throw fail("Entry not found"); refresh(); return true; });
}
export async function deleteSplitEntry(id) { return safe(async () => { const uid = await requireUserId(); await query("DELETE FROM split_entries WHERE id=$1 AND user_id=$2", [id, uid]); refresh(); return true; }); }
export async function settleFriend(friendId) { return safe(async () => { const uid = await requireUserId(); return settleUp(uid, friendId); }); }

// Equal split. payer "me": every other participant owes me total/n. payer = a friend: I owe that friend my share.
// Optionally records my own share as a personal expense.
const splitSchema = z.object({
  total: z.preprocess((v) => Number(v), z.number().positive().max(1e8)), reason: z.string().trim().max(300).optional(),
  payer: z.string().max(60), participants: z.array(z.string().max(60)).max(30), addExpense: z.boolean().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export async function createEqualSplit(input) {
  return safe(async () => {
    const uid = await requireUserId(); const d = splitSchema.parse(input); const ids = [...new Set(d.participants)];
    const owned = ids.length ? await query("SELECT id, name FROM friends WHERE user_id=$1 AND id = ANY($2::uuid[])", [uid, ids]) : [];
    if (owned.length !== ids.length) throw fail("Choose friends from your list");
    if (d.payer !== "me" && !owned.some((f) => f.id === d.payer)) throw fail("The payer must be you or one of the selected friends");
    const n = owned.length + 1; if (owned.length < 1) throw fail("Pick at least one friend to split with");
    const share = Math.round((d.total / n) * 100) / 100; const ref = randomUUID();
    if (d.payer === "me") for (const f of owned) await addEntry(uid, f.id, { kind: "lent", amount: share, reason: d.reason || "Split", entry_date: d.date }, { group_ref: ref });
    else await addEntry(uid, d.payer, { kind: "borrowed", amount: share, reason: d.reason || "Split", entry_date: d.date }, { group_ref: ref });
    if (d.addExpense) await expensesSvc.create({ amount: share, category: "other", description: `${d.reason || "Split"} (my share)`, spent_on: d.date || (await getToday()) });
    refresh(); return { share, people: n };
  });
}
