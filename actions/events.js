"use server";
import { safe, fail } from "@/lib/crud";
import { eventsSvc as ev } from "@/lib/services";
import { requireUserId } from "@/lib/auth";
import { getTz } from "@/lib/server-utils";
import { normalizeRecurrence } from "@/lib/recurrence-input";
import { skipOccurrence, overrideOccurrence, restoreOccurrence } from "@/lib/event-exceptions";
function check(i) { if (i?.starts_at && i?.ends_at && new Date(i.ends_at) < new Date(i.starts_at)) throw fail("End time must be after the start time"); }
async function prepared(input) { check(input); const r = normalizeRecurrence(input, await getTz()); if (r.error) throw fail(r.error); return r.value; }
export async function createEvent(input) { return safe(async () => ev.create(await prepared(input))); }
export async function updateEvent(id, input) { return safe(async () => ev.update(id, await prepared(input))); }   // edits the WHOLE series (every occurrence)
export async function deleteEvent(id) { return safe(() => ev.remove(id)); }                                       // deletes the whole series and its exceptions
// ── one occurrence of a repeating event ──
export async function deleteEventOccurrence(id, date) { return safe(async () => skipOccurrence(await requireUserId(), id, date, await getTz())); }
export async function updateEventOccurrence(id, date, patch) { return safe(async () => overrideOccurrence(await requireUserId(), id, date, patch, await getTz())); }
export async function restoreEventOccurrence(id, date) { return safe(async () => restoreOccurrence(await requireUserId(), id, date)); }
