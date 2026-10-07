"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { customThemeStyle } from "@/lib/themes";
import { slideshowControl } from "@/actions/slideshow";

// Owns (a) the one-shot theme-switch transition overlay and (b) the slideshow timer.
// The database is the source of truth (next switch time); this component only *wakes up* at that time and asks the
// server to advance if due. Server-side check on page load handles "app was closed" so there is never a flash.
const Ctx = createContext(null);
export const useThemeFx = () => useContext(Ctx);

export function applyThemeData({ theme, custom }) {
  const el = document.documentElement; el.setAttribute("data-theme", theme); el.removeAttribute("style");
  if (theme === "custom" && custom) for (const [k, v] of Object.entries(customThemeStyle(custom))) el.style.setProperty(k, v);
}

export default function SlideshowProvider({ initial, children }) {
  const [state, setState] = useState(initial); const [wipe, setWipe] = useState(0); const backoff = useRef(0);
  const play = useCallback(() => { setWipe((n) => n + 1); setTimeout(() => setWipe(0), 700); }, []);
  // apply a payload returned by the slideshow actions (updates state, and the theme when it changed)
  const update = useCallback((p, { animate = true } = {}) => {
    if (!p) return;
    setState((s) => ({ ...s, enabled: p.enabled, paused: p.paused, nextAt: p.nextAt ? new Date(p.nextAt).toISOString() : null, current: p.entry ?? s.current, themes: p.themes ?? s.themes, intervalMin: p.intervalMin ?? s.intervalMin }));
    if (p.theme && document.documentElement.getAttribute("data-theme") + (p.custom?.id || "") !== p.theme + (p.custom?.id || "")) { applyThemeData(p); if (animate) play(); }
    else if (p.theme === "custom" && p.custom) { applyThemeData(p); }
  }, [play]);

  // a manual theme choice restarts the countdown from that theme (mirrors setTheme on the server)
  const setCurrent = useCallback((entry) => setState((s) => ({ ...s, current: entry, nextAt: s.enabled && !s.paused ? new Date(Date.now() + s.intervalMin * 60000).toISOString() : s.nextAt })), []);
  const check = useCallback(async () => {
    const r = await slideshowControl("tick").catch(() => null);
    if (r?.ok) update(r.data); else backoff.current = Date.now() + 60000;
  }, [update]);

  useEffect(() => {
    if (!state.enabled || state.paused || !state.nextAt) return;
    const run = () => { if (Date.now() < backoff.current) return; check(); };
    const delay = Math.max(1000, new Date(state.nextAt).getTime() - Date.now() + 500);
    const t = setTimeout(run, Math.min(delay, 2147000000));
    // timers are throttled in background tabs / suspended PWAs: re-check as soon as the app is visible again
    const vis = () => { if (document.visibilityState === "visible" && new Date(state.nextAt).getTime() <= Date.now()) run(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", vis); };
  }, [state.enabled, state.paused, state.nextAt, check]);

  return <Ctx.Provider value={{ state, update, play, setCurrent, applyThemeData }}>{children}{wipe > 0 && <div key={wipe} className="theme-wipe" aria-hidden />}</Ctx.Provider>;
}
