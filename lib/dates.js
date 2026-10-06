// Pure date helpers (safe on server and client). Dates are 'YYYY-MM-DD' strings in the user's timezone.
export const DEFAULT_TZ = "Asia/Kolkata";
export function todayStr(tz = DEFAULT_TZ) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}
export function addDays(str, n) {
  const d = new Date(str + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function diffDays(a, b) { // a - b in days
  return Math.round((new Date(a + "T00:00:00Z") - new Date(b + "T00:00:00Z")) / 86400000);
}
export function startOfWeek(str) { // Monday
  const d = new Date(str + "T00:00:00Z"); const dow = (d.getUTCDay() + 6) % 7; return addDays(str, -dow);
}
export function startOfMonth(str) { return str.slice(0, 7) + "-01"; }
export function relDay(due, today) {
  const n = diffDays(due, today);
  if (n === 0) return "Today"; if (n === 1) return "Tomorrow"; if (n === -1) return "Yesterday";
  if (n < 0) return `${-n}d overdue`; if (n < 14) return `${n} days`;
  return new Date(due + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}
export function urgency(due, today) { // colour band for deadlines
  const n = diffDays(due, today);
  if (n <= 1) return "red"; if (n <= 4) return "orange"; if (n <= 10) return "yellow"; return "green";
}
export function fmtDate(str, opts = { day: "numeric", month: "short" }) {
  if (!str) return ""; return new Date(String(str).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
}
export function fmtTime(d, tz) {
  return new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
}
export function fmtDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`; return `${m}m`;
}
export function dateInTz(ts, tz) { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(ts)); }
// Convert a local wall-clock 'YYYY-MM-DDTHH:mm' in tz to an ISO instant.
export function zonedToIso(local, tz) {
  const guess = new Date(local + ":00Z");
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(guess);
  const g = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour, +g.minute, +g.second);
  return new Date(guess.getTime() - (asUtc - guess.getTime())).toISOString();
}
export function isoToLocalInput(ts, tz) {
  const d = new Date(ts); const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const g = Object.fromEntries(parts.map((p) => [p.type, p.value])); return `${g.year}-${g.month}-${g.day}T${g.hour}:${g.minute}`;
}
