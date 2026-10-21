"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import Modal from "@/components/ui/Modal";
import { Field, PrioritySelect, Chips } from "@/components/ui/Fields";
import { Empty, Progress } from "@/components/ui/misc";
import { useAction } from "@/components/ui/useAction";
import { createProject, updateProject, deleteProject, getProjectDeleteImpact } from "@/actions/projects";
import { createTask, toggleTask } from "@/actions/tasks";
import { createIdea } from "@/actions/ideas";
import IdeaEditor from "@/components/ideas/IdeaEditor";
import { STATUS_LABEL } from "@/lib/format";
import { fmtDate, relDay } from "@/lib/dates";

const STATUSES = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));
export default function ProjectsClient({ projects, today, initialQuery }) {
  const [status, setStatus] = useState(""); const [q, setQ] = useState(initialQuery); const [open, setOpen] = useState(null);
  const list = useMemo(() => projects.filter((p) => (status ? p.status === status : p.status !== "archived")).filter((p) => !q || (p.name + p.description).toLowerCase().includes(q.toLowerCase())), [projects, status, q]);
  return (<>
    <PageHead title="Projects"><button className="btn btn-primary" onClick={() => setOpen({})}><Plus size={16} /> New project</button></PageHead>
    <div className="flex flex-wrap gap-3 items-center mb-4"><Chips value={status} onChange={setStatus} options={STATUSES} all="Active" />
      <input className="input" style={{ maxWidth: 220 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" /></div>
    {list.length === 0 ? <div className="card"><Empty title="No projects here" hint="Create a project to group tasks, notes and files." /></div> :
      <div className="grid-cards">{list.map((p) => { const pct = p.total ? Math.round((p.done / p.total) * 100) : 0; return (
        <button key={p.id} className="card text-left" style={{ cursor: "pointer", color: "inherit", font: "inherit" }} onClick={() => setOpen(p)}>
          <div className="flex items-start justify-between gap-2"><strong className="trunc">{p.name}</strong><span className="chip">{STATUS_LABEL[p.status]}</span></div>
          <p className="sub trunc" style={{ margin: "2px 0 12px" }}>{p.description || "No description"}</p>
          <Progress value={pct} label={`${p.name} progress`} />
          <div className="flex justify-between small muted mt-2"><span>{p.done} / {p.total} tasks · {pct}%</span>{p.deadline && <span>{relDay(p.deadline, today)}</span>}</div></button>); })}</div>}
    {open && <ProjectEditor key={open.id || "new"} p={projects.find((x) => x.id === open.id) || open} allProjects={projects.map(({ id, name }) => ({ id, name }))} today={today} onClose={() => setOpen(null)} />}
  </>);
}

function ProjectEditor({ p, allProjects = [], today, onClose }) {
  const { run, pending } = useAction(); const isNew = !p.id; const [newTask, setNewTask] = useState(""); const [newIdea, setNewIdea] = useState(""); const [ideaOpen, setIdeaOpen] = useState(null);
  async function addIdea() { if (!newIdea.trim()) return; const r = await run(() => createIdea({ title: newIdea, project_id: p.id }), { ok: "Idea added to project" }); if (r) setNewIdea(""); }
  const [f, setF] = useState({ name: p.name || "", description: p.description || "", status: p.status || "planned", priority: p.priority || "medium", start_date: p.start_date || "", deadline: p.deadline || "" });
  const [links, setLinks] = useState(p.links || []); const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save(e) { e.preventDefault(); const body = { ...f, start_date: f.start_date || null, deadline: f.deadline || null, links: links.filter((l) => l.url.trim()) };
    const r = await run(() => (isNew ? createProject(body) : updateProject(p.id, body)), { ok: isNew ? "Project created" : "Project saved" }); if (r) onClose(); }
  async function del() {
    const imp = await run(() => getProjectDeleteImpact(p.id)); if (!imp) return;
    const parts = [["task", imp.tasks], ["idea", imp.ideas], ["note", imp.notes], ["deadline", imp.deadlines], ["file", imp.files]].filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}${n === 1 ? "" : "s"}`);
    const msg = `Delete "${imp.name}" permanently?\n\n` + (parts.length ? `This will also delete: ${parts.join(", ")}.` : "It has no tasks, ideas, notes, deadlines or files.") + "\n\nThis cannot be undone.";
    if (confirm(msg) && await run(() => deleteProject(p.id), { ok: "Project and its contents deleted" })) onClose();
  }
  async function addTask() { if (!newTask.trim()) return; const r = await run(() => createTask({ title: newTask, project_id: p.id })); if (r) setNewTask(""); }
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (<Modal open onClose={onClose} title={isNew ? "New project" : p.name} wide>
    <form onSubmit={save} className="flex flex-col gap-3">
      {!isNew && <div><div className="flex justify-between small muted mb-1"><span>{p.done} / {p.total} tasks</span><span>{pct}%</span></div><Progress value={pct} label="Progress" /></div>}
      <Field label="Name"><input className="input" value={f.name} onChange={set("name")} required autoFocus={isNew} /></Field>
      <Field label="Description"><textarea className="textarea" style={{ minHeight: 64 }} value={f.description} onChange={set("description")} /></Field>
      <div className="form-grid two">
        <Field label="Status"><select className="select" value={f.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
        <Field label="Priority"><PrioritySelect value={f.priority} onChange={set("priority")} /></Field>
        <Field label="Start date"><input type="date" className="input" value={f.start_date} onChange={set("start_date")} /></Field>
        <Field label="Deadline"><input type="date" className="input" value={f.deadline} onChange={set("deadline")} /></Field></div>
      <div><span className="label">Links</span>
        {links.map((l, i) => <div key={i} className="flex gap-2 mb-2"><input className="input" placeholder="Title" value={l.title} onChange={(e) => setLinks((a) => a.map((x, k) => k === i ? { ...x, title: e.target.value } : x))} style={{ maxWidth: 160 }} aria-label="Link title" />
          <input className="input" placeholder="https://" value={l.url} onChange={(e) => setLinks((a) => a.map((x, k) => k === i ? { ...x, url: e.target.value } : x))} aria-label="Link URL" />
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => setLinks((a) => a.filter((_, k) => k !== i))} aria-label="Remove link"><Trash2 size={14} /></button></div>)}
        <button type="button" className="btn btn-sm" onClick={() => setLinks((a) => [...a, { title: "", url: "" }])}><Plus size={14} /> Add link</button></div>
      {!isNew && <>
        <div><span className="label">Tasks</span>
          {p.tasks?.map((t) => <div key={t.id} className="list-row"><input type="checkbox" className="check" defaultChecked={t.completed} onChange={() => run(() => toggleTask(t.id))} aria-label={t.title} /><span className="grow">{t.title}</span></div>)}
          <div className="flex gap-2 mt-2"><input className="input" value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }} placeholder="Add a task to this project" aria-label="New project task" /><button type="button" className="btn" onClick={addTask}>Add</button></div></div>
        <div><span className="label">Ideas ({p.ideas?.length || 0})</span>
          {p.ideas?.map((i) => <button type="button" key={i.id} className="list-row w-full text-left" style={{ background: "none", border: 0, color: "inherit", font: "inherit", cursor: "pointer" }} onClick={() => setIdeaOpen(i)}><span className="grow trunc">{i.title}</span>{i.tasks?.length > 0 && <span className="chip">{i.tasks.length} task{i.tasks.length > 1 ? "s" : ""}</span>}<span className="chip">{i.status}</span></button>)}
          <div className="flex gap-2 mt-2"><input className="input" value={newIdea} onChange={(e) => setNewIdea(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addIdea(); } }} placeholder="Add an idea to this project" aria-label="New project idea" /><button type="button" className="btn" onClick={addIdea}>Add idea</button></div></div>
        {(p.notes?.length > 0 || p.files?.length > 0) && <div className="small muted">{p.notes?.length > 0 && <div>Notes: {p.notes.map((n) => n.title || "Untitled").join(", ")}</div>}{p.files?.length > 0 && <div>Files: {p.files.map((x) => x.name).join(", ")}</div>}</div>}
        {p.links?.filter((l) => /^https?:\/\//i.test(l.url)).length > 0 && <div className="flex flex-wrap gap-2">{p.links.filter((l) => /^https?:\/\//i.test(l.url)).map((l, i) => <a key={i} className="chip" href={l.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} />{l.title || l.url}</a>)}</div>}</>}
      <div className="flex justify-between">{!isNew ? <button type="button" className="btn btn-danger" onClick={del}><Trash2 size={15} /> Delete</button> : <span />}<div className="flex gap-2"><button type="button" className="btn" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={pending}>Save</button></div></div>
    </form>
    {ideaOpen && <IdeaEditor key={ideaOpen.id} idea={p.ideas.find((x) => x.id === ideaOpen.id) || ideaOpen} projects={allProjects} onClose={() => setIdeaOpen(null)} />}</Modal>);
}
