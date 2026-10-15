"use client";
import { useState } from "react";
import { Trash2, Copy, Smartphone } from "lucide-react";
import { useAction } from "@/components/ui/useAction";
import { Field } from "@/components/ui/Fields";
import { Empty } from "@/components/ui/misc";
import { createMobileToken, revokeMobileToken } from "@/actions/mobile";
import { fmtDate } from "@/lib/dates";

export default function AndroidLink({ tokens }) {
  const { run, pending } = useAction(); const [name, setName] = useState(""); const [fresh, setFresh] = useState(null); const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  async function create(e) { e.preventDefault(); const r = await run(() => createMobileToken(name), { ok: "Pairing token created" }); if (r) { setFresh(r); setName(""); setCopied(false); } }
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); setCopied(true); } catch { setCopied(false); } };
  const active = tokens.filter((t) => !t.revoked_at && new Date(t.expires_at) > new Date());
  return (<div className="flex flex-col gap-4">
    <section className="card"><div className="card-title">1 · Create a pairing token</div>
      <p className="small muted" style={{ marginTop: 0 }}>Name the phone, create the token, then paste it into the Lucifer OS Android app together with this website address:</p>
      <p className="small" style={{ fontFamily: "monospace", wordBreak: "break-all" }} suppressHydrationWarning>{origin}</p>
      <form onSubmit={create} className="flex gap-2 flex-wrap items-end"><Field label="Phone name" className="grow"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Pixel" maxLength={60} required /></Field><button className="btn btn-primary" disabled={pending}><Smartphone size={15} /> Create token</button></form>
      {fresh && <div className="card mt-3" style={{ background: "var(--color-surface-elevated)" }} role="status"><div className="small" style={{ color: "var(--c-orange)" }}>Copy it now — it is shown only once and cannot be recovered.</div>
        <div style={{ fontFamily: "monospace", wordBreak: "break-all", margin: "8px 0" }} data-testid="new-token">{fresh.token}</div><button className="btn btn-sm" onClick={() => copy(fresh.token)}><Copy size={14} /> {copied ? "Copied" : "Copy token"}</button></div>}
    </section>
    <section className="card"><div className="card-title">Linked phones ({active.length})</div>
      {tokens.length === 0 ? <Empty title="No phones linked yet" /> : tokens.map((t) => { const dead = t.revoked_at || new Date(t.expires_at) <= new Date(); return (
        <div key={t.id} className="list-row" style={{ opacity: dead ? 0.55 : 1 }}><Smartphone size={16} className="muted" /><div className="grow" style={{ minWidth: 0 }}><div className="trunc">{t.name}{dead && <span className="chip ml-2">{t.revoked_at ? "revoked" : "expired"}</span>}</div>
          <div className="small muted">Linked {fmtDate(t.created_at)} · {t.last_used_at ? `last used ${fmtDate(t.last_used_at)}` : "never used"} · expires {fmtDate(t.expires_at)}</div></div>
          {!dead && <button className="btn btn-ghost btn-icon btn-sm" onClick={() => confirm(`Revoke “${t.name}”? That phone will stop working until linked again.`) && run(() => revokeMobileToken(t.id), { ok: "Revoked" })} aria-label={`Revoke ${t.name}`}><Trash2 size={14} /></button>}</div>); })}</section>
    <p className="small muted">A token can only use JARVIS (it can’t open your dashboard or change settings). Tokens last 180 days; revoke any you don’t recognise.</p></div>);
}
