"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, HandCoins, Users, Scale } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import Modal from "@/components/ui/Modal";
import { Field } from "@/components/ui/Fields";
import { Empty } from "@/components/ui/misc";
import { useAction } from "@/components/ui/useAction";
import { createFriend, renameFriend, deleteFriend, createSplitEntry, updateSplitEntry, deleteSplitEntry, settleFriend, createEqualSplit } from "@/actions/splits";
import { money as fm } from "@/lib/format";
import { fmtDate, todayStr } from "@/lib/dates";

export const KINDS = { lent: ["I paid / lent — they owe me", "good"], borrowed: ["They paid / lent — I owe them", "bad"], they_paid_me: ["They paid me back", "good"], i_paid_them: ["I paid them back", "bad"] };
const tone = (b) => (b > 0.004 ? "var(--c-green)" : b < -0.004 ? "var(--c-red)" : "var(--color-text-muted)");
const balText = (b, cur) => (b > 0.004 ? `owes you ${fm(b, cur)}` : b < -0.004 ? `you owe ${fm(-b, cur)}` : "settled up");

export default function SplitsClient({ friends, entries, currency: cur, initialFriend }) {
  const { run, pending } = useAction(); const [name, setName] = useState(""); const [open, setOpen] = useState(initialFriend || ""); const [form, setForm] = useState(null); const [splitting, setSplitting] = useState(false);
  const owed = friends.reduce((s, f) => s + Math.max(0, f.balance), 0), owe = friends.reduce((s, f) => s + Math.max(0, -f.balance), 0);
  const byFriend = useMemo(() => { const m = {}; for (const e of entries) (m[e.friend_id] ||= []).push(e); return m; }, [entries]);
  async function addFriend(e) { e.preventDefault(); if (!name.trim()) return; if (await run(() => createFriend(name), { ok: "Friend added" })) setName(""); }
  return (<>
    <PageHead title="Splits" sub="Notes on who owes what. Friends are just names — nothing is shared or connected."><button className="btn" onClick={() => setSplitting(true)} disabled={!friends.length}><Scale size={15} /> Split equally</button>
      <button className="btn btn-primary" onClick={() => setForm({})} disabled={!friends.length}><Plus size={16} /> Add entry</button></PageHead>
    <div className="grid grid-cols-3 gap-3 mb-4">
      <div className="card"><div className="stat" style={{ color: "var(--c-green)" }}>{fm(owed, cur)}</div><div className="sub">You are owed</div></div>
      <div className="card"><div className="stat" style={{ color: "var(--c-red)" }}>{fm(owe, cur)}</div><div className="sub">You owe</div></div>
      <div className="card"><div className="stat">{fm(owed - owe, cur)}</div><div className="sub">Net {owed - owe >= 0 ? "(in your favour)" : "(you owe)"}</div></div></div>
    <form onSubmit={addFriend} className="flex gap-2 mb-4"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a friend's name" aria-label="Friend name" maxLength={60} /><button className="btn btn-primary" disabled={pending}><Users size={16} /> Add friend</button></form>
    {friends.length === 0 ? <div className="card"><Empty title="No friends yet" hint="Add a name above, then note what they owe you or what you owe them." /></div> :
      <div className="flex flex-col gap-3">{friends.map((f) => { const list = byFriend[f.id] || []; const isOpen = open === f.id; return (
        <div key={f.id} className="card" style={{ padding: 0 }}>
          <button className="list-row w-full text-left" style={{ background: "none", border: 0, color: "inherit", font: "inherit", cursor: "pointer", padding: "12px 16px" }} onClick={() => setOpen(isOpen ? "" : f.id)} aria-expanded={isOpen}>
            <span className="brand-mark" style={{ width: 32, height: 32, background: "var(--color-surface-elevated)", color: "var(--color-text)" }}>{f.name[0].toUpperCase()}</span>
            <span className="grow"><strong>{f.name}</strong><div className="small muted">{f.entries} entr{f.entries === 1 ? "y" : "ies"}{f.last_date ? ` · last ${fmtDate(f.last_date)}` : ""}</div></span>
            <strong style={{ color: tone(f.balance) }}>{balText(f.balance, cur)}</strong></button>
          {isOpen && <div style={{ padding: "0 16px 14px" }}>
            <div className="flex flex-wrap gap-2 mb-3">{Object.entries(KINDS).map(([k, [l]]) => <button key={k} className="btn btn-sm" onClick={() => setForm({ friend: f.id, kind: k })}>{l.split(" — ")[0]}</button>)}
              <button className="btn btn-sm btn-primary" disabled={Math.abs(f.balance) < 0.005 || pending} onClick={async () => { if (confirm(`Record a payment that settles ${fm(Math.abs(f.balance), cur)} with ${f.name}?`)) await run(() => settleFriend(f.id), { ok: "Settled up" }); }}><HandCoins size={14} /> Settle up</button>
              <button className="btn btn-ghost btn-sm" onClick={async () => { const n = prompt("Rename friend", f.name); if (n && n.trim() && n !== f.name) await run(() => renameFriend(f.id, n), { ok: "Renamed" }); }}><Pencil size={13} /> Rename</button>
              <button className="btn btn-ghost btn-sm btn-danger" onClick={async () => { if (confirm(`Delete ${f.name} and all ${list.length} ledger entries with them? This can't be undone.`)) await run(() => deleteFriend(f.id), { ok: "Friend deleted" }); }}><Trash2 size={13} /> Delete</button></div>
            {list.length === 0 ? <p className="small muted">No entries yet.</p> : list.map((e) => (
              <div key={e.id} className="list-row" style={{ alignItems: "flex-start" }}>
                <span className="small muted" style={{ width: 52, paddingTop: 2 }}>{fmtDate(e.entry_date)}</span>
                <div className="grow" style={{ minWidth: 0 }}><div>{e.reason || <span className="muted">No reason noted</span>}{e.group_ref && <span className="chip ml-2">split</span>}</div><div className="small muted">{KINDS[e.kind][0]}</div></div>
                <strong style={{ color: e.kind === "lent" || e.kind === "i_paid_them" ? "var(--c-green)" : "var(--c-red)", whiteSpace: "nowrap" }}>{e.kind === "lent" || e.kind === "i_paid_them" ? "+" : "−"}{fm(e.amount, cur)}</strong>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setForm({ entry: e })} aria-label="Edit entry"><Pencil size={14} /></button>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => confirm("Delete this entry?") && run(() => deleteSplitEntry(e.id), { ok: "Entry deleted" })} aria-label="Delete entry"><Trash2 size={14} /></button></div>))}
          </div>}</div>); })}</div>}
    {form && <EntryForm friends={friends} cur={cur} init={form} onClose={() => setForm(null)} />}
    {splitting && <SplitForm friends={friends} cur={cur} onClose={() => setSplitting(false)} />}
  </>);
}

function EntryForm({ friends, cur, init, onClose }) {
  const { run, pending } = useAction(); const ed = init.entry; const [f, setF] = useState({ friend: ed?.friend_id || init.friend || friends[0]?.id, kind: ed?.kind || init.kind || "lent", amount: ed ? String(ed.amount) : "", reason: ed?.reason || "", entry_date: ed ? String(ed.entry_date).slice(0, 10) : todayStr() }); const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save(e) { e.preventDefault(); if (pending) return;
    if (ed) { if (await run(() => updateSplitEntry(ed.id, { kind: f.kind, amount: f.amount, reason: f.reason, entry_date: f.entry_date }), { ok: "Entry updated" })) onClose(); return; }
    if (await run(() => createSplitEntry(f.friend, { kind: f.kind, amount: f.amount, reason: f.reason, entry_date: f.entry_date }), { ok: "Entry saved" })) onClose(); }
  return (<Modal open onClose={onClose} title={ed ? "Edit entry" : "Add entry"}><form onSubmit={save} className="flex flex-col gap-3">
    <Field label="Friend"><select className="select" value={f.friend} onChange={set("friend")} disabled={!!ed}>{friends.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">What happened</legend><div className="flex flex-col gap-1">{Object.entries(KINDS).map(([k, [l]]) => <label key={k} className="flex items-center gap-2 small" style={{ cursor: "pointer" }}><input type="radio" name="kind" checked={f.kind === k} onChange={() => setF((s) => ({ ...s, kind: k }))} />{l}</label>)}</div></fieldset>
    <div className="form-grid two"><Field label={`Amount (${cur})`}><input className="input" inputMode="decimal" required value={f.amount} onChange={set("amount")} autoFocus /></Field><Field label="Date"><input type="date" className="input" value={f.entry_date} onChange={set("entry_date")} /></Field></div>
    <Field label="Why? (details)"><input className="input" value={f.reason} onChange={set("reason")} placeholder="Dinner at Pizza Hut, cab to airport…" maxLength={300} /></Field>
    <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending}>Save</button></div></form></Modal>);
}

function SplitForm({ friends, cur, onClose }) {
  const { run, pending } = useAction(); const [total, setTotal] = useState(""); const [reason, setReason] = useState(""); const [payer, setPayer] = useState("me"); const [sel, setSel] = useState(new Set()); const [addExpense, setAddExpense] = useState(true);
  const people = sel.size + 1; const share = total ? Math.round((Number(total) / people) * 100) / 100 : 0;
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); if (!n.has(payer)) setPayer((x) => (x !== "me" && !n.has(x) ? "me" : x)); return n; });
  async function save(e) { e.preventDefault(); if (await run(() => createEqualSplit({ total, reason, payer, participants: [...sel], addExpense: payer === "me" && addExpense }), { ok: "Split recorded" })) onClose(); }
  return (<Modal open onClose={onClose} title="Split equally"><form onSubmit={save} className="flex flex-col gap-3">
    <div className="form-grid two"><Field label={`Total bill (${cur})`}><input className="input" inputMode="decimal" required value={total} onChange={(e) => setTotal(e.target.value)} autoFocus /></Field><Field label="What for"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Dinner" /></Field></div>
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">Split with (you are included)</legend><div className="flex flex-wrap gap-2">{friends.map((f) => <label key={f.id} className="chip chip-btn" style={{ cursor: "pointer", gap: 8 }} aria-pressed={sel.has(f.id)}><input type="checkbox" className="check" style={{ width: 16, height: 16 }} checked={sel.has(f.id)} onChange={() => toggle(f.id)} />{f.name}</label>)}</div></fieldset>
    <Field label="Who paid?"><select className="select" value={payer} onChange={(e) => setPayer(e.target.value)}><option value="me">I paid</option>{friends.filter((f) => sel.has(f.id)).map((f) => <option key={f.id} value={f.id}>{f.name} paid</option>)}</select></Field>
    {sel.size > 0 && total && <p className="small" style={{ margin: 0 }}>{people} people · each share <strong>{fm(share, cur)}</strong>. {payer === "me" ? `Each friend will owe you ${fm(share, cur)}.` : `You'll owe ${friends.find((f) => f.id === payer)?.name} ${fm(share, cur)}.`}</p>}
    {payer === "me" && <label className="flex items-center gap-2 small"><input type="checkbox" className="check" checked={addExpense} onChange={(e) => setAddExpense(e.target.checked)} /> Also record my share as an expense</label>}
    <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending || sel.size < 1}>Record split</button></div></form></Modal>);
}
