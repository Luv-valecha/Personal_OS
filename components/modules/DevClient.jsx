"use client";
import { useState } from "react";
import { Plus, Trash2, GitBranch, Globe } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import Modal from "@/components/ui/Modal";
import { Field, tagsToString } from "@/components/ui/Fields";
import { Empty, Tags } from "@/components/ui/misc";
import { useAction } from "@/components/ui/useAction";
import { createDevProject, updateDevProject, deleteDevProject } from "@/actions/projects";

const ST = { live: ["green", "Live"], building: ["yellow", "Building"], paused: ["orange", "Paused"], archived: ["", "Archived"] };
const safeUrl = (u) => /^https?:\/\//i.test(u || "") ? u : null;
export default function DevClient({ items }) {
  const [edit, setEdit] = useState(null);
  return (<>
    <PageHead title="Developer projects"><button className="btn btn-primary" onClick={() => setEdit({})}><Plus size={16} /> Add project</button></PageHead>
    {items.length === 0 ? <div className="card"><Empty title="No developer projects" hint="Track repos, deployments and TODOs." /></div> :
      <div className="card" style={{ padding: 8 }}>{items.map((p) => { const todos = p.todos || []; return (
        <div key={p.id} className="list-row"><span className={`dot ${ST[p.status][0]}`} title={ST[p.status][1]} />
          <button className="grow text-left" style={{ background: "none", border: 0, color: "inherit", font: "inherit", cursor: "pointer", minWidth: 0 }} onClick={() => setEdit(p)}><div className="trunc">{p.name}</div><div className="small muted trunc">{ST[p.status][1]}{todos.length ? ` · ${todos.filter((t) => t.done).length}/${todos.length} todos` : ""}</div></button>
          <span className="hidden sm:block"><Tags tags={p.tech_stack?.slice(0, 3)} /></span>
          {safeUrl(p.github_url) && <a className="btn btn-ghost btn-icon btn-sm" href={p.github_url} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} on GitHub`}><GitBranch size={15} /></a>}
          {safeUrl(p.deploy_url) && <a className="btn btn-ghost btn-icon btn-sm" href={p.deploy_url} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} live site`}><Globe size={15} /></a>}</div>); })}</div>}
    {edit && <DevEditor p={edit} onClose={() => setEdit(null)} />}
  </>);
}
function DevEditor({ p, onClose }) {
  const { run, pending } = useAction(); const isNew = !p.id; const [todos, setTodos] = useState(p.todos || []); const [nt, setNt] = useState("");
  const [f, setF] = useState({ name: p.name || "", github_url: p.github_url || "", deploy_url: p.deploy_url || "", description: p.description || "", tech_stack: tagsToString(p.tech_stack), status: p.status || "building", notes: p.notes || "" }); const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save(e) { e.preventDefault(); const b = { ...f, todos }; if (await run(() => (isNew ? createDevProject(b) : updateDevProject(p.id, b)), { ok: "Saved" })) onClose(); }
  async function del() { if (confirm("Delete this project?") && await run(() => deleteDevProject(p.id), { ok: "Deleted" })) onClose(); }
  const addTodo = () => { if (nt.trim()) { setTodos((t) => [...t, { text: nt.trim(), done: false }]); setNt(""); } };
  return (<Modal open onClose={onClose} title={isNew ? "New developer project" : p.name} wide><form onSubmit={save} className="flex flex-col gap-3">
    <div className="form-grid two"><Field label="Name"><input className="input" value={f.name} onChange={set("name")} required /></Field>
      <Field label="Status"><select className="select" value={f.status} onChange={set("status")}>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v[1]}</option>)}</select></Field>
      <Field label="GitHub URL"><input className="input" inputMode="url" value={f.github_url} onChange={set("github_url")} placeholder="https://github.com/…" /></Field>
      <Field label="Deployment URL"><input className="input" inputMode="url" value={f.deploy_url} onChange={set("deploy_url")} placeholder="https://" /></Field></div>
    <Field label="Tech stack (comma separated)"><input className="input" value={f.tech_stack} onChange={set("tech_stack")} /></Field>
    <Field label="Description"><textarea className="textarea" style={{ minHeight: 56 }} value={f.description} onChange={set("description")} /></Field>
    <Field label="Notes"><textarea className="textarea" style={{ minHeight: 70 }} value={f.notes} onChange={set("notes")} /></Field>
    <div><span className="label">TODOs</span>{todos.map((t, i) => <div key={i} className="list-row"><input type="checkbox" className="check" checked={t.done} onChange={() => setTodos((a) => a.map((x, k) => k === i ? { ...x, done: !x.done } : x))} aria-label={t.text} /><span className={`grow ${t.done ? "done" : ""}`}>{t.text}</span><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setTodos((a) => a.filter((_, k) => k !== i))} aria-label="Remove"><Trash2 size={14} /></button></div>)}
      <div className="flex gap-2 mt-2"><input className="input" value={nt} onChange={(e) => setNt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTodo(); } }} placeholder="Add a TODO" aria-label="New TODO" /><button type="button" className="btn" onClick={addTodo}>Add</button></div></div>
    <div className="flex justify-between">{!isNew ? <button type="button" className="btn btn-danger" onClick={del}><Trash2 size={15} /> Delete</button> : <span />}<div className="flex gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending}>Save</button></div></div></form></Modal>);
}
