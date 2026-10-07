"use server";
import { one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { safe, logActivity, refresh } from "@/lib/crud";
import { z } from "zod";
const schema = z.object({ task_id: z.string().uuid().nullable().optional(), label: z.string().trim().max(200).optional(), kind: z.enum(["focus", "break"]), seconds: z.number().int().min(10).max(14400) });
export async function logFocusSession(input) {
  return safe(async () => {
    const uid = await requireUserId(); const d = schema.parse(input);
    // task_id is only stored if the task belongs to this user (otherwise silently ignored).
    const task = d.task_id ? await one("SELECT id, title FROM tasks WHERE id=$1 AND user_id=$2", [d.task_id, uid]) : null;
    const row = await one("INSERT INTO focus_sessions(user_id,label,kind,seconds,task_id,started_at) VALUES($1,$2,$3,$4::int,$5, now() - make_interval(secs => $4::int)) RETURNING *", [uid, d.label || task?.title || "", d.kind, d.seconds, task?.id || null]);
    if (d.kind === "focus") await logActivity(uid, "focus", "completed", `${Math.round(d.seconds / 60)} min${(d.label || task?.title) ? " — " + (d.label || task.title) : ""}`);
    refresh(); return row;
  });
}
