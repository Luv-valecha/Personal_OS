"use client";
import { useEffect, useMemo, useState } from "react";
import { Star, Archive, ArchiveRestore, Trash2, Plus, Pencil } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import Modal from "@/components/ui/Modal";
import { Field, Chips, Segmented, tagsToString } from "@/components/ui/Fields";
import { Empty, Tags } from "@/components/ui/misc";
import { useAction } from "@/components/ui/useAction";
import { createBookmark, updateBookmark, deleteBookmark, toggleFavoriteBookmark, toggleArchiveBookmark } from "@/actions/bookmarks";
import { fmtDate } from "@/lib/dates";

const CATS = ["development", "research", "education", "entertainment", "shopping", "ideas", "other"].map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }));
export default function BookmarksClient({ items, initialQuery, openId = "" }) {
  const { run, pending } = useAction(); const [url, setUrl] = useState(""); const [cat, setCat] = useState(""); const [q, setQ] = useState(initialQuery); const [tab, setTab] = useState("all"); const [edit, setEdit] = useState(null); const [limit, setLimit] = useState(60);
  useEffect(() => { if (openId) { const b = items.find((x) => x.id === openId); if (b) setEdit(b); } }, [openId]); // eslint-disable-line
  const list = useMemo(() => items.filter((b) => (tab === "archived" ? b.archived : !b.archived)).filter((b) => tab !== "favorites" || b.favorite).filter((b) => !cat || b.category === cat)
    .filter((b) => !q || (b.title + b.url + b.description + (b.tags || []).join(" ")).toLowerCase().includes(q.toLowerCase())), [items, tab, cat, q]);
  async function add(e) { e.preventDefault(); if (!url.trim()) return; const r = await run(() => createBookmark({ url, category: cat || "other" }), { ok: "Bookmark saved" }); if (r) setUrl(""); }
  return (<>
    <PageHead title="Bookmarks" sub="Paste a link — the title is fetched automatically (or typed by you if it can't be)." />
    <form onSubmit={add} className="flex gap-2 mb-4"><input className="input" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Bookmark URL" /><button className="btn btn-primary" disabled={pending}><Plus size={16} /> {pending ? "Saving…" : "Save"}</button></form>
    <div className="flex flex-wrap gap-3 items-center mb-3"><Segmented value={tab} onChange={setTab} options={[{ value: "all", label: "All" }, { value: "favorites", label: "Favorites" }, { value: "archived", label: "Archived" }]} label="Bookmark list" />
      <input className="input" style={{ maxWidth: 220 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bookmarks" /></div>
    <div className="mb-4"><Chips value={cat} onChange={setCat} options={CATS} /></div>
    <div className="card" style={{ padding: 8 }}>
      {list.length === 0 ? <Empty title="No bookmarks" hint="Save a link above." /> : <>{list.slice(0, limit).map((b) => (
        <div key={b.id} className="list-row">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => run(() => toggleFavoriteBookmark(b.id))} aria-label={b.favorite ? "Remove favorite" : "Add favorite"} aria-pressed={b.favorite}><Star size={16} fill={b.favorite ? "var(--color-accent)" : "none"} color={b.favorite ? "var(--color-accent)" : "currentColor"} /></button>
          <a href={b.url} target="_blank" rel="noopener noreferrer nofollow" className="grow" style={{ minWidth: 0 }}><div className="trunc">{b.title}</div><div className="small muted trunc">{b.domain} · {fmtDate(b.created_at)} · {b.category}</div></a>
          <span className="hidden sm:block"><Tags tags={b.tags?.slice(0, 2)} /></span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEdit(b)} aria-label="Edit"><Pencil size={14} /></button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => run(() => toggleArchiveBookmark(b.id))} aria-label={b.archived ? "Restore" : "Archive"}>{b.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
        </div>))}{list.length > limit && <div className="text-center py-2"><button className="btn btn-sm" onClick={() => setLimit((n) => n + 60)}>Show more</button></div>}</>}
    </div>
    {edit && <BookmarkEditor b={edit} onClose={() => setEdit(null)} />}
  </>);
}
function BookmarkEditor({ b, onClose }) {
  const { run, pending } = useAction(); const [f, setF] = useState({ title: b.title, description: b.description, category: b.category, tags: tagsToString(b.tags) }); const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save(e) { e.preventDefault(); if (await run(() => updateBookmark(b.id, f), { ok: "Saved" })) onClose(); }
  async function del() { if (confirm("Delete this bookmark?") && await run(() => deleteBookmark(b.id), { ok: "Deleted" })) onClose(); }
  return (<Modal open onClose={onClose} title="Edit bookmark"><form onSubmit={save} className="flex flex-col gap-3">
    <Field label="Title"><input className="input" value={f.title} onChange={set("title")} required /></Field>
    <Field label="Description"><textarea className="textarea" style={{ minHeight: 64 }} value={f.description} onChange={set("description")} /></Field>
    <div className="form-grid two"><Field label="Category"><select className="select" value={f.category} onChange={set("category")}>{CATS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
      <Field label="Tags"><input className="input" value={f.tags} onChange={set("tags")} /></Field></div>
    <div className="flex justify-between"><button type="button" className="btn btn-danger" onClick={del}><Trash2 size={15} /> Delete</button><div className="flex gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending}>Save</button></div></div></form></Modal>);
}
