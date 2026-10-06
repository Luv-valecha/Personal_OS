"use client";
import { useMemo, useState } from "react";
import { Plus, Shuffle, Trash2 } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import Modal from "@/components/ui/Modal";
import { Field, PrioritySelect, Chips, tagsToString } from "@/components/ui/Fields";
import { Empty, Tags } from "@/components/ui/misc";
import { useAction } from "@/components/ui/useAction";
import { createIdea, updateIdea, deleteIdea, randomIdea } from "@/actions/ideas";
import { fmtDate } from "@/lib/dates";

const STATUS = ["inbox", "considering", "building", "completed", "rejected"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }));
export default function IdeasClient({ ideas, initialQuery }) {
  const { run, pending } = useAction(); const [title, setTitle] = useState(""); const [status, setStatus] = useState(""); const [q, setQ] = useState(initialQuery); const [edit, setEdit] = useState(null); const [pick, setPick] = useState(null);
  const list = useMemo(() => ideas.filter((i) => !status || i.status === status).filter((i) => !q || (i.title + i.description).toLowerCase().includes(q.toLowerCase())), [ideas, status, q]);
  async function add(e) { e.preventDefault(); if (!title.trim()) return; if (await run(() => createIdea({ title }), { ok: "Idea captured" })) setTitle(""); }
  async function random() { const r = await run(() => randomIdea()); if (r === null) return; if (r === true || !r.id) { setPick({ empty: true }); } else setPick(r); }
  return (<>
    <PageHead title="Idea inbox" sub="Capture first, judge later."><button className="btn" onClick={random}><Shuffle size={15} /> Pick a random idea</button></PageHead>
    <form onSubmit={add} className="flex gap-2 mb-4"><input className="input" placeholder="+ Idea" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New idea" /><button className="btn btn-primary" disabled={pending}><Plus size={16} /> Add</button></form>
    <div className="flex flex-wrap gap-3 items-center mb-4"><Chips value={status} onChange={setStatus} options={STATUS} /><input className="input" style={{ maxWidth: 200 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search ideas" /></div>
    {list.length === 0 ? <div className="card"><Empty title="No ideas here" hint="Anything worth remembering goes in the inbox." /></div> :
      <div className="grid-cards">{list.map((i) => (
        <button key={i.id} className="card text-left" style={{ cursor: "pointer", color: "inherit", font: "inherit" }} onClick={() => setEdit(i)}>
          <div className="flex justify-between gap-2"><strong>{i.title}</strong><span className="chip">{i.status}</span></div>
          {i.description && <p className="sub" style={{ margin: "4px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{i.description}</p>}
          <div className="flex gap-2 items-center small muted mt-2"><Tags tags={i.tags} /><span className={`pri-${i.priority}`}>{i.priority}</span><span className="ml-auto">{fmtDate(i.created_at)}</span></div></button>))}</div>}
    {edit && <IdeaEditor i={edit} onClose={() => setEdit(null)} />}
    {pick && <Modal open onClose={() => setPick(null)} title="Your random idea">{pick.empty ? <Empty title="No ideas to pick from" hint="Add some ideas to your inbox first." /> : <div className="flex flex-col gap-3"><h2 style={{ fontSize: 22 }}>{pick.title}</h2><p className="sub">{pick.description || "No details yet."}</p>
      <div className="flex gap-2 justify-end"><button className="btn" onClick={random}><Shuffle size={15} /> Another</button><button className="btn btn-primary" onClick={async () => { if (await run(() => updateIdea(pick.id, { status: "building" }), { ok: "Marked as building" })) setPick(null); }}>Start building</button></div></div>}</Modal>}
  </>);
}
function IdeaEditor({ i, onClose }) {
  const { run, pending } = useAction(); const [f, setF] = useState({ title: i.title, description: i.description, priority: i.priority, status: i.status, tags: tagsToString(i.tags) }); const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save(e) { e.preventDefault(); if (await run(() => updateIdea(i.id, f), { ok: "Saved" })) onClose(); }
  async function del() { if (confirm("Delete this idea?") && await run(() => deleteIdea(i.id), { ok: "Deleted" })) onClose(); }
  return (<Modal open onClose={onClose} title="Edit idea"><form onSubmit={save} className="flex flex-col gap-3">
    <Field label="Title"><input className="input" value={f.title} onChange={set("title")} required /></Field>
    <Field label="Description"><textarea className="textarea" value={f.description} onChange={set("description")} /></Field>
    <div className="form-grid two"><Field label="Status"><select className="select" value={f.status} onChange={set("status")}>{STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field><Field label="Priority"><PrioritySelect value={f.priority} onChange={set("priority")} /></Field></div>
    <Field label="Tags"><input className="input" value={f.tags} onChange={set("tags")} /></Field>
    <div className="flex justify-between"><button type="button" className="btn btn-danger" onClick={del}><Trash2 size={15} /> Delete</button><div className="flex gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending}>Save</button></div></div></form></Modal>);
}
