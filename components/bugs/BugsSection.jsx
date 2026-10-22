"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Field, PrioritySelect } from "@/components/ui/Fields";
import { useAction } from "@/components/ui/useAction";
import { createBug, updateBug, changeBugStatus, deleteBug } from "@/actions/bugs";

export const BUG_STATUS = { open: "Open", in_progress: "In progress", resolved: "Resolved", wont_fix: "Won’t fix" };
const FILTERS = [["active", "Active"], ["all", "All"], ...Object.entries(BUG_STATUS)];
const isClosed = (s) => s === "resolved" || s === "wont_fix";

export default function BugsSection({ p }) {
  const { run, pending } = useAction();
  const [title, setTitle] = useState(""); const [filter, setFilter] = useState("active"); const [q, setQ] = useState(""); const [open, setOpen] = useState(null);
  const bugs = p.bugs || [];
  const shown = bugs.filter((b) => (filter === "all" ? true : filter === "active" ? !isClosed(b.status) : b.status === filter) && (!q || (b.title + " " + (b.description || "")).toLowerCase().includes(q.toLowerCase())));
  const openCount = bugs.filter((b) => !isClosed(b.status)).length;

  async function add() { if (pending || !title.trim()) return; if (await run(() => createBug({ title, project_id: p.id }), { ok: "Bug added" })) setTitle(""); }
  return (
    <div>
      <div className="flex justify-between gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <span className="label">Bugs ({openCount} open{bugs.length > openCount ? ` · ${bugs.length} total` : ""})</span>
        <span className="flex gap-1">
          <input className="input" style={{ width: 120, padding: "2px 8px", fontSize: 12 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search bugs" />
          <select className="select" style={{ padding: "2px 6px", fontSize: 12 }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter bugs by status">{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </span>
      </div>
      {!shown.length && <p className="small muted" style={{ margin: "6px 0" }}>{bugs.length ? "No bugs match this filter." : "No bugs logged for this project."}</p>}
      {shown.map((b) => (
        <div key={b.id} className="list-row">
          <button type="button" className="grow trunc text-left" style={{ background: "none", border: 0, color: "inherit", font: "inherit", cursor: "pointer", textDecoration: isClosed(b.status) ? "line-through" : "none", opacity: isClosed(b.status) ? 0.6 : 1 }} onClick={() => setOpen(b)}>{b.title}</button>
          {b.priority === "high" && !isClosed(b.status) && <span className="chip">high</span>}
          <select className="select" style={{ padding: "2px 6px", fontSize: 12, maxWidth: 118 }} value={b.status} disabled={pending} onChange={(e) => run(() => changeBugStatus(b.id, e.target.value))} aria-label={`Status of ${b.title}`}>{Object.entries(BUG_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>))}
      <div className="flex gap-2 mt-2">
        <input className="input" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Log a bug in this project" aria-label="New project bug" />
        <button type="button" className="btn" disabled={pending || !title.trim()} onClick={add}><Plus size={14} /> Add</button>
      </div>
      {open && <BugEditor key={open.id} bug={bugs.find((x) => x.id === open.id) || open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function BugEditor({ bug, onClose }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ title: bug.title, description: bug.description || "", status: bug.status, priority: bug.priority, due_date: bug.due_date ? String(bug.due_date).slice(0, 10) : "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e) { e.preventDefault(); if (pending || !f.title.trim()) return; if (await run(() => updateBug(bug.id, { ...f, due_date: f.due_date || null }), { ok: "Bug updated" })) onClose(); }
  async function del() { if (confirm(`Delete bug “${bug.title}”?`) && await run(() => deleteBug(bug.id), { ok: "Bug deleted" })) onClose(); }
  return (
    <Modal open onClose={onClose} title="Bug details">
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Title"><input className="input" value={f.title} maxLength={300} onChange={set("title")} required autoFocus /></Field>
        <Field label="Description"><textarea className="textarea" style={{ minHeight: 100 }} value={f.description} onChange={set("description")} placeholder="Steps to reproduce, expected vs actual…" /></Field>
        <div className="form-grid two">
          <Field label="Status"><select className="select" value={f.status} onChange={set("status")}>{Object.entries(BUG_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Priority"><PrioritySelect value={f.priority} onChange={set("priority")} /></Field>
          <Field label="Due date (optional)"><input type="date" className="input" value={f.due_date} onChange={set("due_date")} /></Field>
        </div>
        <div className="flex justify-between"><button type="button" className="btn btn-danger" disabled={pending} onClick={del}><Trash2 size={15} /> Delete</button>
          <div className="flex gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button></div></div>
      </form>
    </Modal>
  );
}
