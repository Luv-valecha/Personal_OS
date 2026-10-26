import { dateInTz, addDays } from "@/lib/dates";
export { expandEvents } from "@/lib/recurrence";   // the engine (custom rules, exceptions, DST-safe) lives in lib/recurrence.js
export function eventsOnDay(list, dayStr, tz) { return list.filter((e) => dateInTz(e.starts_at, tz) === dayStr); }
export { addDays };
