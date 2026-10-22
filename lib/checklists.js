import "server-only";
import { z } from "zod";
import { query, one } from "@/lib/db";
import { fail, logActivity, refresh } from "@/lib/crud";

// Every statement is scoped by the SESSION user's id; the DB's composite foreign keys enforce ownership a second time.
const title = z.string().trim().min(1, "Title is required").max(200);
const itemText = z.string().trim().min(1, "Item can't be empty").max(300);
const uuid = z.string().uuid();
const MAX_LISTS = 100, MAX_ITEMS = 200;

export const listChecklists = (uid) => query(`
  SELECT c.id, c.title, c.project_id, p.name AS project_name, c.updated_at,
    COALESCE(json_agg(json_build_object('id', i.id, 'text', i.text, 'done', i.done) ORDER BY i.position, i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
  FROM checklists c LEFT JOIN projects p ON p.id = c.project_id AND p.user_id = c.user_id
  LEFT JOIN checklist_items i ON i.checklist_id = c.id AND i.user_id = c.user_id
  WHERE c.user_id = $1 GROUP BY c.id, p.name ORDER BY c.updated_at DESC LIMIT ${MAX_LISTS}`, [uid]);

export async function createChecklist(uid, input) {
  const t = title.parse(input?.title); const pid = input?.project_id ? uuid.parse(input.project_id) : null;
  if (pid && !(await one("SELECT 1 AS ok FROM projects WHERE id=$1 AND user_id=$2", [pid, uid]))) throw fail("Project not found");
  if ((await one("SELECT count(*)::int AS n FROM checklists WHERE user_id=$1", [uid])).n >= MAX_LISTS) throw fail(`Limit of ${MAX_LISTS} checklists reached`);
  const row = await one("INSERT INTO checklists(user_id, title, project_id) VALUES ($1,$2,$3) RETURNING id, title", [uid, t, pid]);
  await logActivity(uid, "checklist", "created", t); refresh(); return row;
}
export async function renameChecklist(uid, id, input) {
  const row = await one("UPDATE checklists SET title=$3, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id, title", [uuid.parse(id), uid, title.parse(input)]);
  if (!row) throw fail("Checklist not found"); refresh(); return row;
}
export async function deleteChecklist(uid, id) {
  const row = await one("DELETE FROM checklists WHERE id=$1 AND user_id=$2 RETURNING title", [uuid.parse(id), uid]);   // items go via FK cascade
  if (row) await logActivity(uid, "checklist", "deleted", row.title); refresh(); return true;
}
export async function addItem(uid, checklistId, text) {
  const t = itemText.parse(text); const cid = uuid.parse(checklistId);
  if ((await one("SELECT count(*)::int AS n FROM checklist_items WHERE checklist_id=$1 AND user_id=$2", [cid, uid])).n >= MAX_ITEMS) throw fail(`A checklist can hold ${MAX_ITEMS} items`);
  const row = await one(`INSERT INTO checklist_items(checklist_id, user_id, text, position)
    SELECT c.id, c.user_id, $3, COALESCE((SELECT max(position) + 1 FROM checklist_items WHERE checklist_id = c.id), 0) FROM checklists c WHERE c.id=$1 AND c.user_id=$2
    RETURNING id, text, done`, [cid, uid, t]);
  if (!row) throw fail("Checklist not found");
  await query("UPDATE checklists SET updated_at=now() WHERE id=$1 AND user_id=$2", [cid, uid]); refresh(); return row;
}
// Partial update: only the fields sent are changed. done → completed_at is kept in sync.
export async function updateItem(uid, id, patch) {
  const text = patch?.text !== undefined ? itemText.parse(patch.text) : null; const done = patch?.done !== undefined ? z.boolean().parse(patch.done) : null;
  const row = await one(`UPDATE checklist_items SET text=COALESCE($3, text), done=COALESCE($4, done),
      completed_at = CASE WHEN $4 IS TRUE THEN now() WHEN $4 IS FALSE THEN NULL ELSE completed_at END
    WHERE id=$1 AND user_id=$2 RETURNING id, text, done, checklist_id`, [uuid.parse(id), uid, text, done]);
  if (!row) throw fail("Item not found");
  await query("UPDATE checklists SET updated_at=now() WHERE id=$1 AND user_id=$2", [row.checklist_id, uid]); refresh(); return row;
}
export async function deleteItem(uid, id) {
  const row = await one("DELETE FROM checklist_items WHERE id=$1 AND user_id=$2 RETURNING checklist_id", [uuid.parse(id), uid]);
  if (row) await query("UPDATE checklists SET updated_at=now() WHERE id=$1 AND user_id=$2", [row.checklist_id, uid]); refresh(); return true;
}
// Move one step up/down. Re-numbers the whole list in ONE statement, so the order can never be left half-updated.
export async function moveItem(uid, id, dir) {
  const it = await one("SELECT checklist_id FROM checklist_items WHERE id=$1 AND user_id=$2", [uuid.parse(id), uid]); if (!it) throw fail("Item not found");
  const ids = (await query("SELECT id FROM checklist_items WHERE checklist_id=$1 AND user_id=$2 ORDER BY position, created_at", [it.checklist_id, uid])).map((r) => r.id);
  const i = ids.indexOf(id), j = dir === "up" ? i - 1 : i + 1; if (j < 0 || j >= ids.length) return true;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await query("UPDATE checklist_items SET position=v.pos FROM unnest($1::uuid[], $2::int[]) AS v(id, pos) WHERE checklist_items.id=v.id AND checklist_items.user_id=$3", [ids, ids.map((_, k) => k), uid]);
  refresh(); return true;
}
