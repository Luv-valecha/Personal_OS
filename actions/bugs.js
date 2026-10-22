"use server";
import { requireUserId } from "@/lib/auth";
import { safe, fail } from "@/lib/crud";
import { bugsSvc, setBugStatus } from "@/lib/services";
import { extractAtProject } from "@/lib/projectref";
import { resolveProjectRef } from "@/lib/projects-resolve";
import { BUG_STATUSES } from "@/lib/validation";

export async function createBug(input) { return safe(() => bugsSvc.create(input)); }
export async function updateBug(id, input) {
  return safe(async () => {
    const { status, ...rest } = input || {};
    if (status !== undefined) { if (!BUG_STATUSES.includes(status)) throw fail("Invalid status"); await setBugStatus(id, status); }
    if (Object.keys(rest).length) return bugsSvc.update(id, rest);   // never overwrites fields that weren't sent
    return true;
  });
}
export async function changeBugStatus(id, status) { return safe(async () => { if (!BUG_STATUSES.includes(status)) throw fail("Invalid status"); return setBugStatus(id, status); }); }
export async function deleteBug(id) { return safe(() => bugsSvc.remove(id)); }
// "Mobile navigation overflows @Lucifer OS" — a bug always belongs to a project, so the @project is REQUIRED and must resolve uniquely.
export async function quickAddBug(text) {
  return safe(async () => { const uid = await requireUserId();
    const at = extractAtProject(String(text || "").slice(0, 400)); if (!at.text) throw fail("Describe the bug first");
    if (!at.ref) throw fail("Add the project with @, e.g. “Nav overflows @Lucifer OS”.");
    const r = await resolveProjectRef(uid, at.ref); if (!r.project) throw fail(r.message);
    const title = r.rest ? `${at.text} ${r.rest}`.trim() : at.text;
    return bugsSvc.create({ title: title.charAt(0).toUpperCase() + title.slice(1), project_id: r.project.id }); });
}
