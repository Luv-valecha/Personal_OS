"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { logFocusSession } from "@/actions/focus";
import { useToast } from "@/components/ui/Toast";

// Global focus timer so it keeps running while you navigate. State lives in localStorage as an absolute
// end timestamp, so it survives refreshes, tab switches and PWA restarts.
const KEY = "focus-timer-v1";
const Ctx = createContext(null);
export const useFocus = () => useContext(Ctx);

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
const write = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} };

export function FocusProvider({ children }) {
  const toast = useToast();
  const [t, setT] = useState(null);   // {kind,label,total,endsAt|null,remaining,running}
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const finishing = useRef(false);

  useEffect(() => { setT(read()); setReady(true); }, []);
  useEffect(() => { if (ready) write(t); }, [t, ready]);
  useEffect(() => { if (!t?.running) return; const i = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(i); }, [t?.running]);

  const remaining = t ? (t.running ? Math.max(0, Math.round((t.endsAt - now) / 1000)) : t.remaining) : 0;

  const finish = useCallback(async (cur) => {
    if (finishing.current) return; finishing.current = true;
    setT(null);
    try { if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(cur.kind === "focus" ? "Focus session complete" : "Break is over", { body: cur.label || "Nice work.", icon: "/icons/icon-192.png" }); } catch {}
    toast(cur.kind === "focus" ? "Focus session complete — nice work" : "Break is over");
    window.dispatchEvent(new CustomEvent("focus-complete"));
    const res = await logFocusSession({ label: cur.label || "", kind: cur.kind, seconds: cur.total, task_id: cur.taskId || null }).catch(() => null);
    if (!res?.ok) toast("Session finished but couldn't be saved (offline?)", "err");
    finishing.current = false;
  }, [toast]);

  useEffect(() => { if (t?.running && remaining <= 0) finish(t); }, [t, remaining, finish]);

  const api = {
    ready, t, remaining,
    start: (kind, minutes, label = "", taskId = null) => { finishing.current = false; setNow(Date.now()); setT({ kind, label, taskId, total: Math.round(minutes * 60), endsAt: Date.now() + minutes * 60000, remaining: Math.round(minutes * 60), running: true }); },
    pause: () => setT((c) => c && c.running ? { ...c, running: false, remaining: Math.max(0, Math.round((c.endsAt - Date.now()) / 1000)), endsAt: null } : c),
    resume: () => setT((c) => c && !c.running ? { ...c, running: true, endsAt: Date.now() + c.remaining * 1000 } : c),
    reset: () => setT(null),
    stopAndSave: () => { if (!t) return; const done = t.total - remaining; if (t.kind === "focus" && done >= 60) { logFocusSession({ label: t.label, kind: "focus", seconds: done, task_id: t.taskId || null }); toast(`Saved ${Math.round(done / 60)} min of focus`); } setT(null); },
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
export const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
