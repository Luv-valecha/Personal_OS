"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, TrendingUp, TrendingDown } from "lucide-react";
import Modal from "@/components/ui/Modal";
import PageHead from "@/components/ui/PageHead";
import { Field } from "@/components/ui/Fields";
import { Empty, Progress } from "@/components/ui/misc";
import { Bars, Line, Donut } from "@/components/charts/Charts";
import { useAction } from "@/components/ui/useAction";
import { createExpense, updateExpense, deleteExpense } from "@/actions/expenses";
import { money as fm } from "@/lib/format";
import { fmtDate } from "@/lib/dates";

const CATS = ["food", "transport", "shopping", "bills", "entertainment", "health", "other"];
const PRESETS = [["today", "Today"], ["week", "This week"], ["last_7_days", "7 days"], ["last_30_days", "30 days"], ["month", "This month"], ["last_month", "Last month"], ["last_90_days", "90 days"], ["year", "This year"], ["all", "All time"]];
const Kpi = ({ label, value, sub, tone }) => <div className="card" style={{ padding: 12 }}><div className="stat" style={{ fontSize: 20 }}>{value}</div><div className="sub">{label}</div>{sub && <div className="small" style={{ color: tone === "bad" ? "var(--c-red)" : tone === "good" ? "var(--c-green)" : "var(--color-text-muted)" }}>{sub}</div>}</div>;

export default function ExpensesClient({ money, stats: s, recent, categories, filters, today, currency, budget }) {
  const router = useRouter(); const { run, pending } = useAction(); const cur = currency;
  const [f, setF] = useState({ amount: "", category: "food", description: "", spent_on: today }); const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const [custom, setCustom] = useState({ from: filters.from, to: filters.to }); const [cat, setCat] = useState(filters.category); const [q, setQ] = useState(filters.q);
  const go = (o) => { const p = new URLSearchParams(); const next = { range: filters.preset, ...(filters.preset === "custom" ? { from: filters.from, to: filters.to } : {}), cat, q, ...o }; Object.entries(next).forEach(([k, v]) => v && p.set(k, v)); router.push("/expenses?" + p.toString()); };
  const [editing, setEditing] = useState(null);
  async function add(e) { e.preventDefault(); if (await run(() => createExpense(f), { ok: "Expense added" })) setF({ ...f, amount: "", description: "" }); }
  const vals = s.daily.map((d) => d.total); let acc = 0; const cum = s.daily.map((d) => ({ value: (acc += d.total) }));
  const long = s.daily.length > 45; const pc = s.previous_period.change_pct;
  return (<>
    <PageHead title="Expenses" sub="Analyse your spending. Group splits with friends live in Splits." />
    <div className="card mb-4" style={{ padding: 12 }}>
      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Date range">{PRESETS.map(([k, l]) => <button key={k} type="button" className="chip chip-btn" aria-pressed={filters.preset === k} onClick={() => go({ range: k, from: "", to: "" })}>{l}</button>)}
        <button type="button" className="chip chip-btn" aria-pressed={filters.preset === "custom"} onClick={() => go({ range: "custom", from: custom.from, to: custom.to })}>Custom</button></div>
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="From"><input type="date" className="input" value={custom.from} max={today} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
        <Field label="To"><input type="date" className="input" value={custom.to} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field>
        <button className="btn" onClick={() => go({ range: "custom", from: custom.from, to: custom.to })} disabled={!custom.from || !custom.to}>Apply range</button>
        <Field label="Category"><select className="select" value={cat} onChange={(e) => { setCat(e.target.value); go({ cat: e.target.value }); }}><option value="">All categories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        <form onSubmit={(e) => { e.preventDefault(); go({ q }); }}><Field label="Description contains"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="coffee" /></Field></form></div>
      <p className="small muted" style={{ margin: "10px 0 0" }}>{fmtDate(s.range.from, { day: "numeric", month: "short", year: "numeric" })} → {fmtDate(s.range.to, { day: "numeric", month: "short", year: "numeric" })} · {s.range.days} day{s.range.days > 1 ? "s" : ""}{filters.category && ` · ${filters.category}`}{filters.q && ` · “${filters.q}”`}</p></div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <Kpi label="Total spent" value={fm(s.total, cur)} sub={pc === null ? "no previous period" : `${pc > 0 ? "▲" : "▼"} ${Math.abs(pc)}% vs previous ${s.range.days}d`} tone={pc === null ? "" : pc > 0 ? "bad" : "good"} />
      <Kpi label="Average / day" value={fm(s.average_per_day, cur)} sub={`${fm(s.average_per_active_day, cur)} on days with spending`} />
      <Kpi label="Average / expense" value={fm(s.average_per_expense, cur)} sub={`median ${fm(s.median, cur)}`} />
      <Kpi label="Expenses" value={s.count} sub={`${s.active_days} active · ${s.no_spend_days} no-spend days`} />
      <Kpi label="Highest" value={fm(s.max, cur)} sub={s.top_expenses[0]?.description || s.top_expenses[0]?.category} />
      <Kpi label="Lowest" value={fm(s.min, cur)} />
      <Kpi label="Weekend vs weekday" value={`${fm(s.weekend_total, cur)}`} sub={`weekday ${fm(s.weekday_total, cur)}`} />
      <Kpi label="Month-end forecast" value={s.forecast ? fm(s.forecast.projected_month_total, cur) : "—"} sub={s.forecast ? `${fm(s.forecast.month_so_far, cur)} so far` : "only for ranges including today"} />
    </div>
    {budget > 0 && <div className="card mb-4"><div className="flex justify-between small muted mb-2"><span>Monthly budget</span><span>{fm(money.month, cur)} of {fm(budget, cur)} · {fm(Math.max(0, budget - money.month), cur)} left</span></div><Progress value={(money.month / budget) * 100} label="Budget used" /></div>}

    {s.count === 0 ? <div className="card mb-4"><Empty title="No expenses in this range" hint="Try a wider date range or clear the filters." /></div> : <>
      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <div className="card"><div className="card-title">{long ? "Daily spending" : "Daily spending"}</div><Bars data={s.daily.map((d) => ({ label: d.day, value: d.total, title: fmtDate(d.day) }))} cur={cur} labelEvery={Math.ceil(s.daily.length / 8)} fmtLabel={(d) => fmtDate(d, { day: "numeric", month: "short" })} ariaLabel="Daily spending" /></div>
        <div className="card"><div className="card-title">Cumulative</div><Line points={cum} cur={cur} ariaLabel="Cumulative spending" /></div></div>
      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <div className="card"><div className="card-title">By category</div><Donut items={s.by_category.map((c) => ({ label: c.category, value: c.total }))} cur={cur} /></div>
        <div className="card"><div className="card-title">By weekday</div><Bars data={s.by_weekday.map((d) => ({ label: d.weekday, value: d.total }))} cur={cur} ariaLabel="Spending by weekday" /></div></div>
      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <div className="card"><div className="card-title">Monthly trend (12 months)</div><Bars data={s.by_month.map((m) => ({ label: m.month, value: m.total }))} cur={cur} fmtLabel={(m) => m.slice(2).replace("-", "/")} ariaLabel="Monthly spending" /></div>
        <div className="card"><div className="card-title">Top expenses &amp; items</div>{s.top_expenses.map((e) => <div key={e.id} className="list-row small"><span className="muted" style={{ width: 52 }}>{fmtDate(e.date)}</span><span className="grow trunc">{e.description || e.category}</span><strong>{fm(e.amount, cur)}</strong></div>)}
          {s.top_descriptions.length > 0 && <><div className="sub mt-3 mb-1">Most spent on</div>{s.top_descriptions.map((d) => <div key={d.label} className="list-row small"><span className="grow trunc">{d.label}</span><span className="muted">{d.count}×</span><strong>{fm(d.total, cur)}</strong></div>)}</>}</div></div></>}

    <form onSubmit={add} className="card mb-4"><div className="card-title">Add expense</div>
      <div className="form-grid two"><Field label={`Amount (${cur})`}><input className="input" inputMode="decimal" required value={f.amount} onChange={set("amount")} placeholder="0" /></Field>
        <Field label="Category"><input className="input" list="exp-cats" value={f.category} onChange={set("category")} /></Field>
        <Field label="Description"><input className="input" value={f.description} onChange={set("description")} /></Field>
        <Field label="Date"><input className="input" type="date" value={f.spent_on} onChange={set("spent_on")} /></Field></div>
      <datalist id="exp-cats">{[...new Set([...CATS, ...categories])].map((c) => <option key={c} value={c} />)}</datalist>
      <div className="mt-3"><button className="btn btn-primary" disabled={pending}><Plus size={16} /> Add expense</button></div></form>
    {editing && <ExpenseEditor key={editing.id} exp={editing} cur={cur} categories={[...new Set([...CATS, ...categories])]} onClose={() => setEditing(null)} />}
    <div className="card" style={{ padding: 8 }}><div className="card-title" style={{ padding: "8px 8px 0" }}>Expenses in range</div>{recent.length === 0 ? <Empty title="No expenses" /> : recent.map((r) => <div key={r.id} className="list-row"><span className="small muted" style={{ width: 54 }}>{fmtDate(r.spent_on)}</span><span className="grow trunc">{r.description || r.category} <span className="chip ml-1">{r.category}</span></span><strong>{fm(r.amount, cur)}</strong>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditing(r)} aria-label={`Edit expense: ${r.description || r.category}`}><Pencil size={14} /></button>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => confirm("Delete this expense?") && run(() => deleteExpense(r.id), { ok: "Deleted" })} aria-label="Delete expense"><Trash2 size={14} /></button></div>)}</div>
  </>);
}

function ExpenseEditor({ exp, cur, categories, onClose }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ amount: String(exp.amount), category: exp.category || "other", description: exp.description || "", spent_on: String(exp.spent_on).slice(0, 10) });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e) { e.preventDefault(); if (pending) return; if (await run(() => updateExpense(exp.id, f), { ok: "Expense updated" })) onClose(); }
  return (<Modal open onClose={onClose} title="Edit expense"><form onSubmit={save} className="flex flex-col gap-3">
    <div className="form-grid two"><Field label={`Amount (${cur})`}><input className="input" inputMode="decimal" required value={f.amount} onChange={set("amount")} autoFocus /></Field>
      <Field label="Date"><input className="input" type="date" required value={f.spent_on} onChange={set("spent_on")} /></Field>
      <Field label="Category"><input className="input" list="exp-cats-edit" value={f.category} onChange={set("category")} /></Field>
      <Field label="Description"><input className="input" value={f.description} onChange={set("description")} maxLength={300} /></Field></div>
    <datalist id="exp-cats-edit">{categories.map((c) => <option key={c} value={c} />)}</datalist>
    <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button></div></form></Modal>);
}
