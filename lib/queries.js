import "server-only";
import { cache } from "@/lib/cache/index";
import { TTL } from "@/lib/jarvis/cachepolicy";
import { query, one } from "@/lib/db";
import { addDays, startOfWeek, startOfMonth, zonedToIso, diffDays } from "@/lib/dates";
import { pickPriority } from "@/lib/priority";
import { getBalances } from "@/lib/splits";
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

// "Priority Now": one query for open tasks (+ project context), scored deterministically in lib/priority.js.
export async function getPriority(uid, today) {
  const rows = await query(
    `SELECT t.id, t.title, t.priority, t.due_date, t.created_at, t.estimate_minutes, t.completed, t.project_id, p.name AS project_name, p.priority AS project_priority, p.status AS project_status,
            EXISTS (SELECT 1 FROM focus_sessions f WHERE f.task_id=t.id AND f.user_id=$1 AND f.started_at > now() - interval '1 day') AS focused_today
     FROM tasks t LEFT JOIN projects p ON p.id=t.project_id AND p.user_id=$1 WHERE t.user_id=$1 AND t.completed=false ORDER BY t.due_date NULLS LAST, t.created_at LIMIT 300`, [uid]);
  const best = pickPriority(rows, today); if (!best) return null;
  const t = best.task;
  return { id: t.id, title: t.title, due_date: t.due_date, priority: t.priority, project_name: t.project_name, estimate_minutes: t.estimate_minutes, why: best.why, overdue: t.due_date && diffDays(t.due_date, today) < 0, dueToday: t.due_date === today };
}

// Everything that happened / is planned today, for the compact timeline (events + finished focus sessions; tasks/deadlines as "anytime").
export async function getTimeline(uid, today, tz) {
  const from = zonedToIso(today + "T00:00", tz), to = zonedToIso(addDays(today, 1) + "T00:00", tz);
  const [events, focus, tasks, deadlines] = await Promise.all([
    getEventsRange(uid, from, to, tz),
    query(`SELECT id, label, seconds, started_at FROM focus_sessions WHERE user_id=$1 AND kind='focus' AND started_at >= $2 AND started_at < $3 ORDER BY started_at`, [uid, from, to]),
    query(`SELECT id, title, completed, priority FROM tasks WHERE user_id=$1 AND ((completed=false AND due_date<=$2) OR due_date=$2) ORDER BY completed, due_date LIMIT 8`, [uid, today]),
    query(`SELECT id, title, due_date FROM deadlines WHERE user_id=$1 AND completed=false AND due_date<=$2 ORDER BY due_date LIMIT 6`, [uid, today]),
  ]);
  return { events, focus, tasks, deadlines };
}

export async function getQuickLinks(uid) {
  return query("SELECT id, title, url, icon, category, description, favorite, position FROM quick_links WHERE user_id=$1 ORDER BY favorite DESC, position, created_at LIMIT 100", [uid]);
}

// Counts + top items that power the command palette's suggestions and smart queries ("overdue", "today"…).
export async function getPaletteContext(uid, today, tz) {
  const [c, urgent, pri, last, evs] = await Promise.all([
    one(`SELECT
      (SELECT count(*)::int FROM tasks WHERE user_id=$1 AND completed=false AND due_date<$2) AS overdue_tasks,
      (SELECT count(*)::int FROM tasks WHERE user_id=$1 AND completed=false AND due_date=$2) AS today_tasks,
      (SELECT count(*)::int FROM deadlines WHERE user_id=$1 AND completed=false AND due_date<$2) AS overdue_deadlines,
      (SELECT count(*)::int FROM deadlines WHERE user_id=$1 AND completed=false AND due_date=$2) AS today_deadlines,
      0 AS today_events`, [uid, today]),
    query(`SELECT id, title, due_date FROM deadlines WHERE user_id=$1 AND completed=false AND due_date<=$2::date+3 ORDER BY due_date LIMIT 3`, [uid, today]),
    getPriority(uid, today),
    one(`SELECT n.id, n.title FROM notes n WHERE n.user_id=$1 AND n.archived=false ORDER BY n.updated_at DESC LIMIT 1`, [uid]),
    getEventsRange(uid, zonedToIso(today + "T00:00", tz), zonedToIso(addDays(today, 1) + "T00:00", tz), tz),
  ]);
  const ss = await one("SELECT slideshow_enabled FROM dashboard_settings WHERE user_id=$1", [uid]);
  return { ...c, today_events: evs.length, urgent, priority: pri && { id: pri.id, title: pri.title }, lastNote: last, slideshow: !!ss?.slideshow_enabled };
}

export async function getDashboard(uid, today, tz, visible) {
  const want = (id) => visible.has(id); const d = {};
  const jobs = [];
  const run = (key, p) => jobs.push(p.then((v) => { d[key] = v; }));
  if (want("overview") || want("tasks")) {
    run(
      "tasks",
      query(
        `SELECT
         t.id,
         t.title,
         t.priority,
         t.due_date,
         t.completed,
         t.created_at,
         t.manual_position,
         t.scheduled_date,
         t.recurrence,
         t.project_id,
         p.name AS project_name
       FROM tasks t
       LEFT JOIN projects p
         ON p.id = t.project_id
       WHERE t.user_id = $1
       ORDER BY
         t.completed,
         t.manual_position NULLS LAST,
         t.due_date NULLS LAST,
         t.created_at DESC
       LIMIT 100`,
        [uid]
      )
    );
  }
  if (want("overview") || want("deadlines")) run("deadlines", query(
    `SELECT id, title, due_date, priority, course FROM deadlines WHERE user_id=$1 AND completed=false ORDER BY due_date LIMIT 6`, [uid]));
  if (want("overview") || want("calendar")) run("events", getEventsRange(uid, new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 7 * 86400e3).toISOString(), tz));
  if (want("overview") || want("money")) run("money", getMoney(uid, today));
  if (want("overview") || want("focus")) run("focus", getFocusTotals(uid, today, tz));
  if (want("priority")) run("priority", getPriority(uid, today));
  if (want("timeline")) run("timeline", getTimeline(uid, today, tz));
  if (want("quicklinks")) run("quicklinks", getQuickLinks(uid));
  if (want("overview")) run("dlToday", one("SELECT count(*)::int AS n FROM deadlines WHERE user_id=$1 AND completed=false AND due_date<=$2", [uid, today]));
  if (want("splits")) run("splits", getBalances(uid));
  if (want("projects")) run("projects", query(
    `SELECT p.id, p.name, p.status, p.deadline, COUNT(t.id)::int AS total, COUNT(t.id) FILTER (WHERE t.completed)::int AS done
     FROM projects p LEFT JOIN tasks t ON t.project_id=p.id WHERE p.user_id=$1 AND p.status IN ('in_progress','planned') GROUP BY p.id ORDER BY p.status='in_progress' DESC, p.updated_at DESC LIMIT 5`, [uid]));
  if (want("notes")) run("notes", query(`SELECT id, title, body, pinned, updated_at FROM notes WHERE user_id=$1 AND archived=false ORDER BY pinned DESC, updated_at DESC LIMIT 4`, [uid]));
  if (want("ideas")) run("ideas", query(`SELECT i.id, i.title, i.status, i.priority, p.name AS project_name, count(*) OVER()::int AS total FROM ideas i LEFT JOIN projects p ON p.id=i.project_id WHERE i.user_id=$1 AND i.status IN ('inbox','considering','building') ORDER BY (i.status='inbox') DESC, i.created_at DESC LIMIT 5`, [uid]));
  if (want("bugs")) run("bugs", query(`SELECT b.id, b.title, b.status, b.priority, p.name AS project_name, count(*) OVER()::int AS total FROM bugs b JOIN projects p ON p.id=b.project_id AND p.user_id=b.user_id WHERE b.user_id=$1 AND b.status IN ('open','in_progress') ORDER BY CASE b.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, b.created_at DESC LIMIT 5`, [uid]));
  if (want("checklists")) run("checklists", query(`SELECT c.id, c.title, count(i.id)::int AS total, (count(i.id) FILTER (WHERE i.done))::int AS done FROM checklists c LEFT JOIN checklist_items i ON i.checklist_id=c.id AND i.user_id=c.user_id WHERE c.user_id=$1 GROUP BY c.id ORDER BY (count(i.id) FILTER (WHERE NOT i.done) > 0) DESC, c.updated_at DESC LIMIT 4`, [uid]));
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
const RECENT = {
  projects: `SELECT id, name AS title, status FROM projects WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 8`,
  notes: `SELECT id, title, left(body, 140) AS snippet FROM notes WHERE user_id=$1 AND archived=false ORDER BY updated_at DESC LIMIT 8`,
  tasks: `SELECT id, title, due_date, completed FROM tasks WHERE user_id=$1 AND completed=false ORDER BY due_date NULLS LAST, created_at DESC LIMIT 8`,
};
export async function recentByType(uid, type) {
  if (!RECENT[type]) return {}; return { [type]: await query(RECENT[type], [uid]) };
}
export async function globalSearch(uid, q) {
  const l = like(q); const lim = 6;
  const [tasks, notes, projects, bookmarks, ideas, deadlines, files, quicklinks, activity, splits] = await Promise.all([
    query(`SELECT id, title, due_date, completed FROM tasks WHERE user_id=$1 AND (title ILIKE $2 OR notes ILIKE $2) ORDER BY completed, updated_at DESC LIMIT ${lim}`, [uid, l]),
    query(`SELECT id, title, left(body, 140) AS snippet FROM notes WHERE user_id=$1 AND (title ILIKE $2 OR body ILIKE $2) ORDER BY updated_at DESC LIMIT ${lim}`, [uid, l]),
    query(`SELECT id, name AS title, status FROM projects WHERE user_id=$1 AND (name ILIKE $2 OR description ILIKE $2) LIMIT ${lim}`, [uid, l]),
    query(`SELECT id, title, url, domain FROM bookmarks WHERE user_id=$1 AND (title ILIKE $2 OR url ILIKE $2 OR description ILIKE $2) LIMIT ${lim}`, [uid, l]),
    query(`SELECT id, title, status FROM ideas WHERE user_id=$1 AND (title ILIKE $2 OR description ILIKE $2) LIMIT ${lim}`, [uid, l]),
    query(`SELECT id, title, due_date FROM deadlines WHERE user_id=$1 AND (title ILIKE $2 OR course ILIKE $2) LIMIT ${lim}`, [uid, l]),
    query(`SELECT id, name AS title, size_bytes FROM files WHERE user_id=$1 AND name ILIKE $2 LIMIT ${lim}`, [uid, l]),
    query(`SELECT id, title, url, icon, description AS snippet FROM quick_links WHERE user_id=$1 AND (title ILIKE $2 OR url ILIKE $2 OR category ILIKE $2 OR description ILIKE $2) ORDER BY favorite DESC LIMIT 5`, [uid, l]),
    query(`SELECT id, label AS title, kind, action FROM activities WHERE user_id=$1 AND label ILIKE $2 ORDER BY created_at DESC LIMIT 4`, [uid, l]),
    query(`SELECT e.friend_id AS id, f.name || ': ' || COALESCE(NULLIF(e.reason,''), replace(e.kind,'_',' ')) AS title, e.kind AS status FROM split_entries e JOIN friends f ON f.id=e.friend_id AND f.user_id=$1 WHERE e.user_id=$1 AND (e.reason ILIKE $2 OR f.name ILIKE $2) ORDER BY e.entry_date DESC LIMIT 4`, [uid, l]),
  ]);
  return { quicklinks, projects, tasks, notes, bookmarks, deadlines, files, ideas, splits, activity };
}

// ── Cached dashboard ────────────────────────────────────────────────────────────────────────────────────────────────────
// The whole dashboard payload is cached per user (+ today, timezone and WHICH widgets are visible, so hidden widgets never load or leak).
// Correctness comes from the per-user version token: any write bumps it, so the next load is fresh. The 60 s TTL is only a safety net
// (also keeps "next event" style lists from drifting). The payload is normalised to plain JSON on hit AND miss (Dates → ISO strings),
// so both paths hand the client identical data. If Redis is unavailable this is exactly getDashboard().
const toPlain = (v) => JSON.parse(JSON.stringify(v));
export function dashboardWith(c) {
  return async (uid, today, tz, visible) => {
    const r = await c.lookup(uid, "dashboard", { today, tz, w: [...visible].sort() });
    if (r.hit) return r.value;
    const d = toPlain(await getDashboard(uid, today, tz, visible));
    await c.store(r.token, d, TTL.dashboard, { maxBytes: 256 * 1024 });
    return d;
  };
}
// DASHBOARD_CACHE=0 turns off ONLY the dashboard cache (JARVIS caching stays on). Same data shape either way.
export const getDashboardCached = process.env.DASHBOARD_CACHE === "0" ? async (...a) => toPlain(await getDashboard(...a)) : dashboardWith(cache);
