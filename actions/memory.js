"use server";
import { requireUserId } from "@/lib/auth";
import { safe, logActivity, refresh } from "@/lib/crud";
import { addMemory, updateMemory as upd, deleteMemory as del, deleteAllMemories } from "@/lib/memory";

export async function createMemory(content) { return safe(async () => { const uid = await requireUserId(); const m = await addMemory(uid, content, "user"); refresh(); return m; }); }
export async function updateMemory(id, content) { return safe(async () => { const uid = await requireUserId(); const m = await upd(uid, String(id), content); refresh(); return m; }); }
export async function deleteMemory(id) { return safe(async () => { const uid = await requireUserId(); await del(uid, String(id)); refresh(); return true; }); }
export async function clearMemories() { return safe(async () => { const uid = await requireUserId(); const n = await deleteAllMemories(uid); refresh(); return n; }); }
