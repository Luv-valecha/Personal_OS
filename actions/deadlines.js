"use server";
import { query, one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { safe, fail, logActivity, refresh } from "@/lib/crud";
import { deadlinesSvc as d } from "@/lib/services";
export async function createDeadline(input) { return safe(() => d.create(input)); }
export async function updateDeadline(id, input) { return safe(() => d.update(id, input)); }
export async function deleteDeadline(id) { return safe(() => d.remove(id)); }
export async function toggleDeadline(id) {
  return safe(async () => {
    const uid = await requireUserId();
    const r = await one("UPDATE deadlines SET completed = NOT completed WHERE id=$1 AND user_id=$2 RETURNING title, completed", [id, uid]);
    if (!r) throw fail("Deadline not found");
    if (r.completed) await logActivity(uid, "deadline", "completed", r.title);
    refresh(); return true;
  });
}
