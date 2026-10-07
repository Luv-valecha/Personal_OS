"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Timer } from "lucide-react";
import TaskRow from "@/components/tasks/TaskRow";
import { fmtTime, fmtDuration, urgency, relDay } from "@/lib/dates";
import { Empty } from "@/components/ui/misc";

export default function TodayTimeline({ data, ctx, full = false }) {
  const t = data.timeline || { events: [], focus: [], tasks: [], deadlines: [] };
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(Date.now()); const i = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(i); }, []);
  const rows = [
    ...t.events.map((e) => ({ k: "event", id: e.id + e.occurrence, at: new Date(e.starts_at).getTime(), end: new Date(e.ends_at).getTime(), label: e.title, sub: e.location, all: e.all_day, ts: e.starts_at })),
    ...t.focus.map((f) => ({ k: "focus", id: f.id, at: new Date(f.started_at).getTime(), end: new Date(f.started_at).getTime() + f.seconds * 1000, label: `Focus${f.label ? " — " + f.label : ""}`, sub: fmtDuration(f.seconds), ts: f.started_at })),
  ].sort((a, b) => a.at - b.at);
  const nextIdx = now ? rows.findIndex((r) => r.end > now) : -1; const empty = !rows.length && !t.tasks.length && !t.deadlines.length;
  return (<>
    <div className="card-title"><span>Today&apos;s timeline</span><Link href="/calendar?view=day" className="small">Calendar</Link></div>
    {empty ? <Empty title="A clear day" hint="No events, tasks or deadlines today." /> : <>
      {rows.map((r, i) => { const past = now && r.end <= now; const next = i === nextIdx;
        return (<div key={r.id} className="list-row" style={{ opacity: past ? 0.5 : 1, alignItems: "baseline" }} aria-current={next ? "step" : undefined}>
          <span className="small muted" style={{ width: 46, fontVariantNumeric: "tabular-nums" }}>{r.all ? "All day" : fmtTime(r.ts, ctx.tz)}</span>
          <span style={{ color: next ? "var(--color-primary)" : "var(--color-text-muted)", display: "grid" }}>{r.k === "focus" ? <Timer size={13} /> : <CalendarDays size={13} />}</span>
          <span className="grow trunc" style={{ fontWeight: next ? 600 : 400 }}>{r.label}{r.sub && <span className="small muted"> · {r.sub}</span>}</span>
          {next && <span className="chip chip-active">Next</span>}</div>); })}
      {(t.tasks.length > 0 || t.deadlines.length > 0) && <div className="small muted" style={{ margin: "10px 0 2px" }}>Anytime today</div>}
      {t.deadlines.map((d) => <div key={d.id} className="list-row small"><span className={`dot ${urgency(d.due_date, ctx.today)}`} /><span className="grow trunc">{d.title}</span><span className="muted">{relDay(d.due_date, ctx.today)}</span></div>)}
      {full && t.tasks.map((x) => <TaskRow key={x.id} task={x} today={ctx.today} compact />)}
    </>}
  </>);
}
