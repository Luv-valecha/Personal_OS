import "server-only";
import { bumpCurrentUser } from "@/lib/cache/index";
import { revalidatePath } from "next/cache";
import { query, one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { zodMessage } from "@/lib/validation";
import { ZodError } from "zod";

// Wraps an action so the client gets {ok, data} / {ok:false, error} and never an unhandled crash.
// Wraps every server action. After a successful write the user's cached JARVIS answers are invalidated (awaited, so the very next
// read sees fresh data). An unexpected failure may have written part-way, so it invalidates too; validation/auth errors never wrote anything.
// Pass { read: true } for actions that only read.
export async function safe(fn, { read = false } = {}) {
  try { const data = await fn(); if (!read) await bumpCurrentUser(); return { ok: true, data }; }
  catch (e) {
    if (e instanceof ZodError) return { ok: false, error: zodMessage(e) };
    if (e?.message === "UNAUTHENTICATED") return { ok: false, error: "Your session expired. Please sign in again.", code: "AUTH" };
    if (e?.expected) return { ok: false, error: e.message };
    console.error("[action]", e);
    if (!read) await bumpCurrentUser();
    return { ok: false, error: "Something went wrong on the server. Please try again." };
  }
}
export function fail(msg) { const e = new Error(msg); e.expected = true; return e; }

export async function logActivity(uid, kind, action, label) {
  try { await query("INSERT INTO activities(user_id,kind,action,label) VALUES($1,$2,$3,$4)", [uid, kind, action, String(label || "").slice(0, 200)]); } catch {}
}
export const refresh = () => revalidatePath("/", "layout");

// A foreign key (project_id, task_id) must point at a row owned by the same user.
async function assertOwned(table, id, uid) {
  if (!id) return;
  const r = await one(`SELECT 1 AS ok FROM ${table} WHERE id=$1 AND user_id=$2`, [id, uid]);
  if (!r) throw fail("Referenced item not found");
}

/**
 * Generic user-scoped CRUD. Column names come ONLY from the zod schema shape (trusted code),
 * values are always bound parameters, and every statement includes `user_id = $n`.
 */
export function crud(table, schema, { kind, labelKey = "title", refs = {}, json = [], touch = false } = {}) {
  const cols = (d) => Object.keys(d).filter((k) => d[k] !== undefined);
  const val = (k, v) => (json.includes(k) ? JSON.stringify(v) : v);
  return {
    async create(input, extra = {}) {
      const uid = await requireUserId(); const d = { ...schema.parse(input), ...extra }; const c = cols(d);
      for (const [k, t] of Object.entries(refs)) if (d[k]) await assertOwned(t, d[k], uid);
      const sql = `INSERT INTO ${table} (user_id, ${c.join(",")}) VALUES ($1, ${c.map((_, i) => `$${i + 2}`).join(",")}) RETURNING *`;
      const row = await one(sql, [uid, ...c.map((k) => val(k, d[k]))]);
      await logActivity(uid, kind, "created", row[labelKey] || row.name || row.title);
      refresh(); return row;
    },
    async update(id, input, extra = {}) {
      const uid = await requireUserId(); const d = { ...schema.partial().parse(input), ...extra }; const c = cols(d);
      if (!c.length) return null;
      for (const [k, t] of Object.entries(refs)) if (d[k]) await assertOwned(t, d[k], uid);
      const sets = c.map((k, i) => `${k}=$${i + 3}`).join(", ") + (touch ? ", updated_at=now()" : "");
      const row = await one(`UPDATE ${table} SET ${sets} WHERE id=$1 AND user_id=$2 RETURNING *`, [id, uid, ...c.map((k) => val(k, d[k]))]);
      if (!row) throw fail("Item not found");
      refresh(); return row;
    },
    async remove(id) {
      const uid = await requireUserId();
      const row = await one(`DELETE FROM ${table} WHERE id=$1 AND user_id=$2 RETURNING *`, [id, uid]);
      if (row) await logActivity(uid, kind, "deleted", row[labelKey] || row.name || row.title);
      refresh(); return true;
    },
  };
}
