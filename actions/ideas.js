"use server";
import { one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { crud, safe } from "@/lib/crud";
import { ideaSchema } from "@/lib/validation";
const ideas = crud("ideas", ideaSchema, { kind: "idea" });
export async function createIdea(input) { return safe(() => ideas.create(input)); }
export async function updateIdea(id, input) { return safe(() => ideas.update(id, input)); }
export async function deleteIdea(id) { return safe(() => ideas.remove(id)); }
export async function randomIdea() {
  return safe(async () => { const uid = await requireUserId();
    return one("SELECT * FROM ideas WHERE user_id=$1 AND status IN ('inbox','considering') ORDER BY random() LIMIT 1", [uid]); });
}
