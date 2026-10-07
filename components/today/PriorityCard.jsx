"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play, ArrowRight, Plus } from "lucide-react";
import { useFocus, fmtClock } from "@/components/shell/FocusProvider";
import { relDay } from "@/lib/dates";

export default function PriorityCard({ data, ctx }) {
  const p = data.priority; const f = useFocus(); const router = useRouter();
  if (!p) return (<><div className="card-title"><span>Priority now</span></div>
    <p style={{ margin: 0 }}>Nothing pressing. You&apos;re clear — add a task or take a break.</p>
    <Link href="/tasks" className="btn btn-sm mt-3"><Plus size={14} /> Add a task</Link></>);
  const running = f?.t?.taskId === p.id;
  const minutes = Math.min(Math.max(p.estimate_minutes || 25, 5), 90);
  function start() {
    if (running) { router.push("/focus"); return; }
    if (f?.t && !confirm("A focus timer is already running. Replace it?")) return;
    f.start("focus", minutes, p.title, p.id); router.push("/focus");
  }
  return (<>
    <div className="card-title"><span>Priority now</span>{p.project_name && <span className="chip">{p.project_name}</span>}</div>
    <h2 style={{ fontSize: 22, lineHeight: 1.25, margin: "0 0 6px" }}>{p.title}</h2>
    <div className="flex flex-wrap gap-x-3 gap-y-1 small muted mb-4">
      {p.due_date && <span className={p.overdue ? "pri-high" : ""}>{p.dueToday ? "Due today" : p.overdue ? `Overdue · ${relDay(p.due_date, ctx.today)}` : `Due ${relDay(p.due_date, ctx.today).toLowerCase()}`}</span>}
      {p.priority === "high" && <span className="pri-high">High priority</span>}
      {p.estimate_minutes ? <span>~{p.estimate_minutes} min estimated</span> : null}
      {p.why.filter((w) => !/^Due|^Overdue|^High/.test(w)).map((w) => <span key={w}>{w}</span>)}
    </div>
    <div className="flex flex-wrap gap-2">
      <button className="btn btn-primary" onClick={start}><Play size={15} /> {running ? `Focusing · ${fmtClock(f.remaining)}` : `Start focus · ${minutes} min`}</button>
      <Link className="btn" href={`/tasks?open=${p.id}`}>View task <ArrowRight size={14} /></Link>
    </div></>);
}
