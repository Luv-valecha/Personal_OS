import { dateInTz, addDays } from "@/lib/dates";
// Expand recurring events into concrete occurrences within [from, to] (ISO strings). Pure; works anywhere.
export function expandEvents(events, fromIso, toIso, tz) {
  const from = new Date(fromIso).getTime(), to = new Date(toIso).getTime(); const out = [];
  for (const e of events) {
    const s = new Date(e.starts_at), len = new Date(e.ends_at) - s;
    if (e.recurrence === "none") { if (s.getTime() <= to && s.getTime() + len >= from) out.push({ ...e, occurrence: s.toISOString() }); continue; }
    let cur = new Date(s), guard = 0;
    while (cur.getTime() <= to && guard++ < 800) {
      if (cur.getTime() + len >= from) out.push({ ...e, starts_at: cur.toISOString(), ends_at: new Date(cur.getTime() + len).toISOString(), occurrence: cur.toISOString() });
      if (e.recurrence === "daily") cur = new Date(cur.getTime() + 86400000);
      else if (e.recurrence === "weekly") cur = new Date(cur.getTime() + 7 * 86400000);
      else { cur = new Date(cur); cur.setUTCMonth(cur.getUTCMonth() + 1); }
    }
  }
  return out.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}
export function eventsOnDay(list, dayStr, tz) { return list.filter((e) => dateInTz(e.starts_at, tz) === dayStr); }
export { addDays };
