"use client";
import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import { Empty } from "@/components/ui/misc";
import { activityText } from "@/lib/format";

const KINDS = [["", "All"], ["task", "Tasks"], ["note", "Notes"], ["project", "Projects"], ["bookmark", "Bookmarks"], ["expense", "Expenses"], ["file", "Files"], ["focus", "Focus"], ["idea", "Ideas"], ["event", "Events"]];
export default function ActivityClient({ rows, hasMore, kind, page, tz }) {
  const groups = {}; const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(d)); const todayK = dayKey(new Date()); const yK = dayKey(Date.now() - 864e5);
  for (const r of rows) (groups[dayKey(r.created_at)] ||= []).push(r);
  const qs = (o) => { const p = new URLSearchParams({ ...(kind && { kind }), ...o }); [...p].forEach(([k, v]) => !v && p.delete(k)); const s = p.toString(); return "/activity" + (s ? "?" + s : ""); };
  return (<>
    <PageHead title="Activity" sub="A timeline of what you've done." />
    <div className="flex flex-wrap gap-2 mb-4">{KINDS.map(([k, l]) => <Link key={k} href={qs({ kind: k, page: "" })} className="chip chip-btn" aria-pressed={kind === k}>{l}</Link>)}</div>
    {rows.length === 0 ? <div className="card"><Empty title="Nothing here yet" hint="Your actions will show up as you use the app." /></div> :
      Object.entries(groups).map(([day, items]) => <div key={day} className="mb-4"><div className="sub mb-2">{day === todayK ? "Today" : day === yK ? "Yesterday" : new Date(day + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</div>
        <div className="card" style={{ padding: 8 }}>{items.map((r) => <div key={r.id} className="list-row small"><span className="muted" style={{ width: 48 }}>{new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz })}</span><span className="grow">{activityText(r)}</span></div>)}</div></div>)}
    <div className="flex gap-2 justify-center">{page > 0 && <Link className="btn" href={qs({ page: String(page - 1) })}>Newer</Link>}{hasMore && <Link className="btn" href={qs({ page: String(page + 1) })}>Older</Link>}</div>
  </>);
}
