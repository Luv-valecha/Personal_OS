"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Shuffle } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import Modal from "@/components/ui/Modal";
import { Chips, ProjectSelect } from "@/components/ui/Fields";
import { Empty, Tags } from "@/components/ui/misc";
import { useAction } from "@/components/ui/useAction";
import { createIdea, updateIdea, randomIdea } from "@/actions/ideas";
import IdeaEditor, { IDEA_STATUS } from "@/components/ideas/IdeaEditor";
import { fmtDate } from "@/lib/dates";

export default function IdeasClient({ ideas, projects, initialQuery, openId, initialProject }) {
  const { run, pending } = useAction(); const [title, setTitle] = useState(""); const [status, setStatus] = useState(""); const [q, setQ] = useState(initialQuery);
  const [project, setProject] = useState(initialProject || ""); // "" all · "none" unassigned · "linked" converted to tasks · <project id>
  const [newProject, setNewProject] = useState(""); const [edit, setEdit] = useState(null); const [pick, setPick] = useState(null);
  useEffect(() => { if (openId) { const i = ideas.find((x) => x.id === openId); if (i) setEdit(i); } }, [openId]); // eslint-disable-line
  const list = useMemo(() => ideas.filter((i) => !status || i.status === status)
    .filter((i) => !project || (project === "none" ? !i.project_id : project === "linked" ? i.tasks.length > 0 : i.project_id === project))
    .filter((i) => !q || (i.title + i.description).toLowerCase().includes(q.toLowerCase())), [ideas, status, q, project]);
  // keep the open editor pointing at fresh data after a refresh
  const current = edit && (ideas.find((x) => x.id === edit.id) || edit);
  async function add(e) { e.preventDefault(); if (!title.trim()) return; if (await run(() => createIdea({ title, project_id: newProject || (project && project !== "none" && project !== "linked" ? project : null) }), { ok: "Idea captured" })) setTitle(""); }
  async function random() { const r = await run(() => randomIdea()); if (r === null) return; if (r === true || !r.id) setPick({ empty: true }); else setPick(r); }
  return (<>
    <PageHead title="Idea inbox" sub="Capture first, judge later."><button className="btn" onClick={random}><Shuffle size={15} /> Pick a random idea</button></PageHead>
    <form onSubmit={add} className="flex gap-2 mb-4 flex-wrap"><input className="input" style={{ flex: "1 1 220px" }} placeholder="+ Idea" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New idea" />
      <div style={{ flex: "0 1 200px" }}><ProjectSelect projects={projects} value={newProject} onChange={(e) => setNewProject(e.target.value)} aria-label="Project for new idea" /></div>
      <button className="btn btn-primary" disabled={pending}><Plus size={16} /> Add</button></form>
    <div className="flex flex-wrap gap-3 items-center mb-3"><Chips value={status} onChange={setStatus} options={IDEA_STATUS} />
      <input className="input" style={{ maxWidth: 200 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search ideas" /></div>
    <div className="flex flex-wrap gap-3 items-center mb-4"><label className="flex items-center gap-2 small muted">Project
      <select className="select" style={{ width: "auto", minHeight: 34 }} value={project} onChange={(e) => setProject(e.target.value)} aria-label="Filter ideas by project">
        <option value="">All ideas</option><option value="none">No project</option><option value="linked">Converted to tasks</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <span className="small muted">{list.length} idea{list.length === 1 ? "" : "s"}</span></div>
    {list.length === 0 ? <div className="card"><Empty title="No ideas here" hint="Anything worth remembering goes in the inbox." /></div> :
      <div className="grid-cards">{list.map((i) => (
        <button key={i.id} className="card text-left" style={{ cursor: "pointer", color: "inherit", font: "inherit" }} onClick={() => setEdit(i)}>
          <div className="flex justify-between gap-2"><strong>{i.title}</strong><span className="chip">{i.status}</span></div>
          {i.description && <p className="sub" style={{ margin: "4px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{i.description}</p>}
          <div className="flex gap-2 items-center small muted mt-2 flex-wrap">{i.project_name && <span className="chip chip-active">{i.project_name}</span>}{i.tasks.length > 0 && <span className="chip">{i.tasks.length} task{i.tasks.length > 1 ? "s" : ""}</span>}<Tags tags={i.tags} /><span className="ml-auto">{fmtDate(i.created_at)}</span></div></button>))}</div>}
    {current && <IdeaEditor key={current.id} idea={current} projects={projects} onClose={() => setEdit(null)} />}
    {pick && <Modal open onClose={() => setPick(null)} title="Your random idea">{pick.empty ? <Empty title="No ideas to pick from" hint="Add some ideas to your inbox first." /> : <div className="flex flex-col gap-3"><h2 style={{ fontSize: 22 }}>{pick.title}</h2><p className="sub">{pick.description || "No details yet."}</p>
      <div className="flex gap-2 justify-end"><button className="btn" onClick={random}><Shuffle size={15} /> Another</button><button className="btn btn-primary" onClick={async () => { if (await run(() => updateIdea(pick.id, { status: "building" }), { ok: "Marked as building" })) setPick(null); }}>Start building</button></div></div>}</Modal>}
  </>);
}
