"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pin, Archive, Trash2, Eye, Pencil, ArchiveRestore } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import Modal from "@/components/ui/Modal";
import { Empty, Markdown, Tags } from "@/components/ui/misc";
import { Segmented, tagsToString } from "@/components/ui/Fields";
import { useAction } from "@/components/ui/useAction";
import { createNote, updateNote, deleteNote, togglePinNote, toggleArchiveNote } from "@/actions/notes";
import { fmtDate } from "@/lib/dates";

export default function NotesClient({ notes, initialQuery }) {
  const [q, setQ] = useState(initialQuery); const [tab, setTab] = useState("active"); const [tag, setTag] = useState(""); const [open, setOpen] = useState(null);
  useEffect(() => { const a = new URLSearchParams(window.location.search); if (a.get("add") === "note") setOpen({}); }, []);
  const tags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags || []))].sort(), [notes]);
  const list = useMemo(() => notes.filter((n) => (tab === "archived") === n.archived)
    .filter((n) => !tag || n.tags?.includes(tag))
    .filter((n) => !q || (n.title + " " + n.body + " " + (n.tags || []).join(" ")).toLowerCase().includes(q.toLowerCase())), [notes, tab, tag, q]);
  return (<>
    <PageHead title="Notes" sub="Open → type → save. Markdown and code blocks supported.">
      <button className="btn btn-primary" onClick={() => setOpen({})}><Plus size={16} /> New note</button></PageHead>
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <Segmented value={tab} onChange={setTab} options={[{ value: "active", label: "Notes" }, { value: "archived", label: "Archived" }]} label="Note list" />
      <input className="input" style={{ maxWidth: 260 }} placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
      {tags.length > 0 && <select className="select" style={{ maxWidth: 160 }} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag"><option value="">All tags</option>{tags.map((t) => <option key={t} value={t}>#{t}</option>)}</select>}
    </div>
    {list.length === 0 ? <div className="card"><Empty title={tab === "archived" ? "No archived notes" : "No notes found"} hint={q ? "Try a different search." : "Capture your first thought."} /></div> :
      <div className="grid-cards">{list.map((n) => (
        <button key={n.id} className="card text-left" style={{ cursor: "pointer", color: "inherit", font: "inherit" }} onClick={() => setOpen(n)}>
          <div className="flex items-center gap-2 mb-1"><strong className="grow trunc">{n.title || "Untitled"}</strong>{n.pinned && <Pin size={13} className="muted" aria-label="Pinned" />}</div>
          <p className="sub" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", margin: "0 0 8px", minHeight: 58 }}>{n.body.replace(/[#*`>]/g, "") || "Empty note"}</p>
          <div className="flex items-center gap-2 small muted"><Tags tags={n.tags?.slice(0, 3)} /><span className="ml-auto">{fmtDate(n.updated_at)}</span></div></button>))}</div>}
    {open && <NoteEditor key={open.id || "new"} note={open} onClose={() => setOpen(null)} />}
  </>);
}

function NoteEditor({ note, onClose }) {
  const { run, pending } = useAction(); const isNew = !note.id;
  const [f, setF] = useState({ title: note.title || "", body: note.body || "", tags: tagsToString(note.tags) }); const [preview, setPreview] = useState(!isNew && !!note.body); const [dirty, setDirty] = useState(false); const [id, setId] = useState(note.id);
  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setDirty(true); };
  async function save(close = false) {
    if (!f.title.trim() && !f.body.trim()) { onClose(); return; }
    const r = await run(() => (id ? updateNote(id, f) : createNote(f)), { ok: "Saved" });
    if (r) { setDirty(false); if (!id && r.id) setId(r.id); if (close) onClose(); }
  }
  const close = () => { if (dirty && !confirm("Discard unsaved changes?")) return; onClose(); };
  async function act(fn, msg) { if (await run(() => fn(id), { ok: msg })) onClose(); }
  return (
    <Modal open onClose={close} title={isNew ? "New note" : "Edit note"} wide>
      <div className="flex flex-col gap-3" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "Enter")) { e.preventDefault(); save(); } }}>
        <input className="input" style={{ fontSize: 18, fontWeight: 600 }} placeholder="Title" value={f.title} onChange={set("title")} aria-label="Title" autoFocus />
        <div className="flex gap-2 justify-between items-center"><span className="small muted">{dirty ? "Unsaved changes" : id ? "Saved" : ""}</span>
          <button className="btn btn-sm" onClick={() => setPreview((v) => !v)}>{preview ? <><Pencil size={14} /> Edit</> : <><Eye size={14} /> Preview</>}</button></div>
        {preview ? <div className="card" style={{ minHeight: 200, background: "transparent" }}><Markdown text={f.body || "*Nothing to preview*"} /></div>
          : <textarea className="textarea" style={{ minHeight: 260, fontFamily: "ui-monospace, monospace", fontSize: 14 }} placeholder="Write in Markdown… use ``` for code" value={f.body} onChange={set("body")} aria-label="Note body" />}
        <input className="input" placeholder="Tags, comma separated" value={f.tags} onChange={set("tags")} aria-label="Tags" />
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-1">{id && <>
            <button className="btn btn-ghost btn-sm" onClick={() => act(togglePinNote, note.pinned ? "Unpinned" : "Pinned")}><Pin size={14} /> {note.pinned ? "Unpin" : "Pin"}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => act(toggleArchiveNote, note.archived ? "Restored" : "Archived")}>{note.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {note.archived ? "Restore" : "Archive"}</button>
            <button className="btn btn-ghost btn-sm btn-danger" onClick={() => confirm("Delete this note?") && act(deleteNote, "Note deleted")}><Trash2 size={14} /> Delete</button></>}</div>
          <div className="flex gap-2"><button className="btn" onClick={close}>Close</button><button className="btn btn-primary" onClick={() => save(true)} disabled={pending}>Save</button></div></div>
      </div>
    </Modal>);
}
