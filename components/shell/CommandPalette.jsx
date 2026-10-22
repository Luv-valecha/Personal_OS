"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Timer, Settings, Palette, Upload, Sun, LayoutDashboard, CheckSquare, CalendarDays, FolderKanban, FileText, AlertTriangle, ListChecks, Link2, Zap, Play, Square, Layers, StickyNote, Wand2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { ALL_THEMES } from "@/lib/themes";
import { useFocus } from "@/components/shell/FocusProvider";
import { useToast } from "@/components/ui/Toast";
import { parseCommand } from "@/lib/commands";
import { quickAddTask } from "@/actions/tasks";
import { quickAddIdea } from "@/actions/ideas";
import { createNote } from "@/actions/notes";
import { createProject } from "@/actions/projects";
import { createBookmark } from "@/actions/bookmarks";
import { createExpense } from "@/actions/expenses";
import { createDeadline } from "@/actions/deadlines";
import { createEvent } from "@/actions/events";
import { createQuickLink } from "@/actions/quicklinks";
import { startSlideshow, slideshowControl } from "@/actions/slideshow";

const HREF = { splits: "/splits", tasks: "/tasks", notes: "/notes", projects: "/projects", bookmarks: "/bookmarks", ideas: "/ideas", deadlines: "/deadlines", files: "/files", activity: "/activity", quicklinks: "/settings#quicklinks" };
const LABEL = { quicklinks: "Quick links", splits: "Splits", projects: "Projects", tasks: "Tasks", notes: "Notes", bookmarks: "Bookmarks", deadlines: "Deadlines", files: "Files", ideas: "Ideas", activity: "Activity" };
const SCOPES = { project: "projects", note: "notes", task: "tasks" };
const CREATORS = { task: (p) => quickAddTask(p.text), idea: (p) => quickAddIdea(p.title), note: createNote, project: createProject, bookmark: createBookmark, expense: createExpense, deadline: createDeadline, event: createEvent, link: createQuickLink };

// Search cache: identical queries within 60 s never hit the network again.
const cache = new Map();
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } };

export default function CommandPalette({ open, onClose, onAdd, onTheme, onSlideshow, slideshowOn }) {
  const router = useRouter(); const focus = useFocus(); const toast = useToast();
  const [q, setQ] = useState(""); const [mode, setMode] = useState("root"); const [idx, setIdx] = useState(0);
  const [found, setFound] = useState({}); const [loading, setLoading] = useState(false); const [ctx, setCtx] = useState(null);
  const [scope, setScope] = useState("");

  useEffect(() => { if (!open) return; setQ(""); setMode("root"); setIdx(0); setFound({}); setScope("");
    // context for suggestions/smart queries (cached 30 s)
    const c = cache.get("ctx"); if (c && Date.now() - c.at < 30000) setCtx(c.v);
    else fetch("/api/palette").then((r) => (r.ok ? r.json() : null)).then((v) => { if (v) { cache.set("ctx", { at: Date.now(), v }); setCtx(v); } }).catch(() => {});
  }, [open]);

  const intent = useMemo(() => (mode === "root" && !scope ? parseCommand(q, tz()) : null), [q, mode, scope]);

  // Debounced (300 ms) search + cache. Skipped when the input is a recognised command so typing "add task: …" never searches.
  useEffect(() => {
    if (!open || mode !== "root") return; const s = q.trim();
    if (!scope && (s.length < 2 || intent)) { setFound({}); setLoading(false); return; }
    if (scope && s.length < 2 && s.length > 0) return;
    const key = `${scope}|${s.toLowerCase()}`; const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 60000) { setFound(hit.v); return; }
    setLoading(true); const ctl = new AbortController();
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/search?q=${encodeURIComponent(s)}${scope ? `&type=${scope}` : ""}`, { signal: ctl.signal }); const j = await r.json(); cache.set(key, { at: Date.now(), v: j.results || {} }); setFound(j.results || {}); setLoading(false); } catch (e) { if (e?.name !== "AbortError") setLoading(false); }
    }, scope && !s ? 0 : 300);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open, mode, scope, intent]);

  const go = (href) => { onClose(); router.push(href); };
  async function execIntent(i) {
    if (i.type === "nav") return go(i.href);
    if (i.type === "focus") { if (focus.t && !confirm("A focus timer is running. Replace it?")) return; focus.start("focus", i.minutes, i.label || ""); return go("/focus"); }
    if (i.type === "form") { onClose(); return onAdd(i.entity, i.prefill); }
    if (i.type === "create") {
      const res = await CREATORS[i.entity](i.payload).catch(() => null);
      if (!res?.ok) { toast(res?.error || "Couldn't do that. Try the form instead.", "err"); return; }
      toast(i.title.replace(/^(Create|Add|Capture|Save)/, (m) => ({ Create: "Created", Add: "Added", Capture: "Captured", Save: "Saved" }[m]))); cache.clear(); onClose();
    }
  }

  const items = useMemo(() => {
    const s = q.trim().toLowerCase(); const out = []; const add = (o) => out.push(o);
    const nav = (id, label, href, icon, group = "Go to") => ({ id, label, group, icon, run: () => go(href) });
    if (mode === "theme") return ALL_THEMES.filter((t) => t.name.toLowerCase().includes(s)).map((t) => ({ id: "t-" + t.id, label: t.name, group: "Themes", icon: Palette, run: () => { onTheme(t.id); onClose(); } }));
    if (intent) add({ id: "intent", label: intent.title, group: "Run", icon: Wand2, hint: "Enter", run: () => execIntent(intent) });

    // Smart, data-aware queries
    if (ctx && !intent && s) {
      if (/overdue|late|behind/.test(s)) {
        add({ id: "s-od-t", label: `${ctx.overdue_tasks} overdue task${ctx.overdue_tasks === 1 ? "" : "s"}`, sub: "View overdue tasks", group: "Smart", icon: AlertTriangle, run: () => go("/tasks?view=overdue") });
        add({ id: "s-od-d", label: `${ctx.overdue_deadlines} overdue deadline${ctx.overdue_deadlines === 1 ? "" : "s"}`, sub: "View overdue deadlines", group: "Smart", icon: AlertTriangle, run: () => go("/deadlines?filter=overdue") });
      }
      if (/today/.test(s)) {
        add({ id: "s-t-t", label: `Today's tasks (${ctx.today_tasks})`, group: "Smart", icon: ListChecks, run: () => go("/tasks?view=today") });
        add({ id: "s-t-d", label: `Today's deadlines (${ctx.today_deadlines})`, group: "Smart", icon: ListChecks, run: () => go("/deadlines?filter=today") });
        add({ id: "s-t-e", label: `Today's events (${ctx.today_events})`, group: "Smart", icon: CalendarDays, run: () => go("/calendar?view=day") });
      }
      if (/urgent/.test(s)) ctx.urgent?.forEach((d) => add({ id: "s-u" + d.id, label: d.title, sub: `due ${d.due_date}`, group: "Smart", icon: AlertTriangle, run: () => go("/deadlines") }));
    }

    const cmds = [
      { id: "a-task", label: "Add task", icon: Plus, run: () => onAdd("task") }, { id: "a-note", label: "Add note", icon: Plus, run: () => onAdd("note") },
      { id: "a-idea", label: "Add idea", icon: Plus, run: () => onAdd("idea") }, { id: "a-event", label: "Add event", icon: Plus, run: () => onAdd("event") },
      { id: "a-dl", label: "Add deadline", icon: Plus, run: () => onAdd("deadline") }, { id: "a-exp", label: "Add expense", icon: Plus, run: () => onAdd("expense") },
      { id: "a-bm", label: "Add bookmark", icon: Plus, run: () => onAdd("bookmark") }, { id: "a-proj", label: "Add project", icon: Plus, run: () => onAdd("project") },
      { id: "a-link", label: "Add quick link", icon: Link2, run: () => onAdd("link") },
      { id: "upload", label: "Upload file", icon: Upload, run: () => go("/files?upload=1") },
      { id: "focus", label: focus?.t ? "Open focus timer" : "Start focus", icon: Timer, run: () => go("/focus" + (focus?.t ? "" : "?start=1")) },
      { id: "n-today", label: "Open Today", icon: Sun, run: () => go("/today") }, { id: "n-dash", label: "Open Dashboard", icon: LayoutDashboard, run: () => go("/dashboard") },
      { id: "n-tasks", label: "Open Tasks", icon: CheckSquare, run: () => go("/tasks") }, { id: "n-cal", label: "Open Calendar", icon: CalendarDays, run: () => go("/calendar") },
      { id: "n-proj", label: "Open Projects", icon: FolderKanban, run: () => go("/projects") },
      { id: "jarvis", label: "Ask JARVIS…", icon: Wand2, run: () => go("/dashboard#jarvis") },
      { id: "n-music", label: "Open Music", icon: Play, run: () => go("/music") }, { id: "n-splits", label: "Open Splits", icon: Layers, run: () => go("/splits") },
      { id: "n-exp", label: "Open Expense analytics", icon: Search, run: () => go("/expenses") },
      { id: "search", label: "Search everything", icon: Search, run: () => go("/search") },
      { id: "od", label: "Show overdue tasks", icon: AlertTriangle, run: () => go("/tasks?view=overdue") },
      { id: "tt", label: "Show today's tasks", icon: ListChecks, run: () => go("/tasks?view=today") },
      { id: "td", label: "Show today's deadlines", icon: ListChecks, run: () => go("/deadlines?filter=today") },
      { id: "te", label: "Show today's events", icon: CalendarDays, run: () => go("/calendar?view=day") },
      { id: "o-proj", label: "Open project…", icon: FolderKanban, keep: true, run: () => { setScope("projects"); setQ(""); setIdx(0); } },
      { id: "o-note", label: "Open note…", icon: StickyNote, keep: true, run: () => { setScope("notes"); setQ(""); setIdx(0); } },
      { id: "o-task", label: "Open task…", icon: CheckSquare, keep: true, run: () => { setScope("tasks"); setQ(""); setIdx(0); } },
      { id: "settings", label: "Open settings", icon: Settings, run: () => go("/settings") },
      { id: "theme", label: "Change theme…", icon: Palette, keep: true, run: () => { setMode("theme"); setQ(""); setIdx(0); } },
      slideshowOn
        ? { id: "ss-stop", label: "Stop theme slideshow", icon: Square, run: async () => { const r = await slideshowControl("stop"); if (r.ok) { onSlideshow(r.data); toast("Theme slideshow stopped"); } else toast(r.error, "err"); onClose(); } }
        : { id: "ss-start", label: "Start theme slideshow", icon: Play, run: async () => { const r = await startSlideshow(); if (r.ok) { onSlideshow(r.data); toast("Theme slideshow started"); onClose(); } else { toast(r.error, "err"); go("/settings#slideshow"); } } },
    ];
    if (!scope) {
      // Suggestions when the box is empty (based on real data)
      if (!s && ctx) {
        const sg = [];
        const last = typeof localStorage !== "undefined" ? localStorage.getItem("last-path") : null;
        if (focus?.t) sg.push({ id: "sg-focus", label: "Continue your focus session", icon: Zap, run: () => go("/focus") });
        else if (last && !["/dashboard", "/today"].includes(last) && last !== "/") sg.push({ id: "sg-last", label: `Continue where you left off`, sub: last, icon: Zap, run: () => go(last) });
        else if (ctx.lastNote) sg.push({ id: "sg-note", label: "Continue where you left off", sub: ctx.lastNote.title || "Untitled note", icon: Zap, run: () => go(`/notes?q=${encodeURIComponent(ctx.lastNote.title || "")}`) });
        sg.push({ id: "sg-pri", label: "View today's priorities", sub: ctx.priority?.title, icon: ListChecks, run: () => go("/today") });
        sg.push({ id: "sg-focus2", label: ctx.priority ? "Start focus on your priority" : "Start focus", sub: ctx.priority?.title, icon: Timer, run: () => go("/today") });
        if (ctx.urgent?.length) sg.push({ id: "sg-urgent", label: "View urgent deadlines", sub: `${ctx.urgent.length} within 3 days`, icon: AlertTriangle, run: () => go("/deadlines") });
        sg.push({ id: "sg-sched", label: "View today's schedule", sub: `${ctx.today_events} event${ctx.today_events === 1 ? "" : "s"}`, icon: CalendarDays, run: () => go("/today#schedule") });
        sg.push({ id: "sg-link", label: "Add quick link", icon: Link2, run: () => onAdd("link") });
        sg.forEach((x) => add({ ...x, group: "Suggested" }));
      }
      cmds.filter((c) => !s || c.label.toLowerCase().includes(s)).forEach((c) => add({ ...c, group: "Commands" }));
    }
    // Search results, grouped
    const order = scope ? [scope] : Object.keys(LABEL);
    for (const type of order) for (const r of found[type] || []) {
      const ql = type === "quicklinks";
      add({ id: type + r.id, label: r.title, sub: ql ? (r.url.startsWith("/") ? r.url : r.url.replace(/^https?:\/\/(www\.)?/, "")) : r.snippet || r.domain || r.status || r.action || "", group: scope ? `Open ${scope.slice(0, -1)}` : LABEL[type], icon: ql ? Link2 : FileText, hint: ql ? "Open" : undefined,
        run: () => { if (ql) { if (r.url.startsWith("/")) go(r.url); else { window.open(r.url, "_blank", "noopener,noreferrer"); onClose(); } } else if (type === "tasks") go(`/tasks?open=${r.id}`); else if (type === "splits") go(`/splits?friend=${r.id}`); else go(HREF[type] + (type === "files" ? "" : `?q=${encodeURIComponent(r.title)}`)); } });
    }
    return out;
  }, [q, mode, scope, ctx, found, intent, focus?.t, slideshowOn]); // eslint-disable-line

  useEffect(() => { setIdx(0); }, [q, mode, scope]);
  const listRef = useRef(null);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [idx]);
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[idx]?.run(); }
    else if (e.key === "Backspace" && !q && (mode !== "root" || scope)) { setMode("root"); setScope(""); }
  };
  let last = "";
  return (
    <Modal open={open} onClose={onClose} title="Command palette" hideHead className="palette">
      <div className="flex items-center gap-2 px-4 border-b" style={{ borderColor: "var(--color-border)" }}>
        <Search size={16} className="muted" />
        {scope && <span className="chip chip-active">{LABEL[scope]}</span>}
        <input className="input" style={{ border: 0, background: "none", boxShadow: "none" }} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
          placeholder={mode === "theme" ? "Pick a theme…" : scope ? `Search ${LABEL[scope].toLowerCase()}…` : "Type a command, search, or “add task: …”"} aria-label="Command or search" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[idx] ? `pal-${items[idx].id}` : undefined} />
        <span className="kbd hidden sm:inline">Esc</span>
      </div>
      <div id="palette-list" role="listbox" ref={listRef} style={{ maxHeight: "58dvh", overflowY: "auto", paddingBottom: 6 }}>
        {items.length === 0 && <div className="empty">{loading ? "Searching…" : q.trim().length < 2 && !scope ? "Keep typing…" : "Nothing found"}</div>}
        {items.map((it, i) => {
          const head = it.group !== last ? <div className="palette-group" key={"g" + it.group + i}>{it.group}</div> : null; last = it.group; const Icon = it.icon;
          return [head, <button key={it.id} id={`pal-${it.id}`} role="option" aria-selected={i === idx} className="palette-item" onMouseEnter={() => setIdx(i)} onClick={() => it.run()}>
            <Icon size={16} className="muted" /><span className="grow trunc">{it.label}{it.sub && <span className="muted small"> — {it.sub}</span>}</span>{it.hint && <span className="kbd">{it.hint}</span>}</button>];
        })}
        {loading && items.length > 0 && <div className="palette-group">Searching…</div>}
      </div>
    </Modal>
  );
}
