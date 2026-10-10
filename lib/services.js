import "server-only";
import { crud } from "@/lib/crud";
import { taskSchema, ideaSchema, expenseSchema, deadlineSchema, projectSchema, noteSchema, bookmarkSchema, eventSchema, devProjectSchema } from "@/lib/validation";

// Single place where the user-scoped CRUD services are defined. Server Actions (UI) and the JARVIS tools both use
// these, so validation, ownership checks and activity logging are identical no matter who triggers a change.
export const tasksSvc = crud("tasks", taskSchema, { kind: "task", refs: { project_id: "projects" }, touch: true });
export const ideasSvc = crud("ideas", ideaSchema, { kind: "idea", refs: { project_id: "projects" } });
export const expensesSvc = crud("expenses", expenseSchema, { kind: "expense", labelKey: "description" });
export const deadlinesSvc = crud("deadlines", deadlineSchema, { kind: "deadline", refs: { project_id: "projects" } });
export const projectsSvc = crud("projects", projectSchema, { kind: "project", labelKey: "name", json: ["links"], touch: true });
export const devProjectsSvc = crud("dev_projects", devProjectSchema, { kind: "developer", labelKey: "name", json: ["todos"] });
export const notesSvc = crud("notes", noteSchema, { kind: "note", refs: { project_id: "projects" }, touch: true });
export const bookmarksSvc = crud("bookmarks", bookmarkSchema.extend({ domain: bookmarkSchema.shape.title }), { kind: "bookmark" });
export const eventsSvc = crud("events", eventSchema, { kind: "event" });

import { one } from "@/lib/db";
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
