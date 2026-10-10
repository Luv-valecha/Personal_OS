"use server";
import { query, one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { safe } from "@/lib/crud";
import { ideasSvc as ideas, createTaskFromIdea } from "@/lib/services";

export async function createIdea(input) { return safe(() => ideas.create(input)); }
export async function updateIdea(id, input) { return safe(() => ideas.update(id, input)); }
// Deleting an idea never deletes tasks created from it (tasks.source_idea_id → ON DELETE SET NULL).
export async function deleteIdea(id) { return safe(() => ideas.remove(id)); }
export async function randomIdea() {
  return safe(async () => { const uid = await requireUserId();
    return one("SELECT * FROM ideas WHERE user_id=$1 AND status IN ('inbox','considering') ORDER BY random() LIMIT 1", [uid]); });
}

// Idea → linked task (shared core in lib/services.js). The idea stays untouched; only user-supplied fields are used.
export async function createLinkedTask(ideaId, input) {
  return safe(async () => { const uid = await requireUserId(); return (await createTaskFromIdea(uid, ideaId, input)).task; });
}
