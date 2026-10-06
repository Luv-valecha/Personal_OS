"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import { Field } from "@/components/ui/Fields";
import { Empty, Progress } from "@/components/ui/misc";
import { useAction } from "@/components/ui/useAction";
import { createExpense, deleteExpense } from "@/actions/expenses";
import { money as fm } from "@/lib/format";
import { addDays, fmtDate } from "@/lib/dates";

const CATS = ["food", "transport", "shopping", "bills", "entertainment", "health", "other"];
export default function ExpensesClient({ money, recent, cats, daily, today, currency, budget }) {
  const { run, pending } = useAction(); const [f, setF] = useState({ amount: "", category: "food", description: "", spent_on: today }); const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function add(e) { e.preventDefault(); if (await run(() => createExpense(f), { ok: "Expense added" })) setF({ ...f, amount: "", description: "" }); }
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)); const vals = days.map((d) => daily.find((x) => x.day === d)?.total || 0); const max = Math.max(1, ...vals); const catTotal = cats.reduce((s, c) => s + c.total, 0) || 1;
  return (<>
    <PageHead title="Expenses" sub="A light personal summary. Group splits live in HisaabKitaab." />
    <div className="grid grid-cols-3 gap-3 mb-4">{[["Today", money.today], ["This week", money.week], ["This month", money.month]].map(([l, v]) => <div key={l} className="card"><div className="stat">{fm(v, currency)}</div><div className="sub">{l}</div></div>)}</div>
    {budget > 0 && <div className="card mb-4"><div className="flex justify-between small muted mb-2"><span>Monthly budget</span><span>{fm(money.month, currency)} of {fm(budget, currency)} · {fm(Math.max(0, budget - money.month), currency)} left</span></div><Progress value={(money.month / budget) * 100} label="Budget used" /></div>}
    <form onSubmit={add} className="card mb-4"><div className="card-title">Add expense</div>
      <div className="form-grid two"><Field label={`Amount (${currency})`}><input className="input" inputMode="decimal" required value={f.amount} onChange={set("amount")} placeholder="0" /></Field>
        <Field label="Category"><input className="input" list="exp-cats" value={f.category} onChange={set("category")} /></Field>
        <Field label="Description"><input className="input" value={f.description} onChange={set("description")} /></Field>
        <Field label="Date"><input className="input" type="date" value={f.spent_on} onChange={set("spent_on")} /></Field></div>
      <datalist id="exp-cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="mt-3"><button className="btn btn-primary" disabled={pending}><Plus size={16} /> Add expense</button></div></form>
    <div className="grid gap-4 lg:grid-cols-2 mb-4">
      <div className="card"><div className="card-title">Last 14 days</div>
        <svg viewBox="0 0 280 110" width="100%" role="img" aria-label="Daily spending, last 14 days" preserveAspectRatio="none" style={{ height: 120 }}>
          {vals.map((v, i) => <rect key={i} x={i * 20 + 2} width="14" rx="3" y={100 - (v / max) * 92} height={Math.max(v ? 3 : 1, (v / max) * 92)} fill={v ? "var(--color-primary)" : "var(--color-border)"}><title>{days[i]}: {fm(v, currency)}</title></rect>)}</svg>
        <div className="flex justify-between small muted"><span>{fmtDate(days[0])}</span><span>Today</span></div></div>
      <div className="card"><div className="card-title">This month by category</div>{cats.length === 0 ? <Empty title="No spending this month" /> : cats.map((c) => <div key={c.category} className="mb-3"><div className="flex justify-between small mb-1"><span>{c.category}</span><span className="muted">{fm(c.total, currency)} · {Math.round((c.total / catTotal) * 100)}%</span></div><Progress value={(c.total / catTotal) * 100} label={c.category} /></div>)}</div>
    </div>
    <div className="card" style={{ padding: 8 }}><div className="card-title" style={{ padding: "8px 8px 0" }}>Recent</div>{recent.length === 0 ? <Empty title="No expenses yet" /> : recent.map((r) => <div key={r.id} className="list-row"><span className="small muted" style={{ width: 54 }}>{fmtDate(r.spent_on)}</span><span className="grow trunc">{r.description || r.category} <span className="chip ml-1">{r.category}</span></span><strong>{fm(r.amount, currency)}</strong>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => confirm("Delete this expense?") && run(() => deleteExpense(r.id), { ok: "Deleted" })} aria-label="Delete expense"><Trash2 size={14} /></button></div>)}</div>
  </>);
}
