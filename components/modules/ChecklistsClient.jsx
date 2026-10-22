"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown, X } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import { Empty, Progress } from "@/components/ui/misc";
import { ProjectSelect } from "@/components/ui/Fields";
import { useAction } from "@/components/ui/useAction";
import { createChecklist, renameChecklist, deleteChecklist, addChecklistItem, updateChecklistItem, deleteChecklistItem, moveChecklistItem } from "@/actions/checklists";

export default function ChecklistsClient({ initial, projects }) {
  const { run, pending } = useAction();
  const [lists, setLists] = useState(initial);
  useEffect(() => setLists(initial), [initial]);          // re-sync after the server revalidates
  const [title, setTitle] = useState(""); const [project, setProject] = useState("");

  async function create(e) {
    e.preventDefault(); if (pending || !title.trim()) return;
    const r = await run(() => createChecklist({ title, project_id: project || null }), { ok: "Checklist created" });
    if (r && r !== true) { setLists((l) => [{ id: r.id, title: r.title, project_id: project || null, project_name: projects.find((p) => p.id === project)?.name, items: [] }, ...l]); setTitle(""); }
  }
  const patch = (id, fn) => setLists((l) => l.map((c) => (c.id === id ? fn(c) : c)));
  return (<>
    <PageHead title="Checklists" sub="Lightweight lists — tap to tick things off." />
    <form onSubmit={create} className="card flex gap-2" style={{ flexWrap: "wrap" }} aria-label="New checklist">
      <input className="input" style={{ flex: "1 1 200px" }} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="New checklist, e.g. Packing" aria-label="Checklist title" />
      {projects.length > 0 && <ProjectSelect projects={projects} value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project (optional)" />}
      <button className="btn btn-primary" disabled={pending || !title.trim()}><Plus size={15} /> Create</button>
    </form>
    {!lists.length ? <Empty title="No checklists yet" hint="Create one above — packing, shopping, deploy checks…" /> :
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", marginTop: 12 }}>
        {lists.map((c) => <Checklist key={c.id} c={c} run={run} pending={pending} patch={patch} remove={() => setLists((l) => l.filter((x) => x.id !== c.id))} />)}
      </div>}
  </>);
}

function Checklist({ c, run, pending, patch, remove }) {
  const [renaming, setRenaming] = useState(false); const [name, setName] = useState(c.title); const [text, setText] = useState("");
  const [editId, setEditId] = useState(null); const [draft, setDraft] = useState("");
  const done = c.items.filter((i) => i.done).length, pct = c.items.length ? Math.round((done / c.items.length) * 100) : 0;

  async function rename(e) { e.preventDefault(); if (pending || !name.trim()) return; if (await run(() => renameChecklist(c.id, name), { ok: "Renamed" })) { patch(c.id, (x) => ({ ...x, title: name.trim() })); setRenaming(false); } }
  async function del() { if (!confirm(`Delete “${c.title}” and its ${c.items.length} item${c.items.length === 1 ? "" : "s"}?`)) return; if (await run(() => deleteChecklist(c.id), { ok: "Checklist deleted" })) remove(); }
  async function add(e) {
    e.preventDefault(); if (pending || !text.trim()) return;
    const r = await run(() => addChecklistItem(c.id, text)); if (r && r !== true) { patch(c.id, (x) => ({ ...x, items: [...x.items, { id: r.id, text: r.text, done: false }] })); setText(""); }
  }
  // Optimistic tick with rollback if the server rejects it.
  async function toggle(i) {
    patch(c.id, (x) => ({ ...x, items: x.items.map((it) => (it.id === i.id ? { ...it, done: !i.done } : it)) }));
    const ok = await run(() => updateChecklistItem(i.id, { done: !i.done }));
    if (!ok) patch(c.id, (x) => ({ ...x, items: x.items.map((it) => (it.id === i.id ? { ...it, done: i.done } : it)) }));
  }
  async function saveText(i) { if (pending || !draft.trim()) return; if (await run(() => updateChecklistItem(i.id, { text: draft }))) { patch(c.id, (x) => ({ ...x, items: x.items.map((it) => (it.id === i.id ? { ...it, text: draft.trim() } : it)) })); setEditId(null); } }
  async function delItem(i) { if (await run(() => deleteChecklistItem(i.id))) patch(c.id, (x) => ({ ...x, items: x.items.filter((it) => it.id !== i.id) })); }
  async function move(i, dir) {
    const idx = c.items.findIndex((it) => it.id === i.id), j = dir === "up" ? idx - 1 : idx + 1; if (j < 0 || j >= c.items.length) return;
    const before = c.items; const next = [...before]; [next[idx], next[j]] = [next[j], next[idx]]; patch(c.id, (x) => ({ ...x, items: next }));
    if (!(await run(() => moveChecklistItem(i.id, dir)))) patch(c.id, (x) => ({ ...x, items: before }));
  }

  return (
    <section className="card" aria-label={c.title}>
      <div className="flex justify-between gap-2" style={{ alignItems: "center" }}>
        {renaming ? (
          <form onSubmit={rename} className="flex gap-1" style={{ flex: 1 }}><input className="input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} aria-label="Checklist name" autoFocus /><button className="btn btn-sm btn-primary" disabled={pending}>Save</button><button type="button" className="btn btn-sm" onClick={() => { setRenaming(false); setName(c.title); }}>Cancel</button></form>
        ) : (<>
          <h3 style={{ margin: 0, overflowWrap: "anywhere" }}>{c.title}</h3>
          <span className="flex gap-1"><button className="btn btn-ghost btn-icon btn-sm" onClick={() => setRenaming(true)} aria-label={`Rename ${c.title}`}><Pencil size={14} /></button>
            <button className="btn btn-ghost btn-icon btn-sm" disabled={pending} onClick={del} aria-label={`Delete ${c.title}`}><Trash2 size={14} /></button></span></>)}
      </div>
      {c.project_name && <div className="small muted">Project: {c.project_name}</div>}
      <div className="small muted" style={{ margin: "8px 0 4px" }}>{done}/{c.items.length} done · {pct}%</div>
      <Progress value={pct} label={`${c.title} progress`} />
      {!c.items.length && <p className="small muted" style={{ margin: "10px 0 0" }}>Empty — add your first item below.</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 4 }}>
        {c.items.map((i, idx) => (
          <li key={i.id} className="flex gap-1" style={{ alignItems: "center" }}>
            <input type="checkbox" className="check" checked={i.done} onChange={() => toggle(i)} aria-label={i.text} />
            {editId === i.id ? (
              <form onSubmit={(e) => { e.preventDefault(); saveText(i); }} className="flex gap-1" style={{ flex: 1 }}><input className="input" value={draft} maxLength={300} onChange={(e) => setDraft(e.target.value)} aria-label="Edit item" autoFocus onKeyDown={(e) => e.key === "Escape" && setEditId(null)} /><button className="btn btn-sm btn-primary" disabled={pending}>Save</button></form>
            ) : (<>
              <span style={{ flex: 1, overflowWrap: "anywhere", textDecoration: i.done ? "line-through" : "none", opacity: i.done ? 0.55 : 1, cursor: "text" }} onClick={() => { setEditId(i.id); setDraft(i.text); }} title="Click to edit">{i.text}</span>
              <button className="btn btn-ghost btn-icon btn-sm" disabled={idx === 0} onClick={() => move(i, "up")} aria-label={`Move up: ${i.text}`}><ArrowUp size={13} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" disabled={idx === c.items.length - 1} onClick={() => move(i, "down")} aria-label={`Move down: ${i.text}`}><ArrowDown size={13} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => delItem(i)} aria-label={`Delete item: ${i.text}`}><X size={14} /></button></>)}
          </li>))}
      </ul>
      <form onSubmit={add} className="flex gap-1" style={{ marginTop: 10 }}><input className="input" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Add an item" aria-label={`Add item to ${c.title}`} /><button className="btn" disabled={pending || !text.trim()}>Add</button></form>
    </section>
  );
}
