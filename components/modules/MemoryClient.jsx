"use client";
import { useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { createMemory, updateMemory, deleteMemory, clearMemories } from "@/actions/memory";

export default function MemoryClient({ initial, limit, max }) {
  const { run, pending } = useAction();
  const [items, setItems] = useState(initial);
  const [text, setText] = useState(""); const [editId, setEditId] = useState(null); const [draft, setDraft] = useState("");

  async function add(e) {
    e.preventDefault(); if (pending || !text.trim()) return;
    const m = await run(() => createMemory(text), { ok: "Remembered" });
    if (m && m !== true) { setItems((x) => x.some((i) => i.id === m.id) ? x : [{ id: m.id, content: m.content, source: "user", updated_at: new Date().toISOString() }, ...x]); setText(""); }
  }
  async function save(id) {
    if (pending || !draft.trim()) return;
    const m = await run(() => updateMemory(id, draft), { ok: "Memory updated" });
    if (m && m !== true) { setItems((x) => x.map((i) => i.id === id ? { ...i, content: m.content, updated_at: new Date().toISOString() } : i)); setEditId(null); }
  }
  async function remove(i) {
    if (!confirm(`Forget this?\n\n“${i.content}”`)) return;
    if (await run(() => deleteMemory(i.id), { ok: "Forgotten" })) setItems((x) => x.filter((m) => m.id !== i.id));
  }
  async function clearAll() {
    if (!items.length || !confirm(`Delete all ${items.length} memories? This cannot be undone.`)) return;
    if (await run(() => clearMemories(), { ok: "Memory cleared" })) setItems([]);
  }

  return (
    <div className="stack">
      <section className="card">
        <form onSubmit={add} className="flex gap-1" aria-label="Add a memory">
          <input className="input" style={{ flex: 1 }} value={text} maxLength={max} onChange={(e) => setText(e.target.value)} placeholder="e.g. I prefer studying in the morning" aria-label="New memory" />
          <button className="btn btn-primary" disabled={pending || !text.trim() || items.length >= limit}>Add</button>
        </form>
        <p className="small muted" style={{ margin: "8px 0 0" }}>{items.length}/{limit} memories. Don’t store passwords, keys or card numbers — they’re rejected, because memory is sent to the AI provider with your JARVIS requests.</p>
      </section>
      <section className="card">
        <div className="card-title">Remembered ({items.length})</div>
        {!items.length && <p className="muted small">Nothing yet. Tell JARVIS “remember that my exam is on 15 December”.</p>}
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {items.map((i) => (
            <li key={i.id} className="flex gap-1" style={{ alignItems: "flex-start" }}>
              {editId === i.id ? (<>
                <textarea className="input" style={{ flex: 1 }} rows={2} maxLength={max} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit memory" autoFocus />
                <button className="btn btn-sm btn-primary" disabled={pending || !draft.trim()} onClick={() => save(i.id)}>Save</button>
                <button className="btn btn-sm" onClick={() => setEditId(null)}>Cancel</button>
              </>) : (<>
                <span style={{ flex: 1, overflowWrap: "anywhere" }}>{i.content}{i.source === "user" && <span className="small muted"> · added by you</span>}</span>
                <button className="btn btn-sm" onClick={() => { setEditId(i.id); setDraft(i.content); }} aria-label={`Edit memory: ${i.content}`}>Edit</button>
                <button className="btn btn-sm" disabled={pending} onClick={() => remove(i)} aria-label={`Delete memory: ${i.content}`}>Delete</button>
              </>)}
            </li>))}
        </ul>
        {items.length > 0 && <div style={{ marginTop: 12 }}><button className="btn btn-sm" disabled={pending} onClick={clearAll}>Forget everything</button></div>}
      </section>
    </div>
  );
}
