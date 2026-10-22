import "server-only";
import { query, one } from "@/lib/db";
import { fail } from "@/lib/crud";
import { validateMemory, memoryPromptBlock, MEMORY_LIMITS } from "@/lib/memory-rules";

// Every function takes the SESSION user's id and scopes every statement by it.
export const listMemories = (uid) => query("SELECT id, content, source, created_at, updated_at FROM jarvis_memories WHERE user_id=$1 ORDER BY updated_at DESC", [uid]);

export async function addMemory(uid, content, source = "jarvis") {
  const v = validateMemory(content); if (!v.ok) throw fail(v.message);
  const dup = await one("SELECT id, content FROM jarvis_memories WHERE user_id=$1 AND lower(content)=lower($2)", [uid, v.content]);
  if (dup) return { ...dup, duplicate: true };
  const n = (await one("SELECT count(*)::int AS n FROM jarvis_memories WHERE user_id=$1", [uid])).n;
  if (n >= MEMORY_LIMITS.perUser) throw fail(`Memory is full (${MEMORY_LIMITS.perUser}). Delete some entries in Settings → JARVIS memory first.`);
  return one("INSERT INTO jarvis_memories(user_id, content, source) VALUES ($1,$2,$3) RETURNING id, content", [uid, v.content, source === "user" ? "user" : "jarvis"]);
}
export async function updateMemory(uid, id, content) {
  const v = validateMemory(content); if (!v.ok) throw fail(v.message);
  const r = await one("UPDATE jarvis_memories SET content=$3, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id, content", [id, uid, v.content]);
  if (!r) throw fail("Memory not found"); return r;
}
export async function deleteMemory(uid, id) { const r = await one("DELETE FROM jarvis_memories WHERE id=$1 AND user_id=$2 RETURNING id", [id, uid]); if (!r) throw fail("Memory not found"); return true; }
export async function deleteAllMemories(uid) { return (await query("DELETE FROM jarvis_memories WHERE user_id=$1 RETURNING id", [uid])).length; }

// Find one memory by id or by a fragment of its text (ambiguity is returned, never guessed).
export async function findMemory(uid, ref) {
  if (/^[0-9a-f-]{36}$/i.test(ref)) { const r = await one("SELECT id, content FROM jarvis_memories WHERE id=$1 AND user_id=$2", [ref, uid]); if (r) return { row: r }; }
  const like = `%${String(ref).replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await query("SELECT id, content FROM jarvis_memories WHERE user_id=$1 AND content ILIKE $2 ORDER BY updated_at DESC LIMIT 6", [uid, like]);
  if (rows.length === 1) return { row: rows[0] };
  if (!rows.length) return { notFound: true };
  return { ambiguous: rows.map((r) => r.content) };
}

export async function memoryForPrompt(uid) { try { return memoryPromptBlock(await listMemories(uid)); } catch { return ""; } }   // memory must never break JARVIS
