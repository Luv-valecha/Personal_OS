"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Command, Plus, MoreHorizontal, Timer, Search } from "lucide-react";
import { NAV, MOBILE_MAIN } from "@/components/shell/nav";
import { ToastProvider } from "@/components/ui/Toast";
import { FocusProvider, useFocus, fmtClock } from "@/components/shell/FocusProvider";
import QuickAdd from "@/components/shell/QuickAdd";
import CommandPalette from "@/components/shell/CommandPalette";
import Modal from "@/components/ui/Modal";
import Logo from "@/components/ui/Logo";
import MusicProvider from "@/components/music/MusicProvider";
import MiniPlayer from "@/components/music/MiniPlayer";
import { setTheme } from "@/actions/settings";
import SlideshowProvider, { useThemeFx } from "@/components/shell/SlideshowProvider";

function Shell({ user, currency, projects, children }) {
  const path = usePathname(); const focus = useFocus(); const fx = useThemeFx();
  const [palette, setPalette] = useState(false);
  const [add, setAdd] = useState({ open: false, type: "task", prefill: null });
  const [more, setMore] = useState(false);
  const [bell, setBell] = useState(false);
  const [notes, setNotes] = useState([]);

  const openAdd = useCallback((type = "task", prefill = null) => { setPalette(false); setMore(false); setAdd({ open: true, type, prefill }); }, []);
  const changeTheme = useCallback((id) => {
    document.documentElement.setAttribute("data-theme", id); document.documentElement.removeAttribute("style");
    fx.play(); fx.setCurrent(id); setTheme(id);
  }, [fx]);
  useEffect(() => { try { if (path) localStorage.setItem("last-path", path); } catch {} }, [path]);

  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((v) => !v); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { const a = new URLSearchParams(window.location.search).get("add"); if (a) { setAdd({ open: true, type: a }); window.history.replaceState({}, "", window.location.pathname); } }, []);

  const loadNotes = useCallback(async () => {
    try { const r = await fetch("/api/notifications"); if (!r.ok) return; const j = await r.json(); setNotes(j.items || []);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const seen = JSON.parse(localStorage.getItem("seen-notes") || "[]"); const fresh = (j.items || []).filter((n) => !seen.includes(n.id));
        fresh.slice(0, 3).forEach((n) => new Notification(n.text, { icon: "/icons/icon-192.png" }));
        if (fresh.length) localStorage.setItem("seen-notes", JSON.stringify([...(j.items || []).map((n) => n.id)].slice(-60)));
      } } catch {}
  }, []);
  useEffect(() => { loadNotes(); const i = setInterval(loadNotes, 5 * 60 * 1000); window.addEventListener("focus-complete", loadNotes); return () => { clearInterval(i); window.removeEventListener("focus-complete", loadNotes); }; }, [loadNotes]);

  const active = (href) => path === href || path.startsWith(href + "/");
  const first = MOBILE_MAIN.map((h) => NAV.find((n) => n.href === h));
  return (
    <div className="app">
      <aside className="sidebar" aria-label="Primary">
        <Link href="/dashboard" className="brand"><Logo size={30} /><span>{user.display_name}&apos;s OS</span></Link>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="nav-link" aria-current={active(n.href) ? "page" : undefined}><n.icon size={17} />{n.label}</Link>)}
        </nav>
        <div className="mt-auto pt-3 small muted px-2 flex items-center gap-2"><span className="kbd">Ctrl</span><span className="kbd">K</span> command palette</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Link href="/dashboard" className="brand md:hidden" style={{ padding: 0 }}><Logo size={30} /></Link>
          <div className="grow" />
          {focus?.t && <Link href="/focus" className="chip chip-active" style={{ minHeight: 30 }} aria-label="Focus timer running"><Timer size={13} /> {fmtClock(focus.remaining)}</Link>}
          <button className="btn btn-ghost btn-icon md:hidden" onClick={() => setPalette(true)} aria-label="Search and commands"><Search size={18} /></button>
          <button className="btn btn-sm hidden md:inline-flex" onClick={() => setPalette(true)} aria-label="Open command palette"><Command size={14} /> Search or run a command</button>
          <button className="btn btn-primary btn-sm hidden md:inline-flex" onClick={() => openAdd("task")}><Plus size={15} /> Add</button>
          <div className="relative">
            <button className="btn btn-ghost btn-icon" onClick={() => setBell((v) => !v)} aria-label={`Notifications (${notes.length})`} aria-expanded={bell}><Bell size={18} />{notes.length > 0 && <span className="dot red" style={{ position: "absolute", top: 7, right: 8 }} />}</button>
            {bell && <>
              <div className="fixed inset-0 z-40" onClick={() => setBell(false)} />
              <div className="card absolute right-0 z-50 mt-2" style={{ width: "min(88vw, 340px)", maxHeight: "60dvh", overflow: "auto" }} role="dialog" aria-label="Notifications">
                <div className="card-title">Notifications
                  {typeof Notification !== "undefined" && Notification.permission === "default" && <button className="btn btn-sm" onClick={() => Notification.requestPermission().then(() => setBell(false))}>Enable browser alerts</button>}</div>
                {notes.length === 0 ? <div className="empty">You&apos;re all caught up.</div> : notes.map((n) => (
                  <Link key={n.id} href={n.href} onClick={() => setBell(false)} className="list-row"><span className={`dot ${n.tone}`} /><span className="grow small">{n.text}</span></Link>))}
              </div>
            </>}
          </div>
          <div key={path} className="fx-bar" aria-hidden />
        </header>
        <main className="content" id="main">{children}</main>
      </div>

      <MiniPlayer />
      <nav className="bottom-nav" aria-label="Primary mobile">
        {first.slice(0, 2).map((n) => <Link key={n.href} href={n.href} className="bn-item" aria-current={active(n.href) ? "page" : undefined}><n.icon size={20} />{n.label}</Link>)}
        <button className="bn-fab" onClick={() => openAdd("task")} aria-label="Quick add"><Plus size={22} /></button>
        <Link href={first[2].href} className="bn-item" aria-current={active(first[2].href) ? "page" : undefined}>{(() => { const I = first[2].icon; return <I size={20} />; })()}{first[2].label}</Link>
        <button className="bn-item" onClick={() => setMore(true)} aria-label="More modules"><MoreHorizontal size={20} />More</button>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="All modules">
        <div className="grid grid-cols-3 gap-2">
          {NAV.map((n) => <Link key={n.href} href={n.href} onClick={() => setMore(false)} className="card flex flex-col items-center gap-1 text-center small" style={{ padding: 12 }}><n.icon size={20} />{n.label}</Link>)}
        </div>
      </Modal>
      <QuickAdd open={add.open} type={add.type} prefill={add.prefill} onType={(t) => setAdd((a) => ({ ...a, open: true, type: t }))} onClose={() => setAdd((a) => ({ ...a, open: false }))} projects={projects} currency={currency} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} onAdd={openAdd} onTheme={changeTheme} onSlideshow={(p) => fx.update(p)} slideshowOn={fx.state.enabled} />
    </div>
  );
}

export default function AppShell(props) {
  return <ToastProvider><SlideshowProvider initial={props.slideshow}><FocusProvider><MusicProvider><Shell {...props} /></MusicProvider></FocusProvider></SlideshowProvider></ToastProvider>;
}
