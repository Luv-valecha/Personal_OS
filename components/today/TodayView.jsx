"use client";
import Link from "next/link";
import ViewTabs from "@/components/today/ViewTabs";
import PriorityCard from "@/components/today/PriorityCard";
import TodayTimeline from "@/components/today/TodayTimeline";
import { OverviewWidget, TasksWidget, DeadlinesWidget, FocusWidget } from "@/components/dashboard/widgets";
import { Empty, Progress } from "@/components/ui/misc";
import { relDay } from "@/lib/dates";

export default function TodayView({ data, ctx, greeting, dateLabel, notifications, projectWork }) {
  const dl = { ...data, deadlines: (data.deadlines || []).filter((d) => d.due_date <= ctx.nextWeek) };
  return (<>
    <div className="page-head"><div><h1 style={{ fontSize: 26 }}>{greeting}</h1><p className="sub">{dateLabel}</p><div className="mt-3"><ViewTabs active="today" /></div></div></div>
    <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
      <div className="flex flex-col gap-4 min-w-0">
        <section className="card" aria-label="Priority now"><PriorityCard data={data} ctx={ctx} /></section>
        <section className="card" aria-label="Today's timeline" id="schedule"><TodayTimeline data={data} ctx={ctx} /></section>
        <section className="card" aria-label="Summary"><OverviewWidget data={data} ctx={ctx} /></section>
      </div>
      <div className="flex flex-col gap-4 min-w-0">
        <section className="card" aria-label="Today's tasks"><TasksWidget data={data} ctx={ctx} /></section>
        <section className="card" aria-label="Deadlines this week"><DeadlinesWidget data={dl} ctx={ctx} /></section>
        <section className="card" aria-label="Focus"><FocusWidget data={data} ctx={ctx} /></section>
        <section className="card" aria-label="Needs attention"><div className="card-title"><span>Needs attention</span></div>
          {notifications.length === 0 ? <Empty title="All caught up" /> : notifications.slice(0, 5).map((n) => <Link key={n.id} href={n.href} className="list-row"><span className={`dot ${n.tone}`} /><span className="grow small">{n.text}</span></Link>)}</section>
        <section className="card" aria-label="Project work"><div className="card-title"><span>Project work today</span><Link href="/projects" className="small">Projects</Link></div>
          {projectWork.length === 0 ? <Empty title="No project tasks due" /> : projectWork.map((p) => <Link key={p.id} href="/projects" className="block py-2"><div className="flex justify-between gap-2"><span className="trunc">{p.name}</span><span className="small muted">{p.due} due · {p.done}/{p.total}</span></div><div className="mt-1.5"><Progress value={p.total ? (p.done / p.total) * 100 : 0} label={`${p.name} progress`} /></div></Link>)}</section>
      </div>
    </div></>);
}
