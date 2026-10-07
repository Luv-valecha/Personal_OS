"use client";
import { useState } from "react";
import { ArrowUp, ArrowDown, Pencil, Star, Plus } from "lucide-react";
import QuickLinkForm from "@/components/quicklinks/QuickLinkForm";
import { LinkIcon } from "@/components/quicklinks/QuickLinkTile";
import { Empty } from "@/components/ui/misc";
import { useAction } from "@/components/ui/useAction";
import { reorderQuickLinks, toggleFavoriteQuickLink } from "@/actions/quicklinks";

export default function QuickLinksManager({ links }) {
  const { run } = useAction(); const [edit, setEdit] = useState(null);
  // Order shown = favourites first, then position (same as the widget). Reordering works within the full list.
  async function move(i, d) { const a = links.map((l) => l.id); const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; await run(() => reorderQuickLinks(a)); }
  return (<div id="quicklinks" className="card" style={{ scrollMarginTop: 72 }}>
    <div className="card-title"><span>Quick links</span><button className="btn btn-sm" onClick={() => setEdit({})}><Plus size={14} /> Add link</button></div>
    {links.length === 0 ? <Empty title="No quick links" hint="Add GitHub, your college portal, or internal pages like /tasks." /> : links.map((l, i) => (
      <div key={l.id} className="list-row">
        <LinkIcon link={l} /><div className="grow" style={{ minWidth: 0 }}><div className="trunc">{l.title}</div><div className="small muted trunc">{l.url}{l.category ? ` · ${l.category}` : ""}</div></div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => run(() => toggleFavoriteQuickLink(l.id))} aria-pressed={l.favorite} aria-label={l.favorite ? `Unpin ${l.title}` : `Pin ${l.title}`}><Star size={15} fill={l.favorite ? "var(--color-accent)" : "none"} color={l.favorite ? "var(--color-accent)" : "currentColor"} /></button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${l.title} up`}><ArrowUp size={15} /></button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => move(i, 1)} disabled={i === links.length - 1} aria-label={`Move ${l.title} down`}><ArrowDown size={15} /></button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEdit(l)} aria-label={`Edit ${l.title}`}><Pencil size={14} /></button></div>))}
    {edit && <QuickLinkForm link={edit.id ? edit : null} onClose={() => setEdit(null)} />}
  </div>);
}
