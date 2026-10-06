import "server-only";
import { query, one } from "@/lib/db";
import { addDays, startOfWeek, startOfMonth } from "@/lib/dates";
import { expandEvents } from "@/lib/events";

// Every function takes the authenticated user's id and filters by it.
export async function getEventsRange(uid, fromIso, toIso, tz) {
  const rows = await query(
    `SELECT * FROM events WHERE user_id=$1 AND ((recurrence='none' AND ends_at >= $2 AND starts_at <= $3) OR (recurrence<>'none' AND starts_at <= $3)) ORDER BY starts_at LIMIT 500`,
    [uid, fromIso, toIso]);
  return expandEvents(rows, fromIso, toIso, tz);
}

export async function getMoney(uid, today) {
  const r = await one(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE spent_on=$2),0) AS today,
            COALESCE(SUM(amount) FILTER (WHERE spent_on>=$3 AND spent_on<=$2),0) AS week,
            COALESCE(SUM(amount) FILTER (WHERE spent_on>=$4 AND spent_on<=$2),0) AS month
     FROM expenses WHERE user_id=$1 AND spent_on>=LEAST($3::date,$4::date)`, [uid, today, startOfWeek(today), startOfMonth(today)]);
  return { today: Number(r.today), week: Number(r.week), month: Number(r.month) };
}
export async function getFocusTotals(uid, today, tz) {
  const r = await one(
    `SELECT COALESCE(SUM(seconds) FILTER (WHERE (started_at AT TIME ZONE $2)::date=$3::date),0)::int AS today,
            COALESCE(SUM(seconds) FILTER (WHERE (started_at AT TIME ZONE $2)::date>=$4::date),0)::int AS week,
            COALESCE(SUM(seconds),0)::int AS total,
            COUNT(*)::int AS sessions
     FROM focus_sessions WHERE user_id=$1 AND kind='focus'`, [uid, tz, today, startOfWeek(today)]);
  return r;
}

export async function getDashboard(uid, today, tz, visible) {
  const want = (id) => visible.has(id); const d = {};
  const jobs = [];
  const run = (key, p) => jobs.push(p.then((v) => { d[key] = v; }));
  if (want("overview") || want("tasks")) run("tasks", query(
    `SELECT t.id, t.title, t.priority, t.due_date, t.completed, p.name AS project_name FROM tasks t LEFT JOIN projects p ON p.id=t.project_id
     WHERE t.user_id=$1 AND (t.due_date=$2 OR (t.completed=false AND t.due_date<$2) OR (t.completed AND t.completed_at::date = $2::date AND t.due_date IS NULL))
     ORDER BY t.completed, CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.due_date LIMIT 12`, [uid, today]));
  if (want("overview") || want("deadlines")) run("deadlines", query(
    `SELECT id, title, due_date, priority, course FROM deadlines WHERE user_id=$1 AND completed=false ORDER BY due_date LIMIT 6`, [uid]));
  if (want("overview") || want("calendar")) run("events", getEventsRange(uid, new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 7 * 86400e3).toISOString(), tz));
  if (want("overview") || want("money")) run("money", getMoney(uid, today));
  if (want("overview") || want("focus")) run("focus", getFocusTotals(uid, today, tz));
  if (want("projects")) run("projects", query(
    `SELECT p.id, p.name, p.status, p.deadline, COUNT(t.id)::int AS total, COUNT(t.id) FILTER (WHERE t.completed)::int AS done
     FROM projects p LEFT JOIN tasks t ON t.project_id=p.id WHERE p.user_id=$1 AND p.status IN ('in_progress','planned') GROUP BY p.id ORDER BY p.status='in_progress' DESC, p.updated_at DESC LIMIT 5`, [uid]));
  if (want("notes")) run("notes", query(`SELECT id, title, body, pinned, updated_at FROM notes WHERE user_id=$1 AND archived=false ORDER BY pinned DESC, updated_at DESC LIMIT 4`, [uid]));
  if (want("activity")) run("activity", query(`SELECT id, kind, action, label, created_at FROM activities WHERE user_id=$1 ORDER BY created_at DESC LIMIT 8`, [uid]));
  await Promise.all(jobs); return d;
}

export async function getNotifications(uid, today, tz) {
  const out = [];
  const [tasks, dls, events] = await Promise.all([
    query(`SELECT id, title, due_date FROM tasks WHERE user_id=$1 AND completed=false AND due_date<=$2::date+1 ORDER BY due_date LIMIT 10`, [uid, today]),
    query(`SELECT id, title, due_date FROM deadlines WHERE user_id=$1 AND completed=false AND due_date<=$2::date+3 ORDER BY due_date LIMIT 10`, [uid, today]),
    getEventsRange(uid, new Date().toISOString(), new Date(Date.now() + 3 * 3600e3).toISOString(), tz),
  ]);
  for (const t of tasks) out.push({ id: "t" + t.id, kind: "task", href: "/tasks", text: t.due_date < today ? `Overdue: ${t.title}` : t.due_date === today ? `Due today: ${t.title}` : `Due tomorrow: ${t.title}`, tone: t.due_date < today ? "red" : "yellow" });
  for (const d of dls) out.push({ id: "d" + d.id, kind: "deadline", href: "/deadlines", text: `Deadline approaching: ${d.title}`, due: d.due_date, tone: d.due_date <= addDays(today, 1) ? "red" : "orange" });
  for (const e of events) out.push({ id: "e" + e.id + e.occurrence, kind: "event", href: "/calendar", text: `Starting soon: ${e.title}`, at: e.starts_at, tone: "green" });
  return out;
}

const like = (q) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;
export async function globalSearch(uid, q) {
  const l = like(q); const lim = 6;
  const [tasks, notes, projects, bookmarks, ideas, deadlines, files] = await Promise.all([
    query(`SELECT id, title, due_date, completed FROM tasks WHERE user_id=$1 AND (title ILIKE $2 OR notes ILIKE $2) ORDER BY completed, updated_at DESC LIMIT ${lim}`, [uid, l]),
    query(`SELECT id, title, left(body, 140) AS snippet FROM notes WHERE user_id=$1 AND (title ILIKE $2 OR body ILIKE $2) ORDER BY updated_at DESC LIMIT ${lim}`, [uid, l]),
    query(`SELECT id, name AS title, status FROM projects WHERE user_id=$1 AND (name ILIKE $2 OR description ILIKE $2) LIMIT ${lim}`, [uid, l]),
    query(`SELECT id, title, url, domain FROM bookmarks WHERE user_id=$1 AND (title ILIKE $2 OR url ILIKE $2 OR description ILIKE $2) LIMIT ${lim}`, [uid, l]),
    query(`SELECT id, title, status FROM ideas WHERE user_id=$1 AND (title ILIKE $2 OR description ILIKE $2) LIMIT ${lim}`, [uid, l]),
    query(`SELECT id, title, due_date FROM deadlines WHERE user_id=$1 AND (title ILIKE $2 OR course ILIKE $2) LIMIT ${lim}`, [uid, l]),
    query(`SELECT id, name AS title, size_bytes FROM files WHERE user_id=$1 AND name ILIKE $2 LIMIT ${lim}`, [uid, l]),
  ]);
  return { tasks, notes, projects, bookmarks, ideas, deadlines, files };
}
