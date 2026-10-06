"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Timer, Settings, Palette, Upload, FileText } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { ALL_THEMES } from "@/lib/themes";
import { setTheme } from "@/actions/settings";
import { useFocus } from "@/components/shell/FocusProvider";

const TYPE_HREF = { tasks: "/tasks", notes: "/notes", projects: "/projects", bookmarks: "/bookmarks", ideas: "/ideas", deadlines: "/deadlines", files: "/files" };

export default function CommandPalette({ open, onClose, onAdd, onTheme }) {
  const router = useRouter(); const focus = useFocus();
  const [q, setQ] = useState(""); const [mode, setMode] = useState("root"); const [idx, setIdx] = useState(0);
  const [found, setFound] = useState({}); const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (open) { setQ(""); setMode("root"); setIdx(0); setFound({}); } }, [open]);

  // Debounced search (300ms) — one request after the user stops typing, never per keystroke.
  useEffect(() => {
    if (!open || mode !== "root" || q.trim().length < 2) { setFound({}); return; }
    setLoading(true); const ctl = new AbortController();
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal }); const j = await r.json(); setFound(j.results || {}); } catch {}
      setLoading(false);
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open, mode]);

  const go = (href) => { onClose(); router.push(href); };
  const commands = useMemo(() => [
    { id: "a-task", label: "Add task", icon: Plus, run: () => onAdd("task") },
    { id: "a-note", label: "Add note", icon: Plus, run: () => onAdd("note") },
    { id: "a-exp", label: "Add expense", icon: Plus, run: () => onAdd("expense") },
    { id: "a-bm", label: "Add bookmark", icon: Plus, run: () => onAdd("bookmark") },
    { id: "a-proj", label: "Add project", icon: Plus, run: () => onAdd("project") },
    { id: "a-idea", label: "Add idea", icon: Plus, run: () => onAdd("idea") },
    { id: "upload", label: "Upload file", icon: Upload, run: () => go("/files?upload=1") },
    { id: "focus", label: focus?.t ? "Open focus timer" : "Start focus mode", icon: Timer, run: () => go("/focus" + (focus?.t ? "" : "?start=1")) },
    { id: "search", label: "Search everything", icon: Search, run: () => go("/search") },
    { id: "settings", label: "Open settings", icon: Settings, run: () => go("/settings") },
    { id: "theme", label: "Change theme…", icon: Palette, keep: true, run: () => { setMode("theme"); setQ(""); setIdx(0); } },
  ], [focus?.t]); // eslint-disable-line

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (mode === "theme") return ALL_THEMES.filter((t) => t.name.toLowerCase().includes(s)).map((t) => ({ id: "t-" + t.id, label: t.name, group: "Themes", icon: Palette, run: () => { onTheme(t.id); onClose(); } }));
    const cmd = commands.filter((c) => !s || c.label.toLowerCase().includes(s)).map((c) => ({ ...c, group: "Commands" }));
    const res = Object.entries(found).flatMap(([type, rows]) => rows.map((r) => ({ id: type + r.id, label: r.title, sub: r.snippet || r.domain || r.status || "", group: type[0].toUpperCase() + type.slice(1), icon: FileText, run: () => go(TYPE_HREF[type] + (type === "files" ? "" : `?q=${encodeURIComponent(q.trim())}`)) })));
    return [...cmd, ...res];
  }, [q, mode, commands, found]); // eslint-disable-line

  useEffect(() => { setIdx(0); }, [q, mode]);
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[idx]?.run(); }
    else if (e.key === "Backspace" && !q && mode !== "root") setMode("root");
  };
  let last = "";
  return (
    <Modal open={open} onClose={onClose} title="Command palette" hideHead className="palette">
      <div className="flex items-center gap-2 px-4 border-b" style={{ borderColor: "var(--color-border)" }}>
        <Search size={16} className="muted" />
        <input ref={inputRef} className="input" style={{ border: 0, background: "none", boxShadow: "none" }} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
          placeholder={mode === "theme" ? "Pick a theme…" : "Type a command or search…"} aria-label="Command or search" role="combobox" aria-expanded="true" aria-controls="palette-list" />
        <span className="kbd hidden sm:inline">Esc</span>
      </div>
      <div id="palette-list" role="listbox" style={{ maxHeight: "55dvh", overflowY: "auto", paddingBottom: 6 }}>
        {items.length === 0 && <div className="empty">{loading ? "Searching…" : "Nothing found"}</div>}
        {items.map((it, i) => {
          const head = it.group !== last ? <div className="palette-group" key={"g" + it.group + i}>{it.group}</div> : null; last = it.group;
          const Icon = it.icon;
          return [head, <button key={it.id} role="option" aria-selected={i === idx} className="palette-item" onMouseEnter={() => setIdx(i)} onClick={() => it.run()}>
            <Icon size={16} className="muted" /><span className="grow trunc">{it.label}{it.sub && <span className="muted small"> — {it.sub}</span>}</span></button>];
        })}
        {loading && items.length > 0 && <div className="palette-group">Searching…</div>}
      </div>
    </Modal>
  );
}
