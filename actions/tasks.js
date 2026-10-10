"use server";
import { query, one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { safe, fail, logActivity, refresh } from "@/lib/crud";
import { tasksSvc } from "@/lib/services";
import { parseQuickTask } from "@/lib/nlp";
import { isSortMode } from "@/lib/tasksort";
import { addDays, todayStr } from "@/lib/dates";
import { getTz } from "@/lib/server-utils";

const tasks = tasksSvc;

export async function createTask(input) { return safe(() => tasks.create(input)); }
export async function updateTask(id, input) { return safe(() => tasks.update(id, input)); }
export async function deleteTask(id) { return safe(() => tasks.remove(id)); }

// "Finish ML report tomorrow !high #uni @HisaabKitaab"
export async function quickAddTask(text) {
  return safe(async () => {
    const uid = await requireUserId();
    const p = parseQuickTask(String(text || "").slice(0, 400), await getTz());
    if (!p.title) throw fail("Type a task first");
    let project_id = null;
    if (p.projectName) {
      const pr = await one("SELECT id FROM projects WHERE user_id=$1 AND name ILIKE $2 ORDER BY created_at LIMIT 1", [uid, `%${p.projectName.replace(/[%_\\]/g, "")}%`]);
      project_id = pr?.id || null;
    }
    return tasks.create({ title: p.title, due_date: p.due_date, priority: p.priority, tags: p.tags, project_id });
  });
}

function nextDue(due, rec, today) {
  const base = due && due >= today ? due : today; // advance from due date, or today if overdue
  if (rec === "daily") return addDays(base, 1);
  if (rec === "weekly") return addDays(base, 7);
  const d = new Date(base + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10);
}

export async function toggleTask(id) {
  return safe(async () => {
    const uid = await requireUserId();
    const t = await one("SELECT * FROM tasks WHERE id=$1 AND user_id=$2", [id, uid]);
    if (!t) throw fail("Task not found");
    const done = !t.completed;
    await query("UPDATE tasks SET completed=$3, completed_at=$4, updated_at=now() WHERE id=$1 AND user_id=$2", [id, uid, done, done ? new Date() : null]);
    if (done) {
      await logActivity(uid, "task", "completed", t.title);
      if (t.recurrence !== "none") {
        const today = todayStr(await getTz());
        await query("INSERT INTO tasks(user_id,project_id,title,notes,priority,due_date,tags,recurrence) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [uid, t.project_id, t.title, t.notes, t.priority, nextDue(t.due_date, t.recurrence, today), t.tags, t.recurrence]);
      }
    }
    refresh(); return { completed: done };
  });
}

export async function addSubtask(taskId, title) {
  return safe(async () => {
    const uid = await requireUserId(); const t = String(title || "").trim().slice(0, 300);
    if (!t) throw fail("Subtask title is required");
    const own = await one("SELECT 1 AS ok FROM tasks WHERE id=$1 AND user_id=$2", [taskId, uid]);
    if (!own) throw fail("Task not found");
    const r = await one("INSERT INTO subtasks(user_id,task_id,title) VALUES($1,$2,$3) RETURNING *", [uid, taskId, t]);
    refresh(); return r;
  });
}
export async function toggleSubtask(id) {
  return safe(async () => { const uid = await requireUserId(); await query("UPDATE subtasks SET completed = NOT completed WHERE id=$1 AND user_id=$2", [id, uid]); refresh(); return true; });
}
export async function deleteSubtask(id) {
  return safe(async () => { const uid = await requireUserId(); await query("DELETE FROM subtasks WHERE id=$1 AND user_id=$2", [id, uid]); refresh(); return true; });
}

// ── Manual ordering ──────────────────────────────────────────────────────────
// Moves ONE task between its new neighbours (prevId above, nextId below). Only that row is written; priority, due date
// and every other field stay untouched. If the neighbours changed under us (stale list) we refuse instead of guessing.
export async function moveTask(activeId, prevId, nextId) {
  return safe(async () => {
    const uid = await requireUserId();
    const ids = [activeId, prevId, nextId].filter(Boolean);
    if (new Set(ids).size !== ids.length) throw fail("Invalid move");
    const fetchPos = async () => Object.fromEntries((await query("SELECT id, manual_position FROM tasks WHERE user_id=$1 AND id = ANY($2::uuid[])", [uid, ids])).map((r) => [r.id, r.manual_position]));
    let m = await fetchPos();
    if (m[activeId] === undefined || (prevId && m[prevId] === undefined) || (nextId && m[nextId] === undefined)) throw fail("The list changed. Refreshing — try again.");
    let rebalanced = false;
    if (prevId && nextId && (m[nextId] - m[prevId] < 0.001)) { // neighbours crossed (stale) or gap exhausted → renumber this user's tasks, then re-read
      await query("UPDATE tasks t SET manual_position = r.rn * 1024.0 FROM (SELECT id, row_number() OVER (ORDER BY manual_position, created_at) AS rn FROM tasks WHERE user_id=$1) r WHERE r.id=t.id AND t.user_id=$1", [uid]);
      m = await fetchPos(); rebalanced = true;
      if (m[nextId] <= m[prevId]) throw fail("The list changed. Refreshing — try again.");
    }
    const p = prevId ? m[prevId] : null, n = nextId ? m[nextId] : null;
    const next = p !== null && n !== null ? (p + n) / 2 : p !== null ? p + 1024 : n !== null ? n - 1024 : m[activeId];
    await query("UPDATE tasks SET manual_position=$3 WHERE id=$1 AND user_id=$2", [activeId, uid, next]);
    refresh(); return { position: next, rebalanced };
  });
}

// Display sort preference (shared by dashboard + Tasks page). Switching never touches manual_position.
export async function setTaskSort(mode) {
  return safe(async () => {
    const uid = await requireUserId(); if (!isSortMode(mode)) throw fail("Unknown sort mode");
    await query("UPDATE dashboard_settings SET task_sort=$2, updated_at=now() WHERE user_id=$1", [uid, mode]);
    refresh(); return mode;
  });
}
