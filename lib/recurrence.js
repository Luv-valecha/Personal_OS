// Recurring-event engine. PURE (no DB / Next). A series is ONE row with a structured rule; occurrences are generated on demand for a window.
//
// Rule: { freq:"daily|weekly|monthly|yearly", interval:1..365, byweekday?:[0..6 Mon=0] (weekly), bymonthday?:1..31|-1 (monthly), until?:"YYYY-MM-DD" | count?:1..1000, tz? }
// Semantics (documented in README):
//  • Occurrences keep the series' LOCAL wall-clock time in its timezone (a 09:00 event stays 09:00 across daylight-saving changes).
//  • Monthly on day 29–31 SKIPS months that don't have that day (use bymonthday:-1 for "last day of the month"). Yearly Feb 29 only occurs in leap years.
//  • `until` is inclusive. `count` counts occurrences from the series start. Both can't be set together.
//  • Expansion is bounded: ≤ MAX_WINDOW_DAYS per call and ≤ MAX_OCCURRENCES_PER_CALL per series, and generators have an iteration guard — an
//    unbounded series can never run away.
import { addDays, diffDays, startOfWeek, dateInTz, zonedToIso, isoToLocalInput } from "@/lib/dates";

export const MAX_WINDOW_DAYS = 400, MAX_OCCURRENCES_PER_CALL = 400, GUARD = 5000;
const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();                 // days in month (m = 1..12)
export const weekdayOf = (date) => (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;   // Mon=0 … Sun=6

// A legacy `recurrence` word becomes an equivalent rule, anchored at the series' start date.
export function effectiveRule(e, startDate) {
  if (e.recurrence_rule && typeof e.recurrence_rule === "object") return e.recurrence_rule;
  switch (e.recurrence) {
    case "daily": return { freq: "daily", interval: 1 };
    case "weekly": return { freq: "weekly", interval: 1, byweekday: [weekdayOf(startDate)] };
    case "monthly": return { freq: "monthly", interval: 1, bymonthday: Number(startDate.slice(8)) };
    default: return null;
  }
}

// Ascending local dates >= start, jumping ahead arithmetically to ~`from` (so old series don't need to be walked).
function* dates(rule, start, from) {
  const n = rule.interval || 1; let guard = 0;
  if (rule.freq === "daily") {
    for (let k = from > start ? Math.ceil(diffDays(from, start) / n) : 0; guard++ < GUARD; k++) yield addDays(start, k * n);
  } else if (rule.freq === "weekly") {
    const days = [...new Set(rule.byweekday?.length ? rule.byweekday : [weekdayOf(start)])].sort((a, b) => a - b), anchor = startOfWeek(start);
    for (let w = from > start ? Math.max(0, Math.floor(diffDays(startOfWeek(from), anchor) / 7 / n)) * n : 0; guard++ < GUARD; w += n)
      for (const d of days) { const date = addDays(anchor, w * 7 + d); if (date >= start) yield date; }
  } else if (rule.freq === "monthly") {
    const sy = +start.slice(0, 4), sm = +start.slice(5, 7), day = rule.bymonthday ?? +start.slice(8);
    const fm = from > start ? (+from.slice(0, 4) * 12 + +from.slice(5, 7) - 1) - (sy * 12 + sm - 1) : 0;
    for (let k = Math.max(0, Math.floor(fm / n)) * n; guard++ < GUARD; k += n) {
      const t = sy * 12 + (sm - 1) + k, y = Math.floor(t / 12), m = (t % 12) + 1, last = dim(y, m), d = day === -1 ? last : day;
      if (d > last) continue; const date = ymd(y, m, d); if (date >= start) yield date;
    }
  } else if (rule.freq === "yearly") {
    const sy = +start.slice(0, 4), sm = +start.slice(5, 7), sd = +start.slice(8);
    for (let k = from > start ? Math.max(0, Math.floor((+from.slice(0, 4) - sy) / n)) * n : 0; guard++ < GUARD; k += n) { const y = sy + k; if (sd <= dim(y, sm)) yield ymd(y, sm, sd); }
  }
}

const OVERRIDABLE = ["title", "description", "location", "all_day", "starts_at", "ends_at"];
// events: rows (with optional recurrence_rule); exceptions: [{event_id, occurrence_date:'YYYY-MM-DD', kind:'skip'|'override', data}]
export function expandEvents(events, fromIso, toIso, tz, exceptions = []) {
  const from = Date.parse(fromIso), to0 = Date.parse(toIso); if (!(from <= to0)) return [];
  const to = Math.min(to0, from + MAX_WINDOW_DAYS * 86400000), out = [];
  const ex = new Map(exceptions.map((x) => [`${x.event_id}|${String(x.occurrence_date).slice(0, 10)}`, x]));
  for (const e of events) {
    const sMs = Date.parse(e.starts_at), eMs = Date.parse(e.ends_at); if (Number.isNaN(sMs) || Number.isNaN(eMs)) continue;
    const rtz = e.recurrence_rule?.tz || tz, startDate = dateInTz(e.starts_at, rtz), rule = effectiveRule(e, startDate);
    if (!rule) { if (sMs <= to && eMs >= from) out.push({ ...e, occurrence: new Date(sMs).toISOString() }); continue; }   // one-off event
    const sLocal = isoToLocalInput(e.starts_at, rtz), eLocal = isoToLocalInput(e.ends_at, rtz), startTime = sLocal.slice(11), endTime = eLocal.slice(11), dayLen = Math.max(0, diffDays(eLocal.slice(0, 10), startDate));
    const fromDate = addDays(dateInTz(new Date(from).toISOString(), rtz), -dayLen - 1), toDate = addDays(dateInTz(new Date(to).toISOString(), rtz), 1);
    let idx = 0, made = 0;
    for (const date of dates(rule, startDate, rule.count ? startDate : fromDate)) {       // `count` must be counted from the real start
      if (date > toDate || (rule.until && date > rule.until)) break;
      if (rule.count && idx++ >= rule.count) break;
      if (date < fromDate) continue;
      const x = ex.get(`${e.id}|${date}`); if (x?.kind === "skip") continue;
      const st = zonedToIso(`${date}T${startTime}`, rtz), en = zonedToIso(`${addDays(date, dayLen)}T${endTime}`, rtz);
      const item = { ...e, starts_at: st, ends_at: en, occurrence: st, occurrence_date: date, recurring: true, series_starts_at: e.starts_at, series_ends_at: e.ends_at };   // series_* = the master row's own times (used when editing "all events")
      if (x?.kind === "override" && x.data) { for (const k of OVERRIDABLE) if (x.data[k] !== undefined) item[k] = x.data[k]; item.is_exception = true; }
      if (Date.parse(item.starts_at) <= to && Date.parse(item.ends_at) >= from) { out.push(item); if (++made >= MAX_OCCURRENCES_PER_CALL) break; }
    }
  }
  return out.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function describeRule(rule, startDate) {
  if (!rule) return "Does not repeat";
  const n = rule.interval || 1, every = (u, p) => (n === 1 ? `Every ${u}` : `Every ${n} ${p}`); let s;
  if (rule.freq === "daily") s = every("day", "days");
  else if (rule.freq === "weekly") { const d = rule.byweekday?.length ? rule.byweekday : startDate ? [weekdayOf(startDate)] : []; s = (d.length === 5 && [0, 1, 2, 3, 4].every((x) => d.includes(x)) && n === 1) ? "Every weekday" : `${every("week", "weeks")}${d.length ? " on " + [...d].sort((a, b) => a - b).map((x) => DAY[x]).join(", ") : ""}`; }
  else if (rule.freq === "monthly") s = `${every("month", "months")}${rule.bymonthday === -1 ? " on the last day" : rule.bymonthday ? ` on day ${rule.bymonthday}` : ""}`;
  else s = every("year", "years");
  if (rule.until) s += ` until ${rule.until}`; else if (rule.count) s += ` · ${rule.count} times`;
  return s;
}
