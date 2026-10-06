"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import Modal from "@/components/ui/Modal";
import { Field, PrioritySelect, ProjectSelect } from "@/components/ui/Fields";
import { Empty } from "@/components/ui/misc";
import { useAction } from "@/components/ui/useAction";
import { createDeadline, updateDeadline, deleteDeadline, toggleDeadline } from "@/actions/deadlines";
import { relDay, urgency, fmtDate } from "@/lib/dates";

export default function DeadlinesClient({ deadlines, projects, today }) {
  const { run } = useAction(); const [edit, setEdit] = useState(null); const [showDone, setShowDone] = useState(false);
  const open = deadlines.filter((d) => !d.completed); const done = deadlines.filter((d) => d.completed);
  const Row = ({ d }) => (
    <div className="list-row">
      <input type="checkbox" className="check" checked={d.completed} onChange={() => run(() => toggleDeadline(d.id))} aria-label={`Complete ${d.title}`} />
      <span className={`dot ${d.completed ? "" : urgency(d.due_date, today)}`} />
      <div className="grow" style={{ minWidth: 0 }}><div className={`trunc ${d.completed ? "done" : ""}`}>{d.title}</div><div className="small muted">{[d.course || d.project_name, fmtDate(d.due_date, { day: "numeric", month: "short", year: "numeric" })].filter(Boolean).join(" · ")}</div></div>
      {!d.completed && <strong className="small" style={{ color: `var(--c-${urgency(d.due_date, today)})`, whiteSpace: "nowrap" }}>{relDay(d.due_date, today)}</strong>}
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEdit(d)} aria-label="Edit deadline"><Pencil size={14} /></button>
    </div>);
  return (<>
    <PageHead title="Deadlines" sub="Colour shows urgency: red ≤ 1 day, orange ≤ 4, yellow ≤ 10, green after that.">
      <button className="btn btn-primary" onClick={() => setEdit({})}><Plus size={16} /> Add deadline</button></PageHead>
    <div className="card" style={{ padding: 8 }}>
      {open.length === 0 ? <Empty title="No upcoming deadlines" hint="Add one to keep it on your radar." /> : open.map((d) => <Row key={d.id} d={d} />)}
    </div>
    {done.length > 0 && <div className="mt-4"><button className="btn btn-ghost btn-sm" onClick={() => setShowDone((v) => !v)}>{showDone ? "Hide" : "Show"} completed ({done.length})</button>
      {showDone && <div className="card mt-2" style={{ padding: 8 }}>{done.map((d) => <Row key={d.id} d={d} />)}</div>}</div>}
    {edit && <DeadlineEditor d={edit} projects={projects} today={today} onClose={() => setEdit(null)} />}
  </>);
}
function DeadlineEditor({ d, projects, today, onClose }) {
  const { run, pending } = useAction(); const isNew = !d.id;
  const [f, setF] = useState({ title: d.title || "", due_date: d.due_date || today, priority: d.priority || "medium", course: d.course || "", project_id: d.project_id || "" }); const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save(e) { e.preventDefault(); const p = { ...f, project_id: f.project_id || null }; const r = await run(() => (isNew ? createDeadline(p) : updateDeadline(d.id, p)), { ok: isNew ? "Deadline added" : "Deadline updated" }); if (r) onClose(); }
  async function del() { if (confirm("Delete this deadline?") && await run(() => deleteDeadline(d.id), { ok: "Deleted" })) onClose(); }
  return (<Modal open onClose={onClose} title={isNew ? "New deadline" : "Edit deadline"}>
    <form onSubmit={save} className="flex flex-col gap-3">
      <Field label="Title"><input className="input" value={f.title} onChange={set("title")} required autoFocus /></Field>
      <div className="form-grid two"><Field label="Due date"><input type="date" className="input" value={f.due_date} onChange={set("due_date")} required /></Field>
        <Field label="Priority"><PrioritySelect value={f.priority} onChange={set("priority")} /></Field>
        <Field label="Course / area"><input className="input" value={f.course} onChange={set("course")} placeholder="DBMS" /></Field>
        <Field label="Project"><ProjectSelect projects={projects} value={f.project_id} onChange={set("project_id")} /></Field></div>
      <div className="flex justify-between">{!isNew ? <button type="button" className="btn btn-danger" onClick={del}><Trash2 size={15} /> Delete</button> : <span />}<div className="flex gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending}>Save</button></div></div>
    </form></Modal>);
}
