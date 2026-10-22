"use server";
import { query, one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { safe } from "@/lib/crud";
import { ideasSvc as ideas, createTaskFromIdea } from "@/lib/services";
import { extractAtProject } from "@/lib/projectref";
import { resolveProjectRef } from "@/lib/projects-resolve";
import { fail } from "@/lib/crud";

export async function createIdea(input) { return safe(() => ideas.create(input)); }
// "Adaptive memory updates @MemTransUNet" → idea in that project. Unknown/ambiguous project → error (never silently unassigned).
export async function quickAddIdea(text) {
  return safe(async () => { const uid = await requireUserId();
    const at = extractAtProject(String(text || "").slice(0, 400)); if (!at.text) throw fail("Type an idea first");
    let project_id = null, title = at.text;
    if (at.ref) { const r = await resolveProjectRef(uid, at.ref); if (!r.project) throw fail(r.message); project_id = r.project.id; if (r.rest) title = `${title} ${r.rest}`.trim(); }
    return ideas.create({ title: title.charAt(0).toUpperCase() + title.slice(1), project_id }); });
}
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
