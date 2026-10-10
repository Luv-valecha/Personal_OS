"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Empty, ErrorBox } from "@/components/ui/misc";

const HREF = { splits: "/splits", quicklinks: "/settings#quicklinks", activity: "/activity", tasks: "/tasks", notes: "/notes", projects: "/projects", bookmarks: "/bookmarks", ideas: "/ideas", deadlines: "/deadlines", files: "/files" };
export default function SearchClient({ initial }) {
  const [q, setQ] = useState(initial); const [res, setRes] = useState(null); const [loading, setLoading] = useState(false); const [err, setErr] = useState(false); const [n, setN] = useState(0);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; } setLoading(true); setErr(false); const ctl = new AbortController();
    const t = setTimeout(async () => { // debounced: one request 300 ms after typing stops
      try { const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal }); if (!r.ok) throw 0; setRes((await r.json()).results); setLoading(false); } catch (e) { if (e?.name !== "AbortError") { setErr(true); setLoading(false); } }
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, n]);
  const groups = res ? Object.entries(res).filter(([, v]) => v.length) : [];
  return (<>
    <div className="relative mb-4"><Search size={16} className="muted" style={{ position: "absolute", left: 12, top: 12 }} /><input className="input" style={{ paddingLeft: 36 }} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything…" aria-label="Search" /></div>
    {err && <ErrorBox onRetry={() => setN((x) => x + 1)}>Search failed.</ErrorBox>}
    {loading && !res && <div className="skeleton" style={{ height: 120 }} />}
    {res && groups.length === 0 && !loading && <div className="card"><Empty title="No results" hint={`Nothing matches “${q}”.`} /></div>}
    {groups.map(([type, rows]) => <div key={type} className="mb-4"><div className="sub mb-2">{type[0].toUpperCase() + type.slice(1)}</div>
      <div className="card" style={{ padding: 8 }}>{rows.map((r) => <Link key={r.id} href={type === "splits" ? `/splits?friend=${r.id}` : `${HREF[type]}${type === "files" ? "" : "?q=" + encodeURIComponent(q.trim())}`} className="list-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 0 }}><span>{r.title}</span>{(r.snippet || r.domain) && <span className="small muted trunc w-full">{r.snippet || r.domain}</span>}</Link>)}</div></div>)}
  </>);
}
