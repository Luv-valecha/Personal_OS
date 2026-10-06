"use server";
import { one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { safe, logActivity, refresh } from "@/lib/crud";
import { z } from "zod";
const schema = z.object({ label: z.string().trim().max(200).optional(), kind: z.enum(["focus", "break"]), seconds: z.number().int().min(10).max(14400) });
export async function logFocusSession(input) {
  return safe(async () => {
    const uid = await requireUserId(); const d = schema.parse(input);
    const row = await one("INSERT INTO focus_sessions(user_id,label,kind,seconds,started_at) VALUES($1,$2,$3,$4, now() - ($4 || ' seconds')::interval) RETURNING *", [uid, d.label || "", d.kind, d.seconds]);
    if (d.kind === "focus") await logActivity(uid, "focus", "completed", `${Math.round(d.seconds / 60)} min${d.label ? " — " + d.label : ""}`);
    refresh(); return row;
  });
}
