import "server-only";
import { z } from "zod";
import { query, one } from "@/lib/db";
import { fail } from "@/lib/crud";
import { expandEvents, effectiveRule } from "@/lib/recurrence";
import { dateInTz, zonedToIso, addDays } from "@/lib/dates";

// "This occurrence only" edits for a recurring series. Keyed by the occurrence's ORIGINAL local date in the series' timezone.
// All statements are scoped to the session user; the DB's composite FK (event_id, user_id) enforces ownership a second time.
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const patch = z.object({ title: z.string().trim().min(1).max(200).optional(), description: z.string().max(3000).optional(), location: z.string().max(200).optional(), all_day: z.boolean().optional(), starts_at: z.string().min(10).optional(), ends_at: z.string().min(10).optional() }).strict();

export async function loadExceptions(uid, eventIds, fromDate, toDate) {
  if (!eventIds.length) return [];
  return query("SELECT event_id, occurrence_date::text AS occurrence_date, kind, data FROM event_exceptions WHERE user_id=$1 AND event_id = ANY($2::uuid[]) AND occurrence_date BETWEEN $3::date AND $4::date", [uid, eventIds, fromDate, toDate]);
}

// The date must be a REAL occurrence of a series owned by this user (prevents junk rows and cross-user writes).
async function assertOccurrence(uid, eventId, rawDate, tz) {
  const date = day.parse(rawDate); const e = await one("SELECT * FROM events WHERE id=$1 AND user_id=$2", [z.string().uuid().parse(eventId), uid]);
  if (!e) throw fail("Event not found");
  const rtz = e.recurrence_rule?.tz || tz;
  if (!effectiveRule(e, dateInTz(e.starts_at, rtz))) throw fail("This event doesn't repeat");
  const hit = expandEvents([e], zonedToIso(`${addDays(date, -1)}T00:00`, rtz), zonedToIso(`${addDays(date, 2)}T00:00`, rtz), rtz).some((o) => o.occurrence_date === date);
  if (!hit) throw fail("That date isn't part of this repeating event");
  return { date, event: e };
}
const upsert = (uid, id, date, kind, data) => one("INSERT INTO event_exceptions(event_id, user_id, occurrence_date, kind, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_id, occurrence_date) DO UPDATE SET kind=EXCLUDED.kind, data=EXCLUDED.data RETURNING id", [id, uid, date, kind, data]);

export async function skipOccurrence(uid, eventId, date, tz) { const a = await assertOccurrence(uid, eventId, date, tz); await upsert(uid, eventId, a.date, "skip", null); return true; }
export async function overrideOccurrence(uid, eventId, date, rawPatch, tz) {
  const a = await assertOccurrence(uid, eventId, date, tz); const p = patch.parse(rawPatch);
  if (!Object.keys(p).length) throw fail("Nothing to change");
  if (p.starts_at && p.ends_at && Date.parse(p.ends_at) < Date.parse(p.starts_at)) throw fail("End time must be after the start time");
  if ((p.starts_at && !p.ends_at) || (!p.starts_at && p.ends_at)) throw fail("Change the start and end time together");
  await upsert(uid, eventId, a.date, "override", JSON.stringify(p)); return true;
}
export async function restoreOccurrence(uid, eventId, date) {
  await query("DELETE FROM event_exceptions WHERE event_id=$1 AND user_id=$2 AND occurrence_date=$3", [z.string().uuid().parse(eventId), uid, day.parse(date)]); return true;
}
