"use client";
import { useState } from "react";
import { Trash2, ListPlus } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Field, PrioritySelect, ProjectSelect, tagsToString } from "@/components/ui/Fields";
import { useAction } from "@/components/ui/useAction";
import { updateIdea, deleteIdea, createLinkedTask } from "@/actions/ideas";

export const IDEA_STATUS = ["inbox", "considering", "building", "completed", "rejected"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }));

// One canonical editor for an idea — used by the global Ideas page AND each project's Ideas section, so editing from
// either place updates the same record.
export default function IdeaEditor({ idea: i, projects, onClose }) {
  const { run, pending } = useAction(); const [linking, setLinking] = useState(false);
  const [f, setF] = useState({ title: i.title, description: i.description, priority: i.priority, status: i.status, tags: tagsToString(i.tags), project_id: i.project_id || "" });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save(e) { e.preventDefault(); if (await run(() => updateIdea(i.id, { ...f, project_id: f.project_id || null }), { ok: "Idea saved" })) onClose(true); }
  async function del() { if (confirm(`Delete this idea?${i.tasks?.length ? " Its linked tasks will be kept." : ""}`) && await run(() => deleteIdea(i.id), { ok: "Idea deleted" })) onClose(true); }
  return (<>
    <Modal open onClose={() => onClose(false)} title="Idea" wide><form onSubmit={save} className="flex flex-col gap-3">
      <Field label="Title"><input className="input" value={f.title} onChange={set("title")} required /></Field>
      <Field label="Description"><textarea className="textarea" value={f.description} onChange={set("description")} /></Field>
      <div className="form-grid two"><Field label="Project"><ProjectSelect projects={projects} value={f.project_id} onChange={set("project_id")} /></Field>
        <Field label="Status"><select className="select" value={f.status} onChange={set("status")}>{IDEA_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
        <Field label="Priority"><PrioritySelect value={f.priority} onChange={set("priority")} /></Field>
        <Field label="Tags"><input className="input" value={f.tags} onChange={set("tags")} /></Field></div>
      <div><span className="label">Linked tasks ({i.tasks?.length || 0})</span>
        {i.tasks?.length ? i.tasks.map((t) => <a key={t.id} href={`/tasks?open=${t.id}`} className="list-row"><span className={`grow ${t.completed ? "done" : ""}`}>{t.title}</span><span className="small muted">{t.completed ? "done" : "open"}</span></a>) : <p className="small muted" style={{ margin: "2px 0 6px" }}>No tasks created from this idea yet.</p>}
        <button type="button" className="btn btn-sm" onClick={() => setLinking(true)}><ListPlus size={14} /> Create linked task</button></div>
      <div className="flex justify-between"><button type="button" className="btn btn-danger" onClick={del}><Trash2 size={15} /> Delete</button>
        <div className="flex gap-2"><button type="button" className="btn" onClick={() => onClose(false)}>Close</button><button className="btn btn-primary" disabled={pending}>Save</button></div></div>
    </form></Modal>
    {linking && <LinkedTaskForm idea={i} projects={projects} onClose={(done) => { setLinking(false); if (done) onClose(true); }} />}
  </>);
}

function LinkedTaskForm({ idea, projects, onClose }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ title: idea.title, notes: idea.description || "", priority: "medium", due_date: "", project_id: idea.project_id || "" }); const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit(e) { e.preventDefault(); if (await run(() => createLinkedTask(idea.id, { ...f, due_date: f.due_date || null, project_id: f.project_id || null }), { ok: "Task created — the idea is kept" })) onClose(true); }
  return (<Modal open onClose={() => onClose(false)} title="Create linked task"><form onSubmit={submit} className="flex flex-col gap-3">
    <p className="small muted" style={{ margin: 0 }}>Creates a real task linked to “{idea.title}”. The idea stays as it is.</p>
    <Field label="Task title"><input className="input" value={f.title} onChange={set("title")} required autoFocus /></Field>
    <Field label="Notes"><textarea className="textarea" style={{ minHeight: 64 }} value={f.notes} onChange={set("notes")} /></Field>
    <div className="form-grid two"><Field label="Priority"><PrioritySelect value={f.priority} onChange={set("priority")} /></Field>
      <Field label="Due date (optional)"><input type="date" className="input" value={f.due_date} onChange={set("due_date")} /></Field>
      <Field label="Project" className="sm:col-span-2"><ProjectSelect projects={projects} value={f.project_id} onChange={set("project_id")} /></Field></div>
    <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => onClose(false)}>Cancel</button><button className="btn btn-primary" disabled={pending}>Create task</button></div>
  </form></Modal>);
}
