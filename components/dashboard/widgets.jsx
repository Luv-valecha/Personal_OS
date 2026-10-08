"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudSun, MapPin } from "lucide-react";
import TaskRow from "@/components/tasks/TaskRow";
import { Empty, Progress } from "@/components/ui/misc";
import { useFocus, fmtClock } from "@/components/shell/FocusProvider";
import { relDay, urgency, fmtTime, fmtDuration, fmtDate, dateInTz, diffDays } from "@/lib/dates";
import { money, activityText, relTime, STATUS_LABEL } from "@/lib/format";
import { updatePreferences } from "@/actions/settings";
import { useAction } from "@/components/ui/useAction";
import { ChevronDown, ChevronUp } from "lucide-react";
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
  const t = (data.tasks || []).filter(task => task.completed === false);
  const [expanded, setExpanded] = useState(false);

  const visibleTasks = expanded ? t : t.slice(0, 5);
  const hasMore = t.length > 5;

  return (
    <>
      <Title href="/tasks" link="All tasks">
        All tasks
      </Title>

      {t.length === 0 ? (
        <Empty
          title="No tasks"
          hint="Add a task with the + button."
        />
      ) : (
        <>
          {visibleTasks.map((x) => (
            <TaskRow
              key={x.id}
              task={x}
              today={ctx.today}
              compact
            />
          ))}

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-sm muted"
              style={{
                background: "none",
                border: 0,
                cursor: "pointer",
                padding: "8px 0",
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {expanded ? (
                <>
                  <ChevronUp size={15} />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown size={15} />
                  Show {t.length - 5} more
                </>
              )}
            </button>
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
      <div key={x.id} className="list-row"><span className={`dot ${urgency(x.due_date, ctx.today)}`} /><span className="grow trunc">{x.title}</span><span className="small muted">{relDay(x.due_date, ctx.today)}</span></div>))}</>);
}
export function CalendarWidget({ data, ctx }) {
  const e = (data.events || []).filter((x) => new Date(x.ends_at) > new Date()).slice(0, 5);
  return (<><Title href="/calendar">Upcoming events</Title>
    {e.length === 0 ? <Empty title="No events this week" /> : e.map((x) => (
      <div key={x.id + x.occurrence} className="list-row"><span className="small muted" style={{ width: 84 }}>{relDay(dateInTz(x.starts_at, ctx.tz), ctx.today)}</span><span className="grow trunc">{x.title}</span><span className="small muted">{fmtTime(x.starts_at, ctx.tz)}</span></div>))}</>);
}
export function MoneyWidget({ data, ctx }) {
  const m = data.money || { today: 0, week: 0, month: 0 }; const pct = ctx.budget > 0 ? (m.month / ctx.budget) * 100 : 0;
  return (<><Title href="/expenses">Money</Title>
    <div className="grid grid-cols-3 gap-2"><div><div className="stat" style={{ fontSize: 20 }}>{money(m.today, ctx.currency)}</div><div className="sub">Today</div></div>
      <div><div className="stat" style={{ fontSize: 20 }}>{money(m.week, ctx.currency)}</div><div className="sub">Week</div></div>
      <div><div className="stat" style={{ fontSize: 20 }}>{money(m.month, ctx.currency)}</div><div className="sub">Month</div></div></div>
    <div className="mt-4">{ctx.budget > 0 ? <><div className="flex justify-between small muted mb-1"><span>Budget</span><span>{Math.round(pct)}% of {money(ctx.budget, ctx.currency)}</span></div><Progress value={pct} label="Monthly budget used" /></> : <Link href="/settings" className="small muted">Set a monthly budget →</Link>}</div></>);
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
      <Link key={x.id} href="/notes" className="list-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 0 }}><span className="trunc w-full">{x.pinned ? "📌 " : ""}{x.title || "Untitled"}</span><span className="small muted trunc w-full">{x.body.replace(/[#*`>\-\[\]]/g, "").slice(0, 80)}</span></Link>))}</>);
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
    {a.length === 0 ? <Empty title="No activity yet" /> : a.slice(0, 6).map((x) => <div key={x.id} className="list-row small"><span className="muted" style={{ width: 62 }}>{relTime(x.created_at, ctx.tz)}</span><span className="grow trunc">{activityText(x)}</span></div>)}</>);
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
export const WIDGET_COMPONENTS = { overview: OverviewWidget, priority: PriorityCard, timeline: TodayTimeline, quicklinks: QuickLinksWidget, tasks: TasksWidget, calendar: CalendarWidget, deadlines: DeadlinesWidget, money: MoneyWidget, projects: ProjectsWidget, notes: NotesWidget, focus: FocusWidget, weather: WeatherWidget, activity: ActivityWidget };
