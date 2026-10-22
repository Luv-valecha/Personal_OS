import "server-only";
import { query } from "@/lib/db";
import { matchProjectRef } from "@/lib/projectref";

// Resolve a typed/spoken/model-supplied project reference against THE SESSION USER's projects only.
// → { project:{id,name}, rest } | { ambiguous:[names], message } | { notFound:true, message }.
export async function resolveProjectRef(uid, raw) {
  const projects = await query("SELECT id, name FROM projects WHERE user_id=$1 AND status<>'archived'", [uid]);
  const r = matchProjectRef(raw, projects);
  if (r.ambiguous) return { ...r, message: `Several projects match “${raw}”: ${r.ambiguous.map((n) => `“${n}”`).join(", ")}. Which one?` };
  if (r.notFound) return { ...r, message: `No project matches “${raw}”.` };
  return r;
}
