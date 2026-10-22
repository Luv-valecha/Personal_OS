import "server-only";
import { crud } from "@/lib/crud";
import { taskSchema, bugSchema, ideaSchema, expenseSchema, deadlineSchema, projectSchema, noteSchema, bookmarkSchema, eventSchema, devProjectSchema } from "@/lib/validation";

// Single place where the user-scoped CRUD services are defined. Server Actions (UI) and the JARVIS tools both use
// these, so validation, ownership checks and activity logging are identical no matter who triggers a change.
export const tasksSvc = crud("tasks", taskSchema, { kind: "task", refs: { project_id: "projects" }, touch: true });
export const bugsSvc = crud("bugs", bugSchema, { kind: "bug", refs: { project_id: "projects" }, touch: true });
export const ideasSvc = crud("ideas", ideaSchema, { kind: "idea", refs: { project_id: "projects" } });
export const expensesSvc = crud("expenses", expenseSchema, { kind: "expense", labelKey: "description" });
export const deadlinesSvc = crud("deadlines", deadlineSchema, { kind: "deadline", refs: { project_id: "projects" } });
export const projectsSvc = crud("projects", projectSchema, { kind: "project", labelKey: "name", json: ["links"], touch: true });
export const devProjectsSvc = crud("dev_projects", devProjectSchema, { kind: "developer", labelKey: "name", json: ["todos"] });
export const notesSvc = crud("notes", noteSchema, { kind: "note", refs: { project_id: "projects" }, touch: true });
export const bookmarksSvc = crud("bookmarks", bookmarkSchema.extend({ domain: bookmarkSchema.shape.title }), { kind: "bookmark" });
export const eventsSvc = crud("events", eventSchema, { kind: "event" });

import { one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { fail, logActivity, refresh } from "@/lib/crud";

// Idea → linked task. The idea is untouched (separate lifecycle). Ownership of idea AND project is verified server-side.
export async function createTaskFromIdea(uid, ideaId, input) {
  const idea = await one("SELECT id, title, description, project_id FROM ideas WHERE id=$1 AND user_id=$2", [ideaId, uid]);
  if (!idea) throw fail("Idea not found");
  const d = taskSchema.parse({ ...input, project_id: input?.project_id === undefined ? idea.project_id : input.project_id });
  const task = await tasksSvc.create(d, { source_idea_id: idea.id });
  await logActivity(uid, "idea", "converted", `${idea.title} → ${task.title}`);
  refresh(); return { task, idea };
}

// How many records a project delete will remove (shown in the confirmation dialog). Ownership-checked.
export async function projectDeleteImpact(projectId) {
  const uid = await requireUserId();
  const p = await one("SELECT id, name FROM projects WHERE id=$1 AND user_id=$2", [projectId, uid]);
  if (!p) throw fail("Project not found");
  const c = await one(`SELECT
    (SELECT count(*)::int FROM tasks WHERE project_id=$1 AND user_id=$2) AS tasks,
    (SELECT count(*)::int FROM ideas WHERE project_id=$1 AND user_id=$2) AS ideas,
    (SELECT count(*)::int FROM notes WHERE project_id=$1 AND user_id=$2) AS notes,
    (SELECT count(*)::int FROM deadlines WHERE project_id=$1 AND user_id=$2) AS deadlines,
    (SELECT count(*)::int FROM files WHERE project_id=$1 AND user_id=$2) AS files,
    (SELECT count(*)::int FROM bugs WHERE project_id=$1 AND user_id=$2) AS bugs,
    (SELECT count(*)::int FROM checklists WHERE project_id=$1 AND user_id=$2) AS checklists`, [projectId, uid]);
  return { name: p.name, ...c };
}

// Status changes keep resolved_at consistent (set when resolved/won't-fix, cleared on reopen).
export async function setBugStatus(id, status) {
  const done = status === "resolved" || status === "wont_fix";
  return bugsSvc.update(id, { status }, { resolved_at: done ? new Date().toISOString() : null });
}
