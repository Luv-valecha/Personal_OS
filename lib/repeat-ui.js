import { isoToLocalInput } from "@/lib/dates";
// Pure helpers behind the calendar's repeat picker (kept out of the component so they can be unit-tested).
// Presets "daily/weekly/monthly" with no end keep the LEGACY single-word value, so existing events and untouched edits stay byte-for-byte compatible.
export const UNIT_FREQ = { days: "daily", weeks: "weekly", months: "monthly", years: "yearly" };
const FREQ_UNIT = { daily: "days", weekly: "weeks", monthly: "months", yearly: "years" };
const WEEKDAYS = [0, 1, 2, 3, 4];

export function repeatFromEvent(e) {
  const r = e?.recurrence_rule, base = { preset: "none", interval: 1, unit: "weeks", weekdays: [], monthMode: "same", monthDay: 1, ends: "never", until: "", count: 10 };
  if (r) {
    const plainWeekday = r.freq === "weekly" && (r.interval || 1) === 1 && !r.until && !r.count && r.byweekday?.length === 5 && WEEKDAYS.every((d) => r.byweekday.includes(d));
    return { ...base, preset: plainWeekday ? "weekday" : "custom", interval: r.interval || 1, unit: FREQ_UNIT[r.freq] || "weeks", weekdays: r.byweekday || [],
      monthMode: r.bymonthday === -1 ? "last" : r.bymonthday ? "day" : "same", monthDay: r.bymonthday > 0 ? r.bymonthday : 1, ends: r.until ? "until" : r.count ? "count" : "never", until: r.until || "", count: r.count || 10 };
  }
  return ["daily", "weekly", "monthly"].includes(e?.recurrence) ? { ...base, preset: e.recurrence } : base;
}

// → { recurrence, recurrence_rule } | { error }
export function repeatToPayload(v) {
  if (v.preset === "none") return { recurrence: "none", recurrence_rule: null };
  const ends = {};
  if (v.ends === "until") { if (!/^\d{4}-\d{2}-\d{2}$/.test(v.until || "")) return { error: "Pick an end date for the repeat" }; ends.until = v.until; }
  else if (v.ends === "count") { const n = Number(v.count); if (!Number.isInteger(n) || n < 1 || n > 1000) return { error: "Occurrences must be a whole number from 1 to 1000" }; ends.count = n; }
  const plain = ["daily", "weekly", "monthly"].includes(v.preset);
  if (plain && v.ends === "never") return { recurrence: v.preset, recurrence_rule: null };                                  // legacy value, unchanged
  let rule;
  if (v.preset === "weekday") rule = { freq: "weekly", interval: 1, byweekday: WEEKDAYS };
  else if (v.preset === "yearly") rule = { freq: "yearly", interval: 1 };
  else if (plain) rule = { freq: v.preset, interval: 1 };
  else {                                                                                                                    // custom
    const interval = Number(v.interval); if (!Number.isInteger(interval) || interval < 1) return { error: "“Every” must be a whole number of 1 or more" };
    rule = { freq: UNIT_FREQ[v.unit] || "weekly", interval };
    if (rule.freq === "weekly" && v.weekdays?.length) rule.byweekday = [...new Set(v.weekdays)].sort((a, b) => a - b);
    if (rule.freq === "monthly" && v.monthMode === "last") rule.bymonthday = -1;
    if (rule.freq === "monthly" && v.monthMode === "day") { const d = Number(v.monthDay); if (!Number.isInteger(d) || d < 1 || d > 31) return { error: "Day of the month must be 1–31" }; rule.bymonthday = d; }
  }
  return { recurrence: "custom", recurrence_rule: { ...rule, ...ends } };
}

// Editing "all events" from one occurrence: keep the SERIES' own start date, apply the form's time of day and length (naive local strings, no DST math).
export function seriesTimesForEdit(e, formStart, formEnd, tz) {
  const startDate = isoToLocalInput(e.series_starts_at || e.starts_at, tz).slice(0, 10);
  const ms = (x) => Date.parse(x.length === 10 ? x + "T00:00:00Z" : x + ":00Z"), len = Math.max(0, ms(formEnd) - ms(formStart));
  const start = `${startDate}T${formStart.slice(11, 16) || "00:00"}`; return { start, end: new Date(ms(start) + len).toISOString().slice(0, 16) };
}
