import "server-only";
import { z } from "zod";
import { query, one } from "@/lib/db";
import { fail } from "@/lib/crud";
import { tasksSvc, bugsSvc, setBugStatus, ideasSvc, expensesSvc, deadlinesSvc, projectsSvc, notesSvc, bookmarksSvc, eventsSvc, createTaskFromIdea } from "@/lib/services";
import { getEventsRange, getFocusTotals, getPriority, globalSearch } from "@/lib/queries";
import { fetchMetadata, normalizeUrl } from "@/lib/metadata";
import { addDays, startOfWeek, startOfMonth, zonedToIso, relDay, fmtDate, dateInTz } from "@/lib/dates";
import { money as moneyIn } from "@/lib/format";
import { AsyncLocalStorage } from "node:async_hooks";
import { getMoney } from "@/lib/queries";
// The user's currency symbol (Settings → Preferences) for the tool that is running. Per-async-chain, so concurrent requests can't mix currencies.
export const currencyStore = new AsyncLocalStorage();
const money = (n, cur) => moneyIn(n, cur ?? currencyStore.getStore() ?? "₹");
export const MONEY_TOOLS = new Set(["create_expense", "list_expenses", "get_expense_summary", "get_expense_stats", "add_split_entry", "list_balances", "settle_split", "get_budget"]);
import { expenseStats, resolveRange } from "@/lib/analytics";
import { buildTaskFilter, WHEN } from "@/lib/jarvis/taskquery";
import { parseQuickTask } from "@/lib/nlp";
import { parseRepeat } from "@/lib/recurrence-text";
import { describeRule } from "@/lib/recurrence";
import { recurrenceRuleSchema } from "@/lib/validation";
import { ALL_THEMES, matchTheme } from "@/lib/themes";
import { applyTheme } from "@/lib/theme-service";
import { addMemory, listMemories, updateMemory, deleteMemory, deleteAllMemories, findMemory } from "@/lib/memory";
import { resolveProjectRef } from "@/lib/projects-resolve";
import { findFriend, addFriend, addEntry, settleUp, getBalances } from "@/lib/splits";

// Explicit allow-list of tools the model may call. Every tool: strict zod schema → ownership-checked service call →
// real result. No SQL from the model, no user ids from the model (the session user is passed in `ctx`).
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const prio = z.enum(["low", "medium", "high"]);
const opt = (s) => s.optional();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const like = (s) => `%${String(s).replace(/[\\%_]/g, "\\$&")}%`;
const clarify = (message) => ({ ok: false, clarify: true, message });
const rec = (title, lines, links = [], icon = "check") => ({ type: "record", icon, title, lines, links });
const list = (title, items, note) => ({ type: "list", title, items, note });

// ── name → record resolvers (ambiguity is returned to the model so it asks the user, never guessed) ──
async function findOne(table, col, ref, uid, extra = "", label = "item") {
  if (UUID.test(ref)) { const r = await one(`SELECT * FROM ${table} WHERE id=$1 AND user_id=$2`, [ref, uid]); if (r) return { row: r }; }
  const exact = await query(`SELECT * FROM ${table} WHERE user_id=$1 AND lower(${col})=lower($2) ${extra} LIMIT 5`, [uid, ref]);
  if (exact.length === 1) return { row: exact[0] };
  const rows = exact.length > 1 ? exact : await query(`SELECT * FROM ${table} WHERE user_id=$1 AND ${col} ILIKE $2 ${extra} ORDER BY created_at DESC LIMIT 6`, [uid, like(ref)]);
  if (rows.length === 1) return { row: rows[0] };
  if (rows.length === 0) return { err: { ok: false, message: `No ${label} matches “${ref}”.` } };
  return { err: clarify(`Several ${label}s match “${ref}”: ${rows.map((r) => `“${r[col]}”`).join(", ")}. Ask the user which one.`) };
}
const getProject = (uid, ref) => findOne("projects", "name", ref, uid, "AND status<>'archived'", "project");
const getTask = (uid, ref) => findOne("tasks", "title", ref, uid, "AND completed=false", "open task");
const getIdea = (uid, ref) => findOne("ideas", "title", ref, uid, "", "idea");
// Turn the user's repeat wording (+ optional end) into a validated rule, or a clarifying question. Never guesses.
function buildRepeat(a, startDate, tz) {
  const p = parseRepeat(a.repeat, startDate); if (p.error) return { err: clarify(p.error) }; if (p.none) return { rule: null };
  const rule = { ...p.rule, tz }; if (a.repeat_until) { delete rule.count; rule.until = a.repeat_until; } if (a.repeat_count) { delete rule.until; rule.count = a.repeat_count; }
  if (rule.until && rule.until < startDate) return { err: { ok: false, message: "The end date is before the event starts." } };
  const v = recurrenceRuleSchema.safeParse(rule); if (!v.success) return { err: { ok: false, message: `That repeat isn't valid: ${v.error.issues[0].message}` } };
  return { rule: v.data };
}
async function projectId(uid, ref) { if (!ref) return { id: null }; const r = await resolveProjectRef(uid, ref);
  if (r.project) return { id: r.project.id, name: r.project.name, rest: r.rest };
  return { err: r.ambiguous ? clarify(r.message) : { ok: false, message: r.message } }; }

const taskLine = (t, today) => ({ text: t.title, sub: [t.scheduled_date ? `Scheduled ${relDay(t.scheduled_date, today)}` : null, t.due_date ? `Due ${relDay(t.due_date, today)}` : null, t.priority !== "medium" ? t.priority : null, t.project_name].filter(Boolean).join(" · "), href: `/tasks?open=${t.id}` });

function periodRange(p, today) {
  if (p === "today") return [today, today]; if (p === "week") return [startOfWeek(today), today];
  if (p === "last_month") { const s = startOfMonth(addDays(startOfMonth(today), -1)); return [s, addDays(startOfMonth(today), -1)]; }
  if (p === "all") return ["1970-01-01", today]; return [startOfMonth(today), today];
}

export const TOOLS = {
  create_task: { desc: "Create a task. Use for 'add a task…'. due_date must be YYYY-MM-DD (resolve relative dates from today's date).",
    props: { title: ["STRING", "Task title", 1], due_date: ["STRING", "Deadline YYYY-MM-DD, optional"], scheduled_date: ["STRING", "Day to work on it YYYY-MM-DD, optional. Use for 'add a task for tomorrow' (a plan, not a deadline); use due_date only when the user says due/deadline/by."], priority: ["STRING", "low|medium|high, optional"], project: ["STRING", "Project name, optional"], estimate_minutes: ["INTEGER", "Optional minutes"] },
    schema: z.object({ title: z.string().trim().min(1).max(300), due_date: opt(date), scheduled_date: opt(date), priority: opt(prio), project: opt(z.string().max(120)), estimate_minutes: opt(z.number().int().min(1).max(1440)) }),
    async run(a, { uid, tz }) { const p = await projectId(uid, a.project); if (p.err) return p.err;
      if (p.rest) { const x = parseQuickTask(p.rest, tz); a.title = `${a.title} ${x.title}`.trim(); if (x.due_date && !a.scheduled_date && !a.due_date) a.scheduled_date = x.due_date; }
      const t = await tasksSvc.create({ title: a.title, due_date: a.due_date ?? null, scheduled_date: a.scheduled_date ?? null, priority: a.priority, project_id: p.id, estimate_minutes: a.estimate_minutes ?? "" });
      return { ok: true, data: { id: t.id, title: t.title, due_date: t.due_date }, card: rec("Task added", [t.title, t.scheduled_date ? `Scheduled ${fmtDate(t.scheduled_date)}` : null, t.due_date ? `Due ${fmtDate(t.due_date)}` : (t.scheduled_date ? null : "No date"), a.priority ? `Priority ${t.priority}` : null, p.name ? `Project: ${p.name}` : null].filter(Boolean), [{ label: "View task", href: `/tasks?open=${t.id}` }]) }; } },
  list_tasks: { desc: "List or COUNT the user's tasks using filters — ALWAYS pass every filter the user mentioned; never call it without filters when the user asked for something specific. 'when' is resolved by the server (do not compute dates). date_field: 'scheduled' = the day the user plans to work on it, 'due' = deadline, omit for 'either' (scheduled date if set, else due date). For 'how many…' set count_only. Completed-in-a-period questions use status=completed + completed_when.",
    props: { status: ["STRING", "open|completed|all (default open)"], priority: ["STRING", "low|medium|high"], project: ["STRING", "Project name"], when: ["STRING", "today|tomorrow|yesterday|this_week|next_week|this_month|last_month|overdue"], date_field: ["STRING", "scheduled|due (omit = either)"], from: ["STRING", "YYYY-MM-DD range start"], to: ["STRING", "YYYY-MM-DD range end"], completed_when: ["STRING", "same keywords; filters by completion time"], search: ["STRING", "words in the title"], sort: ["STRING", "due|scheduled|priority|newest|recently_completed|manual"], limit: ["INTEGER", "1-25, e.g. 3 for 'next three tasks'"], count_only: ["BOOLEAN", "only return the count"], filter: ["STRING", "LEGACY: overdue|today|upcoming|open|completed_today|completed_this_week"] },
    schema: z.object({ status: opt(z.enum(["open", "completed", "all"])), priority: opt(prio), project: opt(z.string().max(120)), when: opt(z.enum(WHEN)), date_field: opt(z.enum(["scheduled", "due"])), from: opt(date), to: opt(date), completed_when: opt(z.enum(WHEN)), search: opt(z.string().max(100)), sort: opt(z.enum(["due", "scheduled", "priority", "newest", "recently_completed", "manual"])), limit: opt(z.number().int().min(1).max(25)), count_only: opt(z.boolean()), filter: opt(z.enum(["overdue", "today", "upcoming", "open", "completed_today", "completed_this_week"])) }),
    async run(a, { uid, today, tz }) {
      const legacy = { overdue: { when: "overdue" }, today: { when: "today" }, upcoming: { from: addDays(today, 1) }, open: {}, completed_today: { status: "completed", completed_when: "today" }, completed_this_week: { status: "completed", completed_when: "this_week" } }[a.filter] || {};
      const q = { ...legacy, ...Object.fromEntries(Object.entries(a).filter(([k, v]) => v !== undefined && k !== "filter")) };
      const p = await projectId(uid, q.project); if (p.err) return p.err;     // validated against THIS user's projects; ambiguity → question, unknown → error
      const f = buildTaskFilter({ ...q, project_id: p.id }, { uid, today, tz });
      const total = (await one(`SELECT count(*)::int AS n FROM tasks t WHERE ${f.where}`, f.params)).n;
      const label = [q.status === "completed" ? "completed" : q.status === "all" ? "all" : "open", q.priority && `${q.priority}-priority`, q.when && q.when.replace(/_/g, " "), q.completed_when && `completed ${q.completed_when.replace(/_/g, " ")}`, p.name && `in ${p.name}`].filter(Boolean).join(" · ");
      if (q.count_only) return { ok: true, data: { count: total, filters: label }, card: rec(`${total} task${total === 1 ? "" : "s"}`, [label]) };
      const rows = total ? await query(`SELECT t.id, t.title, t.priority, t.due_date, t.scheduled_date, p.name AS project_name FROM tasks t LEFT JOIN projects p ON p.id=t.project_id WHERE ${f.where} ORDER BY ${f.orderBy} LIMIT ${f.limit}`, f.params) : [];
      return { ok: true, data: { filters: label, total, shown: rows.map((t) => ({ title: t.title, scheduled: t.scheduled_date, due: t.due_date, priority: t.priority, project: t.project_name })) },
        card: list(`${label || "tasks"} · ${total}`, rows.map((t) => taskLine(t, today)), total === 0 ? "No tasks match." : total > rows.length ? `Showing ${rows.length} of ${total}` : undefined) }; } },
  update_task: { desc: "Change an open task's priority, due date (deadline), scheduled date (day to work on it) or title. Identify it by title text.",
    props: { task: ["STRING", "Task title (or part of it)", 1], priority: ["STRING", "low|medium|high"], due_date: ["STRING", "YYYY-MM-DD"], scheduled_date: ["STRING", "YYYY-MM-DD"], title: ["STRING", "New title"] },
    schema: z.object({ task: z.string().trim().min(1).max(300), priority: opt(prio), due_date: opt(date), scheduled_date: opt(date), title: opt(z.string().trim().min(1).max(300)) }),
    async run(a, { uid }) { const r = await getTask(uid, a.task); if (r.err) return r.err;
      const patch = Object.fromEntries(Object.entries({ priority: a.priority, due_date: a.due_date, scheduled_date: a.scheduled_date, title: a.title }).filter(([, v]) => v !== undefined)); if (!Object.keys(patch).length) return clarify("Nothing to change was specified. Ask what to change.");
      const t = await tasksSvc.update(r.row.id, patch); return { ok: true, data: { id: t.id, title: t.title }, card: rec("Task updated", [t.title, a.priority ? `Priority ${t.priority}` : null, a.due_date ? `Due ${fmtDate(t.due_date)}` : null, a.scheduled_date ? `Scheduled ${fmtDate(t.scheduled_date)}` : null].filter(Boolean), [{ label: "View task", href: `/tasks?open=${t.id}` }], "edit") }; } },
  complete_task: { desc: "Mark an open task complete.", props: { task: ["STRING", "Task title (or part of it)", 1] }, schema: z.object({ task: z.string().trim().min(1).max(300) }),
    async run(a, { uid }) { const r = await getTask(uid, a.task);  if (r.err) return r.err;
      await query("UPDATE tasks SET completed=true, completed_at=now(), updated_at=now() WHERE id=$1 AND user_id=$2", [r.row.id, uid]); await query("INSERT INTO activities(user_id,kind,action,label) VALUES($1,'task','completed',$2)", [uid, r.row.title]);
      return { ok: true, data: { title: r.row.title }, card: rec("Task completed", [r.row.title], [{ label: "Open tasks", href: "/tasks" }]) }; } },
  delete_task: { confirm: true, desc: "Delete a task (asks the user to confirm first).", props: { task: ["STRING", "Task title", 1] }, schema: z.object({ task: z.string().trim().min(1).max(300) }),
    async preview(a, { uid }) { const r = await findOne("tasks", "title", a.task, uid, "", "task"); if (r.err) return r.err; return { ok: true, text: `Delete task “${r.row.title}”?`, args: { task: r.row.id } }; },
    async run(a, { uid }) { const r = await getTask(uid, a.task).then((x) => x.row ? x : findOne("tasks", "title", a.task, uid, "", "task")); if (r.err) return r.err; await tasksSvc.remove(r.row.id); return { ok: true, data: {}, card: rec("Task deleted", [r.row.title], [], "trash") }; } },
  complete_overdue_tasks: { confirm: true, desc: "Bulk: mark ALL overdue tasks complete (asks to confirm).", props: {}, schema: z.object({}),
    async preview(a, { uid, today }) { const n = (await one("SELECT count(*)::int AS n FROM tasks WHERE user_id=$1 AND completed=false AND due_date<$2", [uid, today])).n; if (!n) return { ok: false, message: "There are no overdue tasks." }; return { ok: true, text: `Mark ${n} overdue task${n > 1 ? "s" : ""} as complete?`, args: {} }; },
    async run(a, { uid, today }) { const r = await query("UPDATE tasks SET completed=true, completed_at=now(), updated_at=now() WHERE user_id=$1 AND completed=false AND due_date<$2 RETURNING title", [uid, today]); await query("INSERT INTO activities(user_id,kind,action,label) VALUES($1,'task','completed',$2)", [uid, `${r.length} overdue tasks (via JARVIS)`]); return { ok: true, data: { count: r.length }, card: rec(`${r.length} tasks completed`, r.slice(0, 5).map((x) => x.title), [{ label: "Open tasks", href: "/tasks" }]) }; } },
  create_idea: { desc: "Save an idea, optionally attached to a project (project name).", props: { title: ["STRING", "Idea title", 1], description: ["STRING", "Details, optional"], project: ["STRING", "Project name, optional"] },
    schema: z.object({ title: z.string().trim().min(1).max(200), description: opt(z.string().max(5000)), project: opt(z.string().max(120)) }),
    async run(a, { uid }) { const p = await projectId(uid, a.project); if (p.err) return p.err; const i = await ideasSvc.create({ title: a.title, description: a.description, project_id: p.id });
      return { ok: true, data: { id: i.id, title: i.title }, card: rec("Idea saved", [i.title, p.name ? `Project: ${p.name}` : "No project"], [{ label: "View idea", href: `/ideas?open=${i.id}` }], "idea") }; } },
  list_ideas: { desc: "List ideas: all, for a project, unassigned, converted to tasks, or not yet converted.", props: { project: ["STRING", "Project name, optional"], scope: ["STRING", "all|unassigned|converted|unconverted"] },
    schema: z.object({ project: opt(z.string().max(120)), scope: opt(z.enum(["all", "unassigned", "converted", "unconverted"])) }),
    async run(a, { uid }) { const p = await projectId(uid, a.project); if (p.err) return p.err; const s = a.scope || "all";
      const rows = await query(`SELECT i.id, i.title, i.status, p.name AS project_name, (SELECT count(*)::int FROM tasks t WHERE t.source_idea_id=i.id AND t.user_id=$1) AS task_count FROM ideas i LEFT JOIN projects p ON p.id=i.project_id WHERE i.user_id=$1 AND ($2::uuid IS NULL OR i.project_id=$2)
        AND ($3='all' OR ($3='unassigned' AND i.project_id IS NULL) OR ($3='converted' AND EXISTS (SELECT 1 FROM tasks t WHERE t.source_idea_id=i.id)) OR ($3='unconverted' AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.source_idea_id=i.id))) ORDER BY i.created_at DESC LIMIT 15`, [uid, p.id, s]);
      return { ok: true, data: { count: rows.length, ideas: rows.map((r) => ({ title: r.title, status: r.status, project: r.project_name, linked_tasks: r.task_count })) }, card: list(`${p.name ? p.name + " · " : ""}${s} ideas · ${rows.length}`, rows.map((r) => ({ text: r.title, sub: [r.project_name, r.task_count ? `${r.task_count} task(s)` : null, r.status].filter(Boolean).join(" · "), href: `/ideas?open=${r.id}` }))) }; } },
  create_linked_task: { desc: "Convert an idea into a linked task (the idea is kept).", props: { idea: ["STRING", "Idea title", 1], title: ["STRING", "Task title, defaults to the idea title"], due_date: ["STRING", "YYYY-MM-DD"], priority: ["STRING", "low|medium|high"] },
    schema: z.object({ idea: z.string().trim().min(1).max(200), title: opt(z.string().trim().min(1).max(300)), due_date: opt(date), priority: opt(prio) }),
    async run(a, { uid }) { const r = await getIdea(uid, a.idea); if (r.err) return r.err; const { task, idea } = await createTaskFromIdea(uid, r.row.id, { title: a.title || r.row.title, notes: r.row.description, due_date: a.due_date ?? null, priority: a.priority });
      return { ok: true, data: { task: task.title, idea: idea.title }, card: rec("Linked task created", [task.title, `From idea: ${idea.title} (kept)`], [{ label: "View task", href: `/tasks?open=${task.id}` }, { label: "View idea", href: `/ideas?open=${idea.id}` }], "link") }; } },
  delete_idea: { confirm: true, desc: "Delete an idea (asks to confirm; linked tasks are kept).", props: { idea: ["STRING", "Idea title", 1] }, schema: z.object({ idea: z.string().trim().min(1).max(200) }),
    async preview(a, { uid }) { const r = await getIdea(uid, a.idea); if (r.err) return r.err; return { ok: true, text: `Delete idea “${r.row.title}”? Tasks created from it are kept.`, args: { idea: r.row.id } }; },
    async run(a, { uid }) { const r = await getIdea(uid, a.idea); if (r.err) return r.err; await ideasSvc.remove(r.row.id); return { ok: true, data: {}, card: rec("Idea deleted", [r.row.title], [], "trash") }; } },
  create_expense: { desc: "Record an expense in rupees (₹). Only when the amount is clear; otherwise ask. category optional.", props: { amount: ["NUMBER", "Amount in rupees", 1], description: ["STRING", "What it was for"], category: ["STRING", "food|transport|shopping|bills|entertainment|health|other"], date: ["STRING", "YYYY-MM-DD, defaults to today"], currency: ["STRING", "Only if the user stated a currency"] },
    schema: z.object({ amount: z.number().positive().max(1e8), description: opt(z.string().max(300)), category: opt(z.string().max(40)), date: opt(date), currency: opt(z.string().max(12)) }),
    async run(a, { uid, today }) { if (a.currency && !/^(₹|inr|rs\.?|rupees?)$/i.test(a.currency.trim())) return clarify(`The app tracks expenses in ₹ only; the user mentioned “${a.currency}”. Ask how to proceed.`);
      const e = await expensesSvc.create({ amount: a.amount, category: a.category || "other", description: a.description || "", spent_on: a.date || today });
      return { ok: true, data: { id: e.id, amount: e.amount }, card: rec(`Expense added: ${money(e.amount)}`, [e.description || "No description", `Category: ${a.category ? e.category : "unspecified"}`, `Date: ${fmtDate(e.spent_on)}`], [{ label: "View expenses", href: "/expenses" }], "wallet") }; } },
  list_expenses: { desc: "List recent expenses for a period.", props: { period: ["STRING", "today|week|month|last_month|all"], category: ["STRING", "optional"] }, schema: z.object({ period: opt(z.enum(["today", "week", "month", "last_month", "all"])), category: opt(z.string().max(40)) }),
    async run(a, { uid, today }) { const [from, to] = periodRange(a.period || "month", today);
      const rows = await query("SELECT id, amount, category, description, spent_on FROM expenses WHERE user_id=$1 AND spent_on BETWEEN $2 AND $3 AND ($4::text IS NULL OR category ILIKE $4) ORDER BY spent_on DESC, created_at DESC LIMIT 10", [uid, from, to, a.category ?? null]);
      return { ok: true, data: { expenses: rows.map((r) => ({ amount: r.amount, category: r.category, description: r.description, date: r.spent_on })) }, card: list(`Recent expenses (${a.period || "month"})`, rows.map((r) => ({ text: `${money(r.amount)} · ${r.description || r.category}`, sub: `${fmtDate(r.spent_on)} · ${r.category}`, href: "/expenses" }))) }; } },
  get_expense_summary: { desc: "Exact spending total (and per-category breakdown) for a period. NEVER compute totals yourself — call this.", props: { period: ["STRING", "today|week|month|last_month|all", 1], category: ["STRING", "optional"] }, schema: z.object({ period: z.enum(["today", "week", "month", "last_month", "all"]), category: opt(z.string().max(40)) }),
    async run(a, { uid, today }) { const [from, to] = periodRange(a.period, today);
      const rows = await query("SELECT category, SUM(amount)::float AS total, count(*)::int AS n FROM expenses WHERE user_id=$1 AND spent_on BETWEEN $2 AND $3 AND ($4::text IS NULL OR category ILIKE $4) GROUP BY category ORDER BY total DESC", [uid, from, to, a.category ?? null]);
      const total = rows.reduce((s, r) => s + r.total, 0), n = rows.reduce((s, r) => s + r.n, 0);
      return { ok: true, data: { period: a.period, total, currency: currencyStore.getStore() ?? "₹", count: n, by_category: rows.map((r) => ({ category: r.category, total: r.total })) }, card: rec(`Spent (${a.period.replace("_", " ")}): ${money(total)}`, rows.slice(0, 5).map((r) => `${r.category}: ${money(r.total)}`).concat(n ? [] : ["No expenses in this period"]), [{ label: "View expenses", href: "/expenses" }], "wallet") }; } },
  get_expense_stats: { desc: "Full, exact expense analytics for any date range/filter: total, count, average per day / per expense / per active day, median, max, min, by category, by weekday (+weekend vs weekday totals), by month (12m), daily series, top expenses, most-spent-on items, change vs the previous equal-length period, and month-end forecast. Use `contains` for item/merchant questions (e.g. coffee). Use this for ANY expense metric question; read the answer from the returned fields — never calculate yourself.",
    props: { period: ["STRING", "today|week|last_7_days|last_30_days|last_90_days|month|last_month|year|all (ignored if from/to given)"], from: ["STRING", "YYYY-MM-DD"], to: ["STRING", "YYYY-MM-DD"], category: ["STRING", "Filter by category"], contains: ["STRING", "Filter: description contains this text"] },
    schema: z.object({ period: opt(z.enum(["today", "week", "last_7_days", "last_30_days", "last_90_days", "month", "last_month", "year", "all"])), from: opt(date), to: opt(date), category: opt(z.string().max(40)), contains: opt(z.string().max(60)) }),
    async run(a, { uid, today, settings }) { let [from, to] = a.from && a.to ? [a.from, a.to] : resolveRange(a.period || "month", today); if (from > to) [from, to] = [to, from];
      const s = await expenseStats(uid, { from, to, category: a.category || null, contains: a.contains || null }, today); const cur = settings?.currency || "₹";
      const slim = { ...s, daily: s.daily.length > 31 ? undefined : s.daily, daily_note: s.daily.length > 31 ? "daily series omitted (long range); use by_month/by_weekday" : undefined, by_category: s.by_category.slice(0, 10) };
      return { ok: true, data: slim, card: rec(`Spent ${money(s.total, cur)} · ${s.count} expense${s.count === 1 ? "" : "s"}`, [`${fmtDate(s.range.from)} → ${fmtDate(s.range.to)} (${s.range.days} days)`, `Avg/day ${money(s.average_per_day, cur)} · avg/expense ${money(s.average_per_expense, cur)}`, `Highest ${money(s.max, cur)} · median ${money(s.median, cur)}`, s.previous_period.change_pct !== null ? `${s.previous_period.change_pct >= 0 ? "▲" : "▼"} ${Math.abs(s.previous_period.change_pct)}% vs previous period` : null].filter(Boolean), [{ label: "Open analytics", href: `/expenses?range=custom&from=${s.range.from}&to=${s.range.to}${a.category ? "&cat=" + encodeURIComponent(a.category) : ""}${a.contains ? "&q=" + encodeURIComponent(a.contains) : ""}` }], "wallet") }; } },
  add_split_entry: { desc: "Note a split/loan with a friend (just a name). kind: lent = I paid/lent so they owe me; borrowed = they paid/lent so I owe them; they_paid_me = they paid me back; i_paid_them = I paid them back. A new friend name is added automatically. Needs amount; reason is the 'why'.",
    props: { friend: ["STRING", "Friend's name", 1], kind: ["STRING", "lent|borrowed|they_paid_me|i_paid_them", 1], amount: ["NUMBER", "Amount in rupees", 1], reason: ["STRING", "Why (e.g. dinner, cab)"] },
    schema: z.object({ friend: z.string().trim().min(1).max(60), kind: z.enum(["lent", "borrowed", "they_paid_me", "i_paid_them"]), amount: z.number().positive().max(1e8), reason: opt(z.string().max(300)) }),
    async run(a, { uid, settings }) { const r = await findFriend(uid, a.friend); if (r.ambiguous) return clarify(`Several friends match “${a.friend}”: ${r.ambiguous.join(", ")}. Ask which one.`);
      const created = !!r.none; const friend = r.friend || await addFriend(uid, r.none); const { entry } = await addEntry(uid, friend.id, { kind: a.kind, amount: a.amount, reason: a.reason || "" });
      const [b] = (await getBalances(uid)).filter((x) => x.id === friend.id); const cur = settings?.currency || "₹";
      return { ok: true, data: { friend: friend.name, new_friend: created, entry_amount: entry.amount, balance_after: b.balance, meaning: "positive balance = friend owes the user" }, card: rec(`${friend.name}: ${a.kind === "lent" ? "owes you" : a.kind === "borrowed" ? "you owe" : a.kind === "they_paid_me" ? "paid you back" : "you paid back"} ${money(a.amount, cur)}`, [a.reason || "No reason noted", created ? "New friend added" : null, `Balance now: ${b.balance > 0 ? `${friend.name} owes you ${money(b.balance, cur)}` : b.balance < 0 ? `you owe ${friend.name} ${money(-b.balance, cur)}` : "settled up"}`].filter(Boolean), [{ label: "Open splits", href: `/splits?friend=${friend.id}` }], "wallet") }; } },
  list_balances: { desc: "Who owes whom: balances with friends (all, or one friend by name) plus totals. Exact figures from the ledger.", props: { friend: ["STRING", "Friend's name, optional"] }, schema: z.object({ friend: opt(z.string().max(60)) }),
    async run(a, { uid, settings }) { const all = await getBalances(uid); let rows = all; if (a.friend) { const r = await findFriend(uid, a.friend); if (r.ambiguous) return clarify(`Several friends match: ${r.ambiguous.join(", ")}. Ask which one.`); if (r.none) return { ok: false, message: `You have no friend named “${a.friend}”.` }; rows = all.filter((x) => x.id === r.friend.id); }
      const cur = settings?.currency || "₹"; const owed = rows.reduce((s, x) => s + Math.max(0, x.balance), 0), owe = rows.reduce((s, x) => s + Math.max(0, -x.balance), 0);
      const detail = a.friend && rows[0] ? await query("SELECT kind, amount::float AS amount, reason, entry_date::text AS date FROM split_entries WHERE user_id=$1 AND friend_id=$2 ORDER BY entry_date DESC, created_at DESC LIMIT 8", [uid, rows[0].id]) : undefined;
      return { ok: true, data: { you_are_owed: owed, you_owe: owe, net: owed - owe, friends: rows.map((x) => ({ name: x.name, balance: x.balance })), recent_entries: detail, meaning: "positive balance = friend owes the user" }, card: list(`Owed to you ${money(owed, cur)} · You owe ${money(owe, cur)}`, rows.filter((x) => Math.abs(x.balance) > 0.004).slice(0, 10).map((x) => ({ text: x.name, sub: x.balance > 0 ? `owes you ${money(x.balance, cur)}` : `you owe ${money(-x.balance, cur)}`, href: `/splits?friend=${x.id}` }))) }; } },
  settle_split: { desc: "Settle up with a friend: records the payment that brings the balance to zero.", props: { friend: ["STRING", "Friend's name", 1] }, schema: z.object({ friend: z.string().trim().min(1).max(60) }),
    async run(a, { uid, settings }) { const r = await findFriend(uid, a.friend); if (r.ambiguous) return clarify(`Several friends match: ${r.ambiguous.join(", ")}. Ask which one.`); if (r.none) return { ok: false, message: `You have no friend named “${a.friend}”.` };
      const { friend, balance } = await settleUp(uid, r.friend.id); const cur = settings?.currency || "₹"; return { ok: true, data: { friend: friend.name, settled_amount: Math.abs(balance) }, card: rec(`Settled up with ${friend.name}`, [balance > 0 ? `${friend.name} paid you ${money(balance, cur)}` : `You paid ${friend.name} ${money(-balance, cur)}`], [{ label: "Open splits", href: `/splits?friend=${friend.id}` }], "wallet") }; } },
  create_deadline: { desc: "Add a deadline (date only — deadlines have no time).", props: { title: ["STRING", "Title", 1], due_date: ["STRING", "YYYY-MM-DD", 1], priority: ["STRING", "low|medium|high"], course: ["STRING", "Course/area"], project: ["STRING", "Project name"] },
    schema: z.object({ title: z.string().trim().min(1).max(300), due_date: date, priority: opt(prio), course: opt(z.string().max(120)), project: opt(z.string().max(120)) }),
    async run(a, { uid }) { const p = await projectId(uid, a.project); if (p.err) return p.err; const d = await deadlinesSvc.create({ title: a.title, due_date: a.due_date, priority: a.priority, course: a.course, project_id: p.id });
      return { ok: true, data: { id: d.id }, card: rec("Deadline added", [d.title, `Due ${fmtDate(d.due_date, { weekday: "short", day: "numeric", month: "short" })}`], [{ label: "View deadlines", href: "/deadlines" }], "flag") }; } },
  list_deadlines: { desc: "List open deadlines.", props: { range: ["STRING", "overdue|today|week|upcoming|all", 1] }, schema: z.object({ range: z.enum(["overdue", "today", "week", "upcoming", "all"]) }),
    async run(a, { uid, today }) { const w = { overdue: "due_date < $2", today: "due_date = $2", week: "due_date BETWEEN $2 AND $3", upcoming: "due_date >= $2", all: "true" }[a.range];
      const rows = await query(`SELECT id, title, due_date, priority FROM deadlines WHERE user_id=$1 AND completed=false AND ${w} AND $2::date IS NOT NULL AND $3::date IS NOT NULL ORDER BY due_date LIMIT 15`, [uid, today, addDays(today, 7)]);
      return { ok: true, data: { count: rows.length, deadlines: rows.map((r) => ({ title: r.title, due: r.due_date })) }, card: list(`Deadlines · ${a.range} · ${rows.length}`, rows.map((r) => ({ text: r.title, sub: relDay(r.due_date, today), href: "/deadlines" }))) }; } },
  create_event: { desc: "Add a calendar event (optionally repeating). Needs a date and a start time (HH:MM, 24h); ask if missing. For a repeating event pass the user's OWN WORDS in `repeat` (e.g. 'every weekday', 'every Monday', 'every 2 weeks', 'the first day of every month') — do not convert them yourself. Put an end in `repeat_until` (YYYY-MM-DD) or `repeat_count` only if the user gave one.", props: { title: ["STRING", "Title", 1], date: ["STRING", "YYYY-MM-DD (first occurrence)", 1], start_time: ["STRING", "HH:MM 24h", 1], duration_minutes: ["INTEGER", "Default 60"], location: ["STRING", "optional"], repeat: ["STRING", "How it repeats, in the user's words; omit for a one-off event"], repeat_until: ["STRING", "YYYY-MM-DD, last day it may occur"], repeat_count: ["INTEGER", "Total number of occurrences"] },
    schema: z.object({ title: z.string().trim().min(1).max(200), date, start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), duration_minutes: opt(z.number().int().min(5).max(1440)), location: opt(z.string().max(200)), repeat: opt(z.string().max(200)), repeat_until: opt(date), repeat_count: opt(z.number().int().min(1).max(1000)) }),
    async run(a, { tz }) {
      const r = a.repeat ? buildRepeat(a, a.date, tz) : { rule: null }; if (r.err) return r.err;
      const s = zonedToIso(`${a.date}T${a.start_time}`, tz); const e = await eventsSvc.create({ title: a.title, starts_at: s, ends_at: new Date(new Date(s).getTime() + (a.duration_minutes || 60) * 60000).toISOString(), location: a.location, recurrence: r.rule ? "custom" : "none", ...(r.rule ? { recurrence_rule: r.rule } : {}) });
      return { ok: true, data: { id: e.id, repeats: r.rule ? describeRule(r.rule, a.date) : null }, card: rec(r.rule ? "Repeating event added" : "Event added", [e.title, `${fmtDate(a.date, { weekday: "short", day: "numeric", month: "short" })} at ${a.start_time}`, r.rule ? describeRule(r.rule, a.date) : null].filter(Boolean), [{ label: "Open calendar", href: "/calendar" }], "calendar") }; } },
  set_event_repeat: { desc: "Make an EXISTING event repeat (or stop repeating). Identify it by words from its title. Pass the user's own words in `repeat` ('every two weeks', 'every Monday', 'never'). This changes the whole series.", props: { event: ["STRING", "Words from the event title", 1], repeat: ["STRING", "How it repeats, in the user's words, or 'never'", 1], repeat_until: ["STRING", "YYYY-MM-DD"], repeat_count: ["INTEGER", "Total occurrences"] },
    schema: z.object({ event: z.string().trim().min(1).max(200), repeat: z.string().trim().min(1).max(200), repeat_until: opt(date), repeat_count: opt(z.number().int().min(1).max(1000)) }),
    async run(a, { uid, tz }) {
      const like = `%${a.event.replace(/[\\%_]/g, "\\$&")}%`; const rows = await query("SELECT id, title, starts_at FROM events WHERE user_id=$1 AND title ILIKE $2 ORDER BY (starts_at >= now()) DESC, starts_at LIMIT 6", [uid, like]);
      if (!rows.length) return { ok: false, message: `I couldn't find an event matching “${a.event}”.` };
      if (rows.length > 1) return clarify(`Several events match: ${rows.map((r) => `“${r.title}” (${fmtDate(dateInTz(r.starts_at, tz), { day: "numeric", month: "short" })})`).join(", ")}. Which one?`);
      const ev = rows[0]; const start = dateInTz(ev.starts_at, tz); const r = buildRepeat(a, start, tz); if (r.err) return r.err;
      await eventsSvc.update(ev.id, r.rule ? { recurrence: "custom", recurrence_rule: r.rule } : { recurrence: "none", recurrence_rule: null });
      return { ok: true, data: { id: ev.id, repeats: r.rule ? describeRule(r.rule, start) : null }, card: rec(r.rule ? "Event now repeats" : "Event no longer repeats", [ev.title, r.rule ? describeRule(r.rule, start) : "One-off event"], [{ label: "Open calendar", href: "/calendar" }], "calendar") }; } },
  list_events: { desc: "List calendar events.", props: { range: ["STRING", "today|tomorrow|week", 1] }, schema: z.object({ range: z.enum(["today", "tomorrow", "week"]) }),
    async run(a, { uid, today, tz }) { const from = a.range === "tomorrow" ? addDays(today, 1) : today, to = a.range === "today" ? addDays(today, 1) : a.range === "tomorrow" ? addDays(today, 2) : addDays(today, 7);
      const ev = await getEventsRange(uid, zonedToIso(from + "T00:00", tz), zonedToIso(to + "T00:00", tz), tz);
      const t = (x) => new Date(x).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
      return { ok: true, data: { count: ev.length, events: ev.slice(0, 15).map((e) => ({ title: e.title, start: e.starts_at })) }, card: list(`Events · ${a.range} · ${ev.length}`, ev.slice(0, 15).map((e) => ({ text: e.title, sub: `${t(e.starts_at)}${e.location ? " · " + e.location : ""}`, href: "/calendar" }))) }; } },
  list_projects: { desc: "List the user's active projects with task counts.", props: {}, schema: z.object({}),
    async run(a, { uid }) { const rows = await query("SELECT p.id, p.name, p.status, (SELECT count(*)::int FROM tasks t WHERE t.project_id=p.id AND NOT t.completed) AS open_tasks FROM projects p WHERE p.user_id=$1 AND p.status NOT IN ('archived') ORDER BY p.updated_at DESC LIMIT 20", [uid]);
      return { ok: true, data: { projects: rows.map((r) => ({ name: r.name, status: r.status, open_tasks: r.open_tasks })) }, card: list(`Projects · ${rows.length}`, rows.map((r) => ({ text: r.name, sub: `${r.status.replace("_", " ")} · ${r.open_tasks} open`, href: "/projects" }))) }; } },
  get_project_overview: { desc: "Tasks, ideas and notes belonging to one project.", props: { project: ["STRING", "Project name", 1] }, schema: z.object({ project: z.string().trim().min(1).max(120) }),
    async run(a, { uid, today }) { const r = await getProject(uid, a.project); if (r.err) return r.err; const id = r.row.id;
      const [tasks, ideas, notes] = await Promise.all([query("SELECT id, title, completed, due_date, priority FROM tasks WHERE user_id=$1 AND project_id=$2 ORDER BY completed, due_date NULLS LAST LIMIT 12", [uid, id]), query("SELECT id, title, status FROM ideas WHERE user_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT 10", [uid, id]), query("SELECT id, title, updated_at FROM notes WHERE user_id=$1 AND project_id=$2 AND NOT archived ORDER BY updated_at DESC LIMIT 5", [uid, id])]);
      return { ok: true, data: { project: r.row.name, tasks: tasks.map((t) => ({ title: t.title, done: t.completed, due: t.due_date })), ideas: ideas.map((i) => ({ title: i.title, status: i.status })), notes: notes.map((n) => ({ title: n.title, updated: n.updated_at })) },
        card: list(`${r.row.name}: ${tasks.filter((t) => !t.completed).length} open tasks · ${ideas.length} ideas · ${notes.length} notes`, [...tasks.slice(0, 5).map((t) => taskLine(t, today)), ...ideas.slice(0, 3).map((i) => ({ text: `💡 ${i.title}`, sub: i.status, href: `/ideas?open=${i.id}` }))]) }; } },
  // ── JARVIS memory (user-visible & editable in Settings → JARVIS memory) ──
  remember: { desc: "Save a short fact the user asked you to remember ('remember that…'). Never store passwords, keys, card numbers or other secrets — the tool rejects them.", props: { content: ["STRING", "The fact, as a short sentence", 1] }, schema: z.object({ content: z.string().trim().min(1).max(600) }),
    async run(a, { uid }) { const m = await addMemory(uid, a.content, "jarvis");
      return { ok: true, data: { id: m.id }, card: rec(m.duplicate ? "Already remembered" : "Remembered", [m.content], [{ label: "View memory", href: "/settings/memory" }], "check") }; } },
  list_memories: { desc: "List what you have been asked to remember.", props: {}, schema: z.object({}),
    async run(a, { uid }) { const rows = await listMemories(uid);
      return { ok: true, data: { count: rows.length, memories: rows.slice(0, 30).map((r) => r.content) }, card: list(`Memory · ${rows.length}`, rows.slice(0, 15).map((r) => ({ text: r.content, href: "/settings/memory" })), rows.length ? undefined : "Nothing remembered yet. Say “remember that …”.") }; } },
  update_memory: { desc: "Change an existing memory. Identify it by a fragment of its text.", props: { memory: ["STRING", "Text of the memory to change", 1], content: ["STRING", "New text", 1] }, schema: z.object({ memory: z.string().trim().min(1).max(300), content: z.string().trim().min(1).max(600) }),
    async run(a, { uid }) { const r = await findMemory(uid, a.memory); if (r.notFound) return { ok: false, message: `No memory matches “${a.memory}”.` }; if (r.ambiguous) return clarify(`Several memories match: ${r.ambiguous.map((x) => `“${x}”`).join(", ")}. Ask which one.`);
      const m = await updateMemory(uid, r.row.id, a.content); return { ok: true, data: { id: m.id }, card: rec("Memory updated", [m.content], [{ label: "View memory", href: "/settings/memory" }], "edit") }; } },
  forget_memory: { desc: "Delete one memory. Identify it by a fragment of its text.", props: { memory: ["STRING", "Text of the memory to forget", 1] }, schema: z.object({ memory: z.string().trim().min(1).max(300) }),
    async run(a, { uid }) { const r = await findMemory(uid, a.memory); if (r.notFound) return { ok: false, message: `No memory matches “${a.memory}”.` }; if (r.ambiguous) return clarify(`Several memories match: ${r.ambiguous.map((x) => `“${x}”`).join(", ")}. Which one should I forget?`);
      await deleteMemory(uid, r.row.id); return { ok: true, data: {}, card: rec("Forgotten", [r.row.content], [], "trash") }; } },
  forget_all_memories: { confirm: true, desc: "Delete ALL memories (asks the user to confirm first).", props: {}, schema: z.object({}),
    async preview(a, { uid }) { const n = (await listMemories(uid)).length; if (!n) return { ok: false, message: "There's nothing in memory." }; return { ok: true, text: `Forget all ${n} memories?`, args: {} }; },
    async run(a, { uid }) { const n = await deleteAllMemories(uid); return { ok: true, data: { deleted: n }, card: rec("Memory cleared", [`${n} memories deleted`], [], "trash") }; } },
  // ── Theme control (registry-validated; no CSS or model-invented themes) ──
  list_themes: { desc: "List the available app themes and which one is active.", props: {}, schema: z.object({}),
    async run(a, { uid }) { const cur = (await one("SELECT theme FROM dashboard_settings WHERE user_id=$1", [uid]))?.theme;
      return { ok: true, data: { current: cur, themes: ALL_THEMES.map((t) => t.name) }, card: list(`Themes · current: ${ALL_THEMES.find((t) => t.id === cur)?.name || cur || "—"}`, ALL_THEMES.map((t) => ({ text: t.name + (t.id === cur ? " ✓" : ""), sub: t.blurb }))) }; } },
  set_theme: { desc: "Switch the app theme by name (e.g. 'Hell', 'Dark', 'Iron Man', 'default'). Only real, built-in themes are accepted.", props: { theme: ["STRING", "Theme name", 1] }, schema: z.object({ theme: z.string().trim().min(1).max(60) }),
    async run(a, { uid }) { const m = matchTheme(a.theme);
      if (m.ambiguous) return clarify(`“${a.theme}” matches several themes: ${m.ambiguous.join(", ")}. Which one?`);
      if (m.notFound) return { ok: false, message: `There's no theme called “${a.theme}”. Ask “what themes are available?” to see them.` };
      await applyTheme(uid, m.id); const t = ALL_THEMES.find((x) => x.id === m.id);
      return { ok: true, data: { theme: m.id }, clientAction: { type: "theme", theme: m.id }, card: rec("Theme changed", [t.name], [], "check") }; } },
  // ── Project bugs (always belong to one of the user's projects) ──
  // ── Budget (the user's monthly budget from Settings; same month-to-date figure the dashboard shows) ──
  get_budget: { desc: "The user's TOTAL MONTHLY BUDGET (set in Settings) and how this month is going against it: spent so far, remaining, percent used, days left, a daily allowance and a month-end projection. Call this for ANY question about the budget, what is left to spend, or being over/under budget. Never guess the budget.", props: {}, schema: z.object({}),
    async run(a, { uid, today }) {
      const s = await one("SELECT monthly_budget FROM dashboard_settings WHERE user_id=$1", [uid]); const budget = Number(s?.monthly_budget) || 0;
      const { month: spent } = await getMoney(uid, today); const cur = currencyStore.getStore() ?? "₹";
      if (!budget) return { ok: true, data: { budget: null, currency: cur, spent_this_month: spent, note: "The user has not set a monthly budget (Settings → Preferences)." }, card: rec("No monthly budget set", [`Spent this month: ${money(spent)}`, "Set one in Settings to track it."], [{ label: "Open Settings", href: "/settings" }], "check") };
      const day = Number(today.slice(8)), dim = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate(), daysLeft = dim - day + 1;
      const remaining = budget - spent, over = remaining < 0, pct = Math.round((spent / budget) * 100), daily = over ? 0 : remaining / daysLeft, projected = (spent / day) * dim;
      return { ok: true, data: { budget, currency: cur, spent_this_month: spent, remaining, percent_used: pct, over_budget: over, days_left_including_today: daysLeft, daily_allowance: Math.round(daily), projected_month_total: Math.round(projected), projected_over_budget: projected > budget },
        card: rec(`${money(spent)} of ${money(budget)} (${pct}%)`, [over ? `Over budget by ${money(-remaining)}` : `${money(remaining)} left · ${daysLeft} day${daysLeft === 1 ? "" : "s"} → about ${money(daily)}/day`, `At this pace: ${money(projected)} by month end${projected > budget ? " — over budget" : ""}`], [{ label: "Open expenses", href: "/expenses" }], "check") }; } },
  create_bug: { desc: "Log a bug in one of the user's projects. A project is REQUIRED — if the user didn't name one, ask which project.", props: { title: ["STRING", "Short bug title", 1], project: ["STRING", "Project name", 1], description: ["STRING", "Details/steps, optional"], priority: ["STRING", "low|medium|high"] }, schema: z.object({ title: z.string().trim().min(1).max(300), project: opt(z.string().max(120)), description: opt(z.string().max(5000)), priority: opt(prio) }),
    async run(a, { uid }) { if (!a.project) return clarify("Which project is this bug for?");
      const p = await projectId(uid, a.project); if (p.err) return p.err;
      const b = await bugsSvc.create({ title: a.title, project_id: p.id, ...(a.description ? { description: a.description } : {}), ...(a.priority ? { priority: a.priority } : {}) });
      return { ok: true, data: { id: b.id }, card: rec("Bug logged", [b.title, `Project: ${p.name}`], [{ label: "Open project", href: "/projects" }], "check") }; } },
  list_bugs: { desc: "List bugs, optionally for one project and/or status. Default shows active (open + in progress) bugs.", props: { project: ["STRING", "Project name"], status: ["STRING", "active|open|in_progress|resolved|wont_fix|all (default active)"], search: ["STRING", "words in the title"], limit: ["INTEGER", "1-25"] }, schema: z.object({ project: opt(z.string().max(120)), status: opt(z.enum(["active", "open", "in_progress", "resolved", "wont_fix", "all"])), search: opt(z.string().max(100)), limit: opt(z.number().int().min(1).max(25)) }),
    async run(a, { uid }) { const p = await projectId(uid, a.project); if (p.err) return p.err;
      const status = a.status || "active"; const w = ["b.user_id=$1"], params = [uid]; const add = (v) => (params.push(v), `$${params.length}`);
      if (p.id) w.push(`b.project_id=${add(p.id)}`);
      if (status === "active") w.push("b.status IN ('open','in_progress')"); else if (status !== "all") w.push(`b.status=${add(status)}`);
      if (a.search) w.push(`b.title ILIKE ${add("%" + a.search.replace(/[\\%_]/g, "\\$&") + "%")}`);
      const total = (await one(`SELECT count(*)::int AS n FROM bugs b WHERE ${w.join(" AND ")}`, params)).n;
      const rows = total ? await query(`SELECT b.title, b.status, b.priority, p.name AS project FROM bugs b JOIN projects p ON p.id=b.project_id WHERE ${w.join(" AND ")} ORDER BY CASE b.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, b.created_at DESC LIMIT ${Math.min(a.limit || 10, 25)}`, params) : [];
      const label = `${status.replace("_", " ")} bugs${p.name ? ` · ${p.name}` : ""}`;
      return { ok: true, data: { filters: label, total, shown: rows.map((r) => ({ title: r.title, status: r.status, priority: r.priority, project: r.project })) },
        card: list(`${label} · ${total}`, rows.map((r) => ({ text: r.title, sub: `${r.project} · ${r.status.replace("_", " ")} · ${r.priority}`, href: "/projects" })), total ? undefined : "No bugs match.") }; } },
  update_bug: { desc: "Change a bug's status, priority or title. Identify it by words from its title (and optionally the project).", props: { bug: ["STRING", "Words from the bug title", 1], project: ["STRING", "Project name, optional"], status: ["STRING", "open|in_progress|resolved|wont_fix"], priority: ["STRING", "low|medium|high"], title: ["STRING", "New title"] }, schema: z.object({ bug: z.string().trim().min(1).max(200), project: opt(z.string().max(120)), status: opt(z.enum(["open", "in_progress", "resolved", "wont_fix"])), priority: opt(prio), title: opt(z.string().trim().min(1).max(300)) }),
    async run(a, { uid }) { const p = await projectId(uid, a.project); if (p.err) return p.err;
      const like = `%${a.bug.replace(/[\\%_]/g, "\\$&")}%`; const rows = await query(`SELECT b.id, b.title, p.name AS project FROM bugs b JOIN projects p ON p.id=b.project_id WHERE b.user_id=$1 AND b.title ILIKE $2 ${p.id ? "AND b.project_id=$3" : ""} ORDER BY b.created_at DESC LIMIT 6`, p.id ? [uid, like, p.id] : [uid, like]);
      if (!rows.length) return { ok: false, message: `No bug matches “${a.bug}”.` };
      if (rows.length > 1) return clarify(`Several bugs match: ${rows.map((r) => `“${r.title}” (${r.project})`).join(", ")}. Which one?`);
      const b = rows[0]; const rest = { priority: a.priority, title: a.title };
      if (a.status) await setBugStatus(b.id, a.status);
      if (Object.values(rest).some((v) => v !== undefined)) await bugsSvc.update(b.id, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
      if (!a.status && Object.values(rest).every((v) => v === undefined)) return { ok: false, message: "Tell me what to change — status, priority or title." };
      return { ok: true, data: { id: b.id }, card: rec("Bug updated", [a.title || b.title, a.status ? `Status: ${a.status.replace("_", " ")}` : null, a.priority ? `Priority: ${a.priority}` : null].filter(Boolean), [{ label: "Open project", href: "/projects" }], "edit") }; } },
  create_project: { desc: "Create a project.", props: { name: ["STRING", "Project name", 1], description: ["STRING", "optional"] }, schema: z.object({ name: z.string().trim().min(1).max(120), description: opt(z.string().max(2000)) }),
    async run(a) { const p = await projectsSvc.create({ name: a.name, description: a.description, status: "planned" }); return { ok: true, data: { id: p.id }, card: rec("Project created", [p.name], [{ label: "Open projects", href: "/projects" }], "folder") }; } },
  create_note: { desc: "Create a note (Markdown body), optionally in a project.", props: { title: ["STRING", "Title", 1], body: ["STRING", "Body text"], project: ["STRING", "Project name"] }, schema: z.object({ title: z.string().trim().min(1).max(300), body: opt(z.string().max(20000)), project: opt(z.string().max(120)) }),
    async run(a, { uid }) { const p = await projectId(uid, a.project); if (p.err) return p.err; const n = await notesSvc.create({ title: a.title, body: a.body || "", project_id: p.id }); return { ok: true, data: { id: n.id }, card: rec("Note created", [n.title, p.name ? `Project: ${p.name}` : null].filter(Boolean), [{ label: "Open notes", href: `/notes?q=${encodeURIComponent(n.title)}` }], "note") }; } },
  create_bookmark: { desc: "Save a bookmark (URL).", props: { url: ["STRING", "URL", 1], title: ["STRING", "optional"] }, schema: z.object({ url: z.string().trim().min(3).max(2000), title: opt(z.string().max(300)) }),
    async run(a) { const u = normalizeUrl(a.url); if (!u) return { ok: false, message: "That doesn't look like a valid web address." }; let title = a.title || ""; if (!title) title = (await fetchMetadata(u.href)).title || u.hostname.replace(/^www\./, "");
      const b = await bookmarksSvc.create({ url: u.href, title, domain: u.hostname.replace(/^www\./, "") }); return { ok: true, data: { id: b.id }, card: rec("Bookmark saved", [b.title, b.domain], [{ label: "Open bookmarks", href: "/bookmarks" }], "bookmark") }; } },
  search_application: { desc: "Search tasks, notes, projects, bookmarks, ideas, deadlines, files.", props: { query: ["STRING", "Search text", 1] }, schema: z.object({ query: z.string().trim().min(2).max(100) }),
    async run(a, { uid }) { const r = await globalSearch(uid, a.query); const flat = Object.entries(r).flatMap(([k, rows]) => rows.slice(0, 4).map((x) => ({ type: k, id: x.id, title: x.title, snippet: x.snippet })));
      const HREF = { tasks: "/tasks", notes: "/notes", projects: "/projects", bookmarks: "/bookmarks", ideas: "/ideas", deadlines: "/deadlines", files: "/files", quicklinks: "/settings#quicklinks", activity: "/activity" };
      return { ok: true, data: { results: flat.slice(0, 20).map((x) => ({ type: x.type, title: x.title, snippet: x.snippet })) }, card: list(`Search “${a.query}” · ${flat.length}`, flat.slice(0, 12).map((x) => ({ text: x.title, sub: x.type, href: `${HREF[x.type]}${["files", "quicklinks", "activity"].includes(x.type) ? "" : "?q=" + encodeURIComponent(x.title)}` }))) }; } },
  start_focus_session: { desc: "Start a focus timer in the app. Optional task title to focus on.", props: { minutes: ["INTEGER", "Minutes (default 25)"], task: ["STRING", "Task title, optional"] }, schema: z.object({ minutes: opt(z.number().int().min(1).max(240)), task: opt(z.string().max(300)) }),
    async run(a, { uid }) { let task = null; if (a.task) { const r = await getTask(uid, a.task); if (r.err) return r.err; task = r.row; } const minutes = a.minutes || (task?.estimate_minutes ? Math.min(Math.max(task.estimate_minutes, 5), 90) : 25);
      return { ok: true, data: { minutes, task: task?.title }, clientAction: { type: "focus", minutes, label: task?.title || "", taskId: task?.id || null }, card: rec("Focus started", [`${minutes} minutes`, task ? `Task: ${task.title}` : "No task attached"], [{ label: "Open focus", href: "/focus" }], "timer") }; } },
  get_focus_summary: { desc: "Focus time totals (today / week / total).", props: {}, schema: z.object({}),
    async run(a, { uid, today, tz }) { const f = await getFocusTotals(uid, today, tz); const h = (s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`; return { ok: true, data: { today_seconds: f.today, week_seconds: f.week, total_seconds: f.total, sessions: f.sessions }, card: rec("Focus time", [`Today: ${h(f.today)}`, `This week: ${h(f.week)}`, `Total: ${h(f.total)} in ${f.sessions} sessions`], [{ label: "Open focus", href: "/focus" }], "timer") }; } },
  get_priorities: { desc: "Deterministic 'what should I work on' answer: top priority task (scored by overdue/due/priority/project) plus today's and overdue counts.", props: {}, schema: z.object({}),
    async run(a, { uid, today }) { const p = await getPriority(uid, today); const c = await one("SELECT count(*) FILTER (WHERE due_date<$2)::int AS overdue, count(*) FILTER (WHERE due_date=$2)::int AS today FROM tasks WHERE user_id=$1 AND NOT completed", [uid, today]);
      return { ok: true, data: { top_priority: p && { title: p.title, due: p.due_date, reasons: p.why }, overdue_tasks: c.overdue, due_today: c.today, note: "Top priority is chosen by a deterministic score, not by the AI." }, card: rec("Priority now", p ? [p.title, ...p.why] : ["Nothing pressing"], p ? [{ label: "View task", href: `/tasks?open=${p.id}` }, { label: "Open Today", href: "/today" }] : [{ label: "Open Today", href: "/today" }], "star") }; } },
};

// Gemini function declarations
export const declarations = () => Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.desc, ...(Object.keys(t.props).length ? { parameters: { type: "OBJECT", properties: Object.fromEntries(Object.entries(t.props).map(([k, [type, description]]) => [k, { type, description }])), required: Object.entries(t.props).filter(([, v]) => v[2]).map(([k]) => k) } } : {}) }));
