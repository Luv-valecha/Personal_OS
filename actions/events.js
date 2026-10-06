"use server";
import { crud, safe, fail } from "@/lib/crud";
import { eventSchema } from "@/lib/validation";
const ev = crud("events", eventSchema, { kind: "event" });
function check(i) { if (i?.starts_at && i?.ends_at && new Date(i.ends_at) < new Date(i.starts_at)) throw fail("End time must be after the start time"); }
export async function createEvent(input) { return safe(async () => { check(input); return ev.create(input); }); }
export async function updateEvent(id, input) { return safe(async () => { check(input); return ev.update(id, input); }); }
export async function deleteEvent(id) { return safe(() => ev.remove(id)); }
