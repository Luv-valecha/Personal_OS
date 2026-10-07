"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, MapPin } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import Modal from "@/components/ui/Modal";
import { Field, Segmented } from "@/components/ui/Fields";
import { Empty } from "@/components/ui/misc";
import { useAction } from "@/components/ui/useAction";
import { createEvent, updateEvent, deleteEvent } from "@/actions/events";
import { addDays, startOfWeek, startOfMonth, dateInTz, fmtTime, zonedToIso, isoToLocalInput } from "@/lib/dates";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export default function CalendarClient({ events, today, tz, initialView = "month" }) {
  const [view, setView] = useState(initialView); const [cursor, setCursor] = useState(today); const [edit, setEdit] = useState(null);
  const byDay = useMemo(() => { const m = {}; for (const e of events) (m[dateInTz(e.starts_at, tz)] ||= []).push(e); return m; }, [events, tz]);
  const shift = (dir) => setCursor((c) => view === "month" ? (() => { const d = new Date(c + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + dir, 1); return d.toISOString().slice(0, 10); })() : addDays(c, dir * (view === "week" ? 7 : 1)));
  const title = view === "month" ? new Date(cursor + "T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })
    : view === "week" ? `Week of ${new Date(startOfWeek(cursor) + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}`
      : new Date(cursor + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const newAt = (day) => setEdit({ day });
  const Chip = ({ e }) => <button className="chip trunc" style={{ maxWidth: "100%", justifyContent: "flex-start", background: "color-mix(in srgb, var(--color-primary) 18%, transparent)", color: "var(--color-text)", cursor: "pointer", borderColor: "transparent" }} onClick={(ev) => { ev.stopPropagation(); setEdit(e); }}>{!e.all_day && <span className="muted">{fmtTime(e.starts_at, tz)}</span>} {e.title}</button>;
  let body;
  if (view === "month") {
    const first = startOfWeek(startOfMonth(cursor)); const days = Array.from({ length: 42 }, (_, i) => addDays(first, i)); const month = cursor.slice(0, 7);
    body = <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--color-border)" }}>{DOW.map((d) => <div key={d} className="small muted text-center py-2">{d}</div>)}</div>
      <div className="grid grid-cols-7">{days.map((d) => { const ev = byDay[d] || []; return (
        <div key={d} role="button" tabIndex={0} onClick={() => { setCursor(d); setView("day"); }} onKeyDown={(e) => e.key === "Enter" && (setCursor(d), setView("day"))} aria-label={`${d}, ${ev.length} events`}
          style={{ minHeight: 78, padding: 4, borderTop: "1px solid var(--color-border)", borderLeft: "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)", opacity: d.startsWith(month) ? 1 : 0.4, cursor: "pointer", overflow: "hidden" }}>
          <div className="small" style={{ width: 22, height: 22, display: "grid", placeItems: "center", borderRadius: 99, background: d === today ? "var(--color-primary)" : "none", color: d === today ? "var(--color-primary-contrast)" : "inherit" }}>{Number(d.slice(8))}</div>
          <div className="hidden sm:flex flex-col gap-0.5 mt-1">{ev.slice(0, 2).map((e) => <Chip key={e.id + e.occurrence} e={e} />)}{ev.length > 2 && <span className="small muted">+{ev.length - 2} more</span>}</div>
          {ev.length > 0 && <div className="sm:hidden flex gap-0.5 mt-1">{ev.slice(0, 3).map((e, i) => <span key={i} className="dot" style={{ background: "var(--color-primary)" }} />)}</div>}
        </div>); })}</div></div>;
  } else {
    const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)) : [cursor];
    body = <div className={`grid gap-3 ${view === "week" ? "md:grid-cols-7" : ""}`}>{days.map((d) => (
      <div key={d} className="card" style={{ padding: 12, minHeight: view === "week" ? 160 : undefined, outline: d === today ? "1px solid var(--color-primary)" : undefined }}>
        <div className="card-title"><span>{new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span><button className="btn btn-ghost btn-icon btn-sm" onClick={() => newAt(d)} aria-label={`Add event on ${d}`}><Plus size={14} /></button></div>
        {(byDay[d] || []).length === 0 ? <div className="small muted">{view === "day" ? "Nothing scheduled." : "—"}</div> : (byDay[d] || []).map((e) => view === "day" ?
          <button key={e.id + e.occurrence} className="list-row w-full text-left" style={{ background: "none", border: 0, color: "inherit", font: "inherit", cursor: "pointer" }} onClick={() => setEdit(e)}><span className="small muted" style={{ width: 96 }}>{e.all_day ? "All day" : `${fmtTime(e.starts_at, tz)}–${fmtTime(e.ends_at, tz)}`}</span><span className="grow">{e.title}{e.location && <span className="small muted"> · <MapPin size={11} style={{ display: "inline" }} /> {e.location}</span>}</span></button> : <div key={e.id + e.occurrence} className="mb-1"><Chip e={e} /></div>)}
      </div>))}</div>;
  }
  return (<>
    <PageHead title="Calendar" sub={title}>
      <Segmented value={view} onChange={setView} options={[{ value: "day", label: "Today" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} label="Calendar view" />
      <div className="flex"><button className="btn btn-icon" onClick={() => shift(-1)} aria-label="Previous"><ChevronLeft size={16} /></button><button className="btn" onClick={() => setCursor(today)}>Today</button><button className="btn btn-icon" onClick={() => shift(1)} aria-label="Next"><ChevronRight size={16} /></button></div>
      <button className="btn btn-primary" onClick={() => newAt(cursor)}><Plus size={16} /> Event</button></PageHead>
    {body}
    {edit && <EventEditor e={edit} tz={tz} today={today} onClose={() => setEdit(null)} />}
  </>);
}
function EventEditor({ e, tz, today, onClose }) {
  const { run, pending } = useAction(); const isNew = !e.id; const day = e.day || today;
  const [f, setF] = useState({ title: e.title || "", description: e.description || "", location: e.location || "", all_day: !!e.all_day,
    start: e.starts_at ? isoToLocalInput(e.starts_at, tz) : `${day}T09:00`, end: e.ends_at ? isoToLocalInput(e.ends_at, tz) : `${day}T10:00`, reminder: e.reminder_minutes ?? "", recurrence: e.recurrence || "none" });
  const set = (k) => (ev) => setF((s) => ({ ...s, [k]: ev.target.type === "checkbox" ? ev.target.checked : ev.target.value }));
  async function save(ev) { ev.preventDefault();
    const s = f.all_day ? f.start.slice(0, 10) + "T00:00" : f.start, en = f.all_day ? f.end.slice(0, 10) + "T23:59" : f.end;
    const body = { title: f.title, description: f.description, location: f.location, all_day: f.all_day, starts_at: zonedToIso(s, tz), ends_at: zonedToIso(en, tz), reminder_minutes: f.reminder, recurrence: f.recurrence };
    if (await run(() => (isNew ? createEvent(body) : updateEvent(e.id, body)), { ok: isNew ? "Event added" : "Event updated" })) onClose(); }
  async function del() { if (confirm(f.recurrence !== "none" ? "Delete this event and all its repeats?" : "Delete this event?") && await run(() => deleteEvent(e.id), { ok: "Deleted" })) onClose(); }
  return (<Modal open onClose={onClose} title={isNew ? "New event" : "Edit event"}><form onSubmit={save} className="flex flex-col gap-3">
    <Field label="Title"><input className="input" value={f.title} onChange={set("title")} required autoFocus /></Field>
    <label className="flex items-center gap-2 small"><input type="checkbox" className="check" checked={f.all_day} onChange={set("all_day")} /> All day</label>
    <div className="form-grid two"><Field label="Starts"><input className="input" type={f.all_day ? "date" : "datetime-local"} value={f.all_day ? f.start.slice(0, 10) : f.start} onChange={set("start")} required /></Field>
      <Field label="Ends"><input className="input" type={f.all_day ? "date" : "datetime-local"} value={f.all_day ? f.end.slice(0, 10) : f.end} onChange={set("end")} required /></Field>
      <Field label="Location"><input className="input" value={f.location} onChange={set("location")} /></Field>
      <Field label="Reminder"><select className="select" value={f.reminder} onChange={set("reminder")}><option value="">None</option><option value="0">At start</option><option value="10">10 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></Field>
      <Field label="Repeats"><select className="select" value={f.recurrence} onChange={set("recurrence")}><option value="none">Never</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></Field></div>
    <Field label="Description"><textarea className="textarea" style={{ minHeight: 64 }} value={f.description} onChange={set("description")} /></Field>
    <div className="flex justify-between">{!isNew ? <button type="button" className="btn btn-danger" onClick={del}><Trash2 size={15} /> Delete</button> : <span />}<div className="flex gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending}>Save</button></div></div></form></Modal>);
}
