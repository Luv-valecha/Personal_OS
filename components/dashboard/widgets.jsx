"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloudSun, MapPin } from "lucide-react";
import TaskRow from "@/components/tasks/TaskRow";
import SortableTaskList from "@/components/tasks/SortableTaskList";
import SortSelect from "@/components/tasks/SortSelect";
import { sortTasks } from "@/lib/tasksort";
import { setTaskSort } from "@/actions/tasks";
import { Empty, Progress } from "@/components/ui/misc";
import { useFocus, fmtClock } from "@/components/shell/FocusProvider";
import { relDay, urgency, fmtTime, fmtDuration, fmtDate, dateInTz, diffDays } from "@/lib/dates";
import { money, activityText, relTime, STATUS_LABEL } from "@/lib/format";
import { updatePreferences } from "@/actions/settings";
import { useAction } from "@/components/ui/useAction";
import PriorityCard from "@/components/today/PriorityCard";
import TodayTimeline from "@/components/today/TodayTimeline";
import QuickLinksWidget from "@/components/quicklinks/QuickLinksWidget";

const Title = ({ children, href, link = "Open" }) => <div className="card-title"><span>{children}</span>{href && <Link href={href} className="small">{link}</Link>}</div>;

export function OverviewWidget({ data, ctx }) {
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(new Date()); const i = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(i); }, []);
  const tasks = data.tasks || []; const todays = tasks.filter((t) => t.due_date === ctx.today || t.completed);
  const doneN = todays.filter((t) => t.completed).length; const open = tasks.filter((t) => !t.completed).length;
  const todayEvents = (data.events || []).filter((e) => dateInTz(e.starts_at, ctx.tz) === ctx.today);
  const next = (data.events || []).find((e) => new Date(e.ends_at) > new Date());
  const dl = (data.deadlines || []).filter((d) => diffDays(d.due_date, ctx.today) <= 7);
  const stat = (n, l) => <div><div className="stat">{n}</div><div className="sub">{l}</div></div>;
  return (<>
    <Title>Today</Title>
    <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
      <div className="sub">{now ? now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ctx.tz }) : "—"}</div>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
      {stat(todayEvents.length, todayEvents.length === 1 ? "event" : "events")}
      {stat(data.dlToday?.n ?? 0, (data.dlToday?.n ?? 0) === 1 ? "deadline due" : "deadlines due")}
      {stat(open, open === 1 ? "task open" : "tasks open")}
      {stat(doneN, "completed")}
      {stat(money(data.money?.today || 0, ctx.currency), "spent")}
      {stat(fmtDuration(data.focus?.today || 0), "focus")}
    </div>
    <div className="mt-4 grid gap-1 small muted">
      {next && <div>Next event: <span style={{ color: "var(--color-text)" }}>{next.title}</span> · {dateInTz(next.starts_at, ctx.tz) === ctx.today ? fmtTime(next.starts_at, ctx.tz) : `${relDay(dateInTz(next.starts_at, ctx.tz), ctx.today)} ${fmtTime(next.starts_at, ctx.tz)}`}</div>}
      {dl[0] && <div>Next deadline: <span style={{ color: "var(--color-text)" }}>{dl[0].title}</span> · {relDay(dl[0].due_date, ctx.today)}</div>}
      {!next && !dl[0] && <div>Nothing scheduled soon.</div>}
    </div>
  </>);
}
export function TasksWidget({ data, ctx }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [mode, setMode] = useState(ctx.taskSort || "manual");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setMode(ctx.taskSort || "manual");
  }, [ctx.taskSort]);

  // Project filter: only projects that currently have tasks are offered. "__none" = tasks without a project.
  const [proj, setProj] = useState("");
  useEffect(() => { try { setProj(localStorage.getItem("dash.taskProject") || ""); } catch {} }, []);
  const projects = [...new Map((data.tasks || []).filter((t) => t.project_id).map((t) => [t.project_id, t.project_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const hasNone = (data.tasks || []).some((t) => !t.project_id);
  const activeProj = proj === "__none" ? proj : projects.some(([id]) => id === proj) ? proj : "";   // a deleted project falls back to "All"
  const pickProj = (v) => { setProj(v); setExpanded(false); try { v ? localStorage.setItem("dash.taskProject", v) : localStorage.removeItem("dash.taskProject"); } catch {} };
  const scoped = (data.tasks || []).filter((t) => !activeProj || (activeProj === "__none" ? !t.project_id : t.project_id === activeProj));
  const allTasks = sortTasks(scoped, mode);
  const tasks = expanded ? allTasks : allTasks.slice(0, 5);

  const change = async (m) => {
    const prev = mode;
    setMode(m);

    const r = await run(() => setTaskSort(m));

    if (!r) setMode(prev);
  };

  return (
    <>
      <div className="card-title">
        <span>All tasks ({allTasks.length})</span>

        <span className="flex items-center gap-3">
          {(projects.length > 0) && (
            <select className="select" style={{ maxWidth: 140, padding: "2px 6px", fontSize: 12 }} value={activeProj} onChange={(e) => pickProj(e.target.value)} aria-label="Filter tasks by project">
              <option value="">All projects</option>
              {projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              {hasNone && <option value="__none">No project</option>}
            </select>)}
          <SortSelect
            value={mode}
            onChange={change}
            pending={pending}
          />
        </span>
      </div>

      {allTasks.length === 0 ? (
        <Empty
          title={activeProj ? "No tasks in this project" : "No tasks yet"}
          hint={activeProj ? "Pick another project or All projects." : "Add a task with the + button."}
        />
      ) : (
        <>
          <SortableTaskList
            tasks={tasks}
            today={ctx.today}
            compact
            onOpen={(t) => router.push(`/tasks?open=${t.id}`)}
            canDrag={mode === "manual"}
          />

          {allTasks.length > 5 && (
            <div style={{ marginTop: "8px", textAlign: "center" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded
                  ? "Show less"
                  : `Show all ${allTasks.length} tasks`}
              </button>
            </div>
          )}

          {mode !== "manual" && allTasks.length > 1 && (
            <p
              className="small muted"
              style={{ margin: "8px 0 0" }}
            >
              Sorted automatically. Switch to{" "}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => change("manual")}
              >
                Manual
              </button>{" "}
              to drag-reorder (your saved order is kept).
            </p>
          )}
        </>
      )}
    </>
  );
}
export function DeadlinesWidget({ data, ctx }) {
  const d = data.deadlines || [];
  return (<><Title href="/deadlines">Deadlines</Title>
    {d.length === 0 ? <Empty title="No deadlines" hint="You're clear." /> : d.slice(0, 5).map((x) => (
      <Link key={x.id} href={`/deadlines?open=${x.id}`} className="list-row"><span className={`dot ${urgency(x.due_date, ctx.today)}`} /><span className="grow trunc">{x.title}</span><span className="small muted">{relDay(x.due_date, ctx.today)}</span></Link>))}</>);
}
export function CalendarWidget({ data, ctx }) {
  const e = (data.events || []).filter((x) => new Date(x.ends_at) > new Date()).slice(0, 5);
  return (<><Title href="/calendar">Upcoming events</Title>
    {e.length === 0 ? <Empty title="No events this week" /> : e.map((x) => (
      <Link key={x.id + x.occurrence} href={`/calendar?open=${x.id}`} className="list-row"><span className="small muted" style={{ width: 84 }}>{relDay(dateInTz(x.starts_at, ctx.tz), ctx.today)}</span><span className="grow trunc">{x.title}</span><span className="small muted">{fmtTime(x.starts_at, ctx.tz)}</span></Link>))}</>);
}
export function MoneyWidget({ data, ctx }) {
  const m = data.money || { today: 0, week: 0, month: 0 }; const pct = ctx.budget > 0 ? (m.month / ctx.budget) * 100 : 0;
  return (<><Title href="/expenses">Money</Title>
    <div className="grid grid-cols-3 gap-2"><div><div className="stat" style={{ fontSize: 20 }}>{money(m.today, ctx.currency)}</div><div className="sub">Today</div></div>
      <div><div className="stat" style={{ fontSize: 20 }}>{money(m.week, ctx.currency)}</div><div className="sub">Week</div></div>
      <div><div className="stat" style={{ fontSize: 20 }}>{money(m.month, ctx.currency)}</div><div className="sub">Month</div></div></div>
    <div className="mt-4">{ctx.budget > 0 ? <><div className="flex justify-between small muted mb-1"><span>Budget</span><span>{Math.round(pct)}% of {money(ctx.budget, ctx.currency)}</span></div><Progress value={pct} label="Monthly budget used" /></> : <Link href="/settings" className="small muted">Set a monthly budget →</Link>}</div></>);
}
export function SplitsWidget({ data, ctx }) {
  const f = data.splits || []; const owed = f.reduce((s, x) => s + Math.max(0, x.balance), 0), owe = f.reduce((s, x) => s + Math.max(0, -x.balance), 0); const open = f.filter((x) => Math.abs(x.balance) > 0.004).slice(0, 3);
  return (<><Title href="/splits">Splits</Title>
    <div className="grid grid-cols-2 gap-2"><div><div className="stat" style={{ fontSize: 20, color: "var(--c-green)" }}>{money(owed, ctx.currency)}</div><div className="sub">You are owed</div></div><div><div className="stat" style={{ fontSize: 20, color: "var(--c-red)" }}>{money(owe, ctx.currency)}</div><div className="sub">You owe</div></div></div>
    <div className="mt-3">{f.length === 0 ? <Link href="/splits" className="small muted">Add a friend to start tracking →</Link> : open.length === 0 ? <div className="small muted">Everyone is settled up.</div> : open.map((x) => <Link key={x.id} href={`/splits?friend=${x.id}`} className="list-row small"><span className="grow trunc">{x.name}</span><span style={{ color: x.balance > 0 ? "var(--c-green)" : "var(--c-red)" }}>{x.balance > 0 ? "owes " : "you owe "}{money(Math.abs(x.balance), ctx.currency)}</span></Link>)}</div></>);
}
export function ProjectsWidget({ data }) {
  const p = data.projects || [];
  return (<><Title href="/projects">Projects</Title>
    {p.length === 0 ? <Empty title="No active projects" /> : p.map((x) => {
      const pct = x.total ? (x.done / x.total) * 100 : 0; return (
        <Link href="/projects" key={x.id} className="block py-2"><div className="flex justify-between gap-2"><span className="trunc">{x.name}</span><span className="small muted">{x.done}/{x.total}</span></div><div className="mt-1.5"><Progress value={pct} label={`${x.name} progress`} /></div></Link>);
    })}</>);
}
export function NotesWidget({ data }) {
  const n = data.notes || [];
  return (<><Title href="/notes">Notes</Title>
    {n.length === 0 ? <Empty title="No notes yet" /> : n.map((x) => (
      <Link key={x.id} href={`/notes?open=${x.id}`} className="list-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 0 }}><span className="trunc w-full">{x.pinned ? "📌 " : ""}{x.title || "Untitled"}</span><span className="small muted trunc w-full">{x.body.replace(/[#*`>\-\[\]]/g, "").slice(0, 80)}</span></Link>))}</>);
}
export function FocusWidget({ data }) {
  const f = useFocus(); const today = data.focus?.today || 0;
  return (<><Title href="/focus" link={f?.t ? "Open" : "Start"}>Focus</Title>
    {f?.t ? <div><div className="sub">{f.t.kind === "focus" ? "Focusing" : "Break"}{f.t.label ? ` · ${f.t.label}` : ""}</div><div className="stat" style={{ fontSize: 38 }} aria-live="off">{fmtClock(f.remaining)}</div>
      <div className="flex gap-2 mt-2">{f.t.running ? <button className="btn btn-sm" onClick={f.pause}>Pause</button> : <button className="btn btn-sm btn-primary" onClick={f.resume}>Resume</button>}<button className="btn btn-sm btn-ghost" onClick={f.reset}>Reset</button></div></div>
      : <div><div className="stat">{fmtDuration(today)}</div><div className="sub">focused today · {data.focus?.week ? fmtDuration(data.focus.week) : "0m"} this week</div><Link href="/focus?start=1" className="btn btn-sm btn-primary mt-3">Start 25 min</Link></div>}</>);
}
export function ActivityWidget({ data, ctx }) {
  const a = data.activity || [];
  return (<><Title href="/activity">Activity</Title>
    {a.length === 0 ? <Empty title="No activity yet" /> : a.slice(0, 6).map((x) => <div key={x.id} className="list-row small"><span className="muted" style={{ width: 62 }} suppressHydrationWarning>{relTime(x.created_at, ctx.tz)}</span><span className="grow trunc">{activityText(x)}</span></div>)}</>);
}

const WMO = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Snow", 73: "Snow", 75: "Heavy snow", 80: "Showers", 81: "Showers", 82: "Heavy showers", 95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm" };
export function WeatherWidget({ ctx }) {
  const [state, setState] = useState({ status: ctx.city ? "loading" : "empty" }); const [city, setCity] = useState(ctx.city || ""); const { run } = useAction(); const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!ctx.city) { setState({ status: "empty" }); return; }
    let dead = false; const key = "wx:" + ctx.city.toLowerCase();
    try { const c = JSON.parse(sessionStorage.getItem(key) || "null"); if (c && Date.now() - c.at < 30 * 60 * 1000) { setState({ status: "ok", ...c.v }); return; } } catch { }
    setState({ status: "loading" });
    (async () => {
      try {
        const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ctx.city)}&count=1`)).json();
        const p = g.results?.[0]; if (!p) throw new Error("City not found");
        const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`)).json();
        const v = { name: p.name, temp: Math.round(w.current.temperature_2m), code: w.current.weather_code, wind: Math.round(w.current.wind_speed_10m), hi: Math.round(w.daily.temperature_2m_max[0]), lo: Math.round(w.daily.temperature_2m_min[0]) };
        try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), v })); } catch { }
        if (!dead) setState({ status: "ok", ...v });
      } catch (e) { if (!dead) setState({ status: "error", msg: e.message === "City not found" ? "City not found. Check the spelling in Settings." : "Weather is unavailable right now." }); }
    })();
    return () => { dead = true; };
  }, [ctx.city, tick]);
  return (<><Title href="/settings" link="City">Weather</Title>
    {state.status === "loading" && <div className="skeleton" style={{ height: 64 }} />}
    {state.status === "empty" && <form onSubmit={async (e) => { e.preventDefault(); if (city.trim()) await run(() => updatePreferences({ weather_city: city }), { ok: "City saved" }); }} className="flex gap-2"><input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Your city" aria-label="City" /><button className="btn btn-primary">Save</button></form>}
    {state.status === "error" && <div className="small muted">{state.msg} <button className="btn btn-sm ml-1" onClick={() => setTick((t) => t + 1)}>Retry</button></div>}
    {state.status === "ok" && <div className="flex items-center gap-3"><CloudSun size={30} className="muted" /><div><div className="stat">{state.temp}°C</div><div className="sub">{WMO[state.code] || "—"} · {state.lo}°/{state.hi}° · {state.wind} km/h</div><div className="sub flex items-center gap-1"><MapPin size={11} />{state.name}</div></div></div>}</>);
}
export function IdeasWidget({ data }) {
  const r = data.ideas || [];
  return (<><Title href="/ideas">Ideas{r[0]?.total > 5 ? ` · ${r[0].total}` : ""}</Title>
    {r.length === 0 ? <Empty title="No active ideas" hint="Capture one from the Ideas page." /> : r.map((x) => (
      <Link key={x.id} href={`/ideas?open=${x.id}`} className="list-row"><span className="grow trunc">{x.title}</span><span className="small muted">{x.project_name || x.status}</span></Link>))}</>);
}
export function BugsWidget({ data }) {
  const r = data.bugs || [];
  return (<><Title href="/projects">Open bugs{r[0]?.total > 5 ? ` · ${r[0].total}` : ""}</Title>
    {r.length === 0 ? <Empty title="No open bugs" hint="Log bugs inside a project." /> : r.map((x) => (
      <Link key={x.id} href="/projects" className="list-row"><span className="grow trunc">{x.title}</span>{x.priority === "high" && <span className="chip">high</span>}<span className="small muted trunc" style={{ maxWidth: 90 }}>{x.project_name}</span></Link>))}</>);
}
export function ChecklistsWidget({ data }) {
  const r = data.checklists || [];
  return (<><Title href="/checklists">Checklists</Title>
    {r.length === 0 ? <Empty title="No checklists" hint="Create one on the Checklists page." /> : r.map((x) => {
      const pct = x.total ? Math.round((x.done / x.total) * 100) : 0;
      return (<Link key={x.id} href="/checklists" className="list-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
        <span className="flex justify-between gap-2"><span className="trunc">{x.title}</span><span className="small muted">{x.done}/{x.total}</span></span>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${x.title} progress`}><i style={{ width: `${pct}%` }} /></div></Link>);
    })}</>);
}
export const WIDGET_COMPONENTS = { ideas: IdeasWidget, bugs: BugsWidget, checklists: ChecklistsWidget, splits: SplitsWidget, overview: OverviewWidget, priority: PriorityCard, timeline: TodayTimeline, quicklinks: QuickLinksWidget, tasks: TasksWidget, calendar: CalendarWidget, deadlines: DeadlinesWidget, money: MoneyWidget, projects: ProjectsWidget, notes: NotesWidget, focus: FocusWidget, weather: WeatherWidget, activity: ActivityWidget };
