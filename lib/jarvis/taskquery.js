// Deterministic task filtering for JARVIS. Pure (no DB, no server-only) so it is unit-testable.
// The MODEL only picks structured filters; this module turns them into parameterised SQL. Nothing here trusts ids from the model.
import { addDays, startOfWeek, startOfMonth } from "@/lib/dates";

export const WHEN = ["today", "tomorrow", "yesterday", "this_week", "next_week", "this_month", "last_month", "overdue"];
export const NOT_FOUND = Symbol("none");

// Relative-date keyword → inclusive [from, to] in the user's calendar days (today is computed in the user's tz by the caller).
// Weeks start on Monday (same as the rest of the app). `overdue` = everything before today.
export function whenRange(when, today) {
  switch (when) {
    case "today": return [today, today];
    case "tomorrow": return [addDays(today, 1), addDays(today, 1)];
    case "yesterday": return [addDays(today, -1), addDays(today, -1)];
    case "this_week": { const s = startOfWeek(today); return [s, addDays(s, 6)]; }
    case "next_week": { const s = addDays(startOfWeek(today), 7); return [s, addDays(s, 6)]; }
    case "this_month": { const s = startOfMonth(today); const nm = startOfMonth(addDays(s, 32)); return [s, addDays(nm, -1)]; }
    case "last_month": { const e = addDays(startOfMonth(today), -1); return [startOfMonth(e), e]; }
    case "overdue": return [null, addDays(today, -1)];
    default: return null;
  }
}

const SORTS = {
  due: "t.due_date NULLS LAST, t.manual_position, t.created_at",
  scheduled: "t.scheduled_date NULLS LAST, t.due_date NULLS LAST, t.manual_position",
  priority: "CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.due_date NULLS LAST, t.manual_position",
  newest: "t.created_at DESC",
  recently_completed: "t.completed_at DESC NULLS LAST",
  manual: "t.manual_position, t.created_at",
};

// args: {status, priority, project_id (ALREADY validated against the user's projects), when, date_field, from, to, completed_when, search, sort, limit}
// returns { where, params, orderBy, limit }. $1 is always the session user id.
export function buildTaskFilter(a, { uid, today, tz }) {
  const params = [uid]; const w = ["t.user_id=$1"]; const p = (v) => { params.push(v); return `$${params.length}`; };
  const status = a.status || "open";
  if (status === "open") w.push("t.completed=false"); else if (status === "completed") w.push("t.completed=true");
  if (a.priority) w.push(`t.priority=${p(a.priority)}`);
  if (a.project_id) w.push(`t.project_id=${p(a.project_id)}`);
  if (a.no_project) w.push("t.project_id IS NULL");
  if (a.search) w.push(`t.title ILIKE ${p("%" + String(a.search).replace(/[\\%_]/g, "\\$&") + "%")}`);

  // Completion window (only meaningful for completed tasks): uses completed_at in the user's timezone.
  const cr = a.completed_when ? whenRange(a.completed_when, today) : null;
  if (cr) { if (status === "open") w.push("false"); const tzp = p(tz);
    if (cr[0]) w.push(`(t.completed_at AT TIME ZONE ${tzp})::date >= ${p(cr[0])}::date`);
    if (cr[1]) w.push(`(t.completed_at AT TIME ZONE ${tzp})::date <= ${p(cr[1])}::date`); }

  // Date window on scheduled/due. default basis "either": scheduled date if set, otherwise the due date.
  let range = a.when ? whenRange(a.when, today) : null;
  if (!range && (a.from || a.to)) range = [a.from || null, a.to || null];
  if (range) {
    const basis = a.when === "overdue" ? "due" : (a.date_field || "either");
    const between = (col) => { const c = []; if (range[0]) c.push(`${col} >= ${p(range[0])}::date`); if (range[1]) c.push(`${col} <= ${p(range[1])}::date`); return c.length ? c.join(" AND ") : "true"; };
    if (basis === "due") w.push(`t.due_date IS NOT NULL AND ${between("t.due_date")}`);
    else if (basis === "scheduled") w.push(`t.scheduled_date IS NOT NULL AND ${between("t.scheduled_date")}`);
    else w.push(`((t.scheduled_date IS NOT NULL AND ${between("t.scheduled_date")}) OR (t.scheduled_date IS NULL AND t.due_date IS NOT NULL AND ${between("t.due_date")}))`);
  }
  const sort = a.sort || (status === "completed" ? "recently_completed" : range && (a.date_field === "scheduled") ? "scheduled" : "due");
  return { where: w.join(" AND "), params, orderBy: SORTS[sort] || SORTS.due, limit: Math.min(Math.max(a.limit || 10, 1), 25) };
}

// ── Rule-based reading of common questions (used before the AI so it is instant, free and never returns the wrong list) ──
const NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
// Returns tool args for list_tasks, or null when the text isn't clearly a task query (then the AI path decides).
export function parseTaskQuestion(text) {
  const raw = text.trim().replace(/[?.!]+$/, ""); const s = raw.toLowerCase();
  if (!/\btasks?\b/.test(s)) return null;
  if (/^(add|create|new|make|remember|delete|remove|complete|finish|mark|schedule|move|rename|edit|update|change)\b/.test(s)) return null;
  if (!/^(show|list|what|which|how many|how much|give|display|tell|do i have|any|my|count|get|find|next)\b/.test(s)) return null;
  const a = {}; let matched = false;
  const set = (k, v) => { a[k] = v; matched = true; };
  if (/\bhow many\b|\bcount\b|\bnumber of\b/.test(s)) set("count_only", true);
  if (/\b(completed?|done|finished)\b/.test(s)) set("status", "completed");
  else if (/\b(incomplete|pending|open|unfinished|remaining|outstanding)\b/.test(s)) set("status", "open");
  const pr = s.match(/\b(high|medium|low)[\s-]*priority\b/) || s.match(/\bpriority\s+(high|medium|low)\b/); if (pr) set("priority", pr[1]);
  const wm = [[/\boverdue\b/, "overdue"], [/\bnext week\b/, "next_week"], [/\bthis week\b/, "this_week"], [/\blast month\b/, "last_month"], [/\bthis month\b/, "this_month"], [/\btomorrow\b/, "tomorrow"], [/\byesterday\b/, "yesterday"], [/\btoday(?:'s|s)?\b/, "today"]].find(([re]) => re.test(s));
  if (wm) {
    if (a.status === "completed" && wm[1] !== "overdue" && !/\b(due|scheduled)\b/.test(s)) set("completed_when", wm[1]); else set("when", wm[1]);
    if (/\bscheduled\b/.test(s)) set("date_field", "scheduled"); else if (/\bdue\b/.test(s)) set("date_field", "due");
    if (wm[1] === "overdue" && !a.status) set("status", "open");
  }
  const nx = s.match(/\bnext\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+tasks?\b/);
  if (nx) { set("limit", NUMS[nx[1]] || +nx[1]); set("sort", "due"); set("status", "open"); }
  // explicit project phrases only — resolved against the user's own projects server-side (ambiguity → question, unknown → error)
  const pm = raw.match(/^.*\b(?:in|for|under|within|of|from|inside)\s+(?:my\s+|the\s+)?(.+?)\s+project\b/i) || raw.match(/\b(?:associated with|belonging to|related to|linked to)\s+(?:my\s+|the\s+)?(.+?)(?:\s+project)?$/i) || raw.match(/\btasks?\s+(?:in|of|for)\s+(?:my\s+|the\s+)?(.+?)$/i);
  if (pm) { const name = pm[1].replace(/\b(today|tomorrow|overdue|this week|next week|this month|completed|incomplete|high priority|scheduled)\b.*$/i, "").trim(); if (name && !/^(my|the|all|today|tomorrow|this|next|me)$/i.test(name) && !/^(?:the )?(?:week|month|day)$/i.test(name)) set("project", name); }
  if (/^(show|list|give|display)\s+(me\s+)?(all\s+)?(my\s+)?tasks$/.test(s) || /^(what are )?my tasks$/.test(s)) matched = true;
  return matched ? a : null;
}
