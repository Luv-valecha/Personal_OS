"use client";
import { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, Square } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import { Field, Segmented } from "@/components/ui/Fields";
import { Empty } from "@/components/ui/misc";
import { useFocus, fmtClock } from "@/components/shell/FocusProvider";
import { fmtDuration, addDays, relDay } from "@/lib/dates";
import { relTime } from "@/lib/format";

const PRESETS = [{ value: "25", label: "Pomodoro 25" }, { value: "50", label: "Deep 50" }, { value: "custom", label: "Custom" }];
export default function FocusClient({ totals, recent, tasks, daily, tz, today }) {
  const f = useFocus(); const [preset, setPreset] = useState("25"); const [custom, setCustom] = useState(40); const [label, setLabel] = useState(""); const [brk, setBrk] = useState(5);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("start") === "1" && f?.ready && !f.t) { f.start("focus", 25, ""); window.history.replaceState({}, "", "/focus"); } }, [f?.ready]); // eslint-disable-line
  const minutes = preset === "custom" ? Math.max(1, Math.min(240, Number(custom) || 25)) : Number(preset);
  const t = f?.t; const pct = t ? ((t.total - f.remaining) / t.total) * 100 : 0;
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)); const max = Math.max(1, ...daily.map((d) => d.seconds));
  const R = 88, C = 2 * Math.PI * R;
  return (<>
    <PageHead title="Focus" sub="One thing at a time. Sessions are saved when they finish." />
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="card flex flex-col items-center gap-4" style={{ padding: 24 }}>
        <div className="sub">{t ? (t.kind === "focus" ? "FOCUS" : "BREAK").toLowerCase() : "ready"}{t?.label ? ` · ${t.label}` : ""}</div>
        <div style={{ position: "relative", width: 220, height: 220 }}>
          <svg width="220" height="220" viewBox="0 0 220 220" aria-hidden><circle cx="110" cy="110" r={R} fill="none" stroke="var(--color-border)" strokeWidth="8" />
            <circle cx="110" cy="110" r={R} fill="none" stroke="var(--color-primary)" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform="rotate(-90 110 110)" style={{ transition: "stroke-dashoffset 0.5s linear" }} /></svg>
          <div className="stat" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 46 }} role="timer" aria-live="off">{t ? fmtClock(f.remaining) : fmtClock(minutes * 60)}</div>
        </div>
        {!t ? <>
          <Segmented value={preset} onChange={setPreset} options={PRESETS} label="Duration" />
          {preset === "custom" && <Field label="Minutes"><input className="input" type="number" min="1" max="240" value={custom} onChange={(e) => setCustom(e.target.value)} style={{ width: 120 }} /></Field>}
          <Field label="What are you working on?" className="w-full" ><input className="input" list="focus-tasks" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Finish ML report" maxLength={120} /></Field>
          <datalist id="focus-tasks">{tasks.map((x) => <option key={x.id} value={x.title} />)}</datalist>
          <div className="flex gap-2 flex-wrap justify-center"><button className="btn btn-primary" style={{ minHeight: 44, padding: "0 22px" }} onClick={() => f.start("focus", minutes, label)}><Play size={16} /> Start focus</button>
            <button className="btn" style={{ minHeight: 44 }} onClick={() => f.start("break", brk, "Break")}>Take a {brk} min break</button></div>
          <label className="small muted flex items-center gap-2">Break length <select className="select" style={{ width: 90 }} value={brk} onChange={(e) => setBrk(Number(e.target.value))}>{[5, 10, 15, 20].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
        </> : <div className="flex gap-2 flex-wrap justify-center">
          {t.running ? <button className="btn btn-primary" onClick={f.pause}><Pause size={16} /> Pause</button> : <button className="btn btn-primary" onClick={f.resume}><Play size={16} /> Resume</button>}
          <button className="btn" onClick={f.reset}><RotateCcw size={15} /> Reset</button>
          {t.kind === "focus" && <button className="btn" onClick={f.stopAndSave}><Square size={14} /> Stop &amp; save</button>}
        </div>}
        <p className="small muted text-center" style={{ maxWidth: 340 }}>The timer keeps running while you use other pages. Allow notifications from the bell menu to get an alert when it ends.</p>
      </div>
      <div className="flex flex-col gap-4">
        <div className="card"><div className="card-title">Focus time</div><div className="grid grid-cols-4 gap-2">
          {[[totals.today, "Today"], [totals.week, "This week"], [totals.total, "Total"], [totals.sessions, "Sessions"]].map(([v, l], i) => <div key={l}><div className="stat" style={{ fontSize: 19 }}>{i === 3 ? v : fmtDuration(v)}</div><div className="sub">{l}</div></div>)}</div>
          <div className="flex items-end gap-2 mt-4" style={{ height: 70 }} role="img" aria-label="Focus minutes over the last 7 days">{days.map((d) => { const s = daily.find((x) => x.day === d)?.seconds || 0; return <div key={d} className="grow flex flex-col items-center gap-1" style={{ height: "100%", justifyContent: "flex-end" }}><div title={fmtDuration(s)} style={{ width: "100%", height: `${(s / max) * 100}%`, minHeight: s ? 4 : 2, borderRadius: 4, background: s ? "var(--gradient-primary)" : "var(--color-border)" }} /><span className="small muted" style={{ fontSize: 10 }}>{new Date(d + "T00:00:00Z").toLocaleDateString("en", { weekday: "narrow", timeZone: "UTC" })}</span></div>; })}</div></div>
        <div className="card"><div className="card-title">Recent sessions</div>{recent.length === 0 ? <Empty title="No sessions yet" /> : recent.map((r) => <div key={r.id} className="list-row small"><span className="muted" style={{ width: 64 }}>{relTime(r.started_at, tz)}</span><span className="grow trunc">{r.label || (r.kind === "break" ? "Break" : "Focus")}</span><span className="muted">{fmtDuration(r.seconds)}</span></div>)}</div>
      </div>
    </div>
  </>);
}
