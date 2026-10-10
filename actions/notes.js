"use server";
import { query } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { safe, refresh } from "@/lib/crud";
import { notesSvc as notes } from "@/lib/services";
export async function createNote(input) { return safe(() => notes.create({ title: "", body: "", ...input })); }
export async function updateNote(id, input) { return safe(() => notes.update(id, input)); }
export async function deleteNote(id) { return safe(() => notes.remove(id)); }
async function flip(id, col) { const uid = await requireUserId(); await query(`UPDATE notes SET ${col} = NOT ${col}, updated_at=now() WHERE id=$1 AND user_id=$2`, [id, uid]); refresh(); return true; }
export async function togglePinNote(id) { return safe(() => flip(id, "pinned")); }
export async function toggleArchiveNote(id) { return safe(() => flip(id, "archived")); }
