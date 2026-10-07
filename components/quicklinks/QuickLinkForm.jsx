"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Field } from "@/components/ui/Fields";
import { useAction } from "@/components/ui/useAction";
import { createQuickLink, updateQuickLink, deleteQuickLink } from "@/actions/quicklinks";
import { ICON_MAP } from "@/components/quicklinks/icons";
import { ICONS } from "@/lib/validation";

const INTERNAL = [["Today", "/today"], ["Tasks", "/tasks"], ["Projects", "/projects"], ["Focus", "/focus"], ["Calendar", "/calendar"], ["Notes", "/notes"]];
export default function QuickLinkForm({ link, prefill, onClose }) {
  const { run, pending } = useAction(); const isNew = !link?.id; const init = link || prefill || {};
  const [f, setF] = useState({ title: init.title || "", url: init.url || "", icon: init.icon || "auto", category: init.category || "", description: init.description || "" });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save(e) { e.preventDefault(); const r = await run(() => (isNew ? createQuickLink(f) : updateQuickLink(link.id, f)), { ok: isNew ? "Link added" : "Link updated" }); if (r) onClose(true); }
  async function del() { if (confirm("Delete this link?") && await run(() => deleteQuickLink(link.id), { ok: "Link deleted" })) onClose(true); }
  return (
    <Modal open onClose={() => onClose(false)} title={isNew ? "Add quick link" : "Edit quick link"}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Title"><input className="input" value={f.title} onChange={set("title")} required maxLength={60} placeholder="GitHub" /></Field>
        <Field label="URL or internal page"><input className="input" value={f.url} onChange={set("url")} required inputMode="url" placeholder="https://github.com  or  /tasks" /></Field>
        <div className="flex flex-wrap gap-1" aria-label="Internal page shortcuts">{INTERNAL.map(([n, u]) => <button type="button" key={u} className="chip chip-btn" onClick={() => setF((s) => ({ ...s, url: u, title: s.title || n }))}>{n}</button>)}</div>
        <div><span className="label">Icon</span>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Icon">{ICONS.map((i) => { const I = ICON_MAP[i]; return (
            <button type="button" key={i} role="radio" aria-checked={f.icon === i} aria-label={i} className="btn btn-icon btn-sm" style={f.icon === i ? { borderColor: "var(--color-primary)", background: "color-mix(in srgb, var(--color-primary) 16%, transparent)" } : undefined} onClick={() => setF((s) => ({ ...s, icon: i }))}>
              {I ? <I size={15} /> : <span style={{ fontSize: 12, fontWeight: 700 }}>Aa</span>}</button>); })}</div>
          <p className="small muted mt-1">“Aa” shows the first letter of the title.</p></div>
        <div className="form-grid two"><Field label="Category (optional)"><input className="input" value={f.category} onChange={set("category")} maxLength={40} placeholder="College" /></Field>
          <Field label="Description (optional)"><input className="input" value={f.description} onChange={set("description")} maxLength={200} /></Field></div>
        <div className="flex justify-between">{!isNew ? <button type="button" className="btn btn-danger" onClick={del}><Trash2 size={15} /> Delete</button> : <span />}
          <div className="flex gap-2"><button type="button" className="btn" onClick={() => onClose(false)}>Cancel</button><button className="btn btn-primary" disabled={pending}>Save</button></div></div>
      </form>
    </Modal>);
}
