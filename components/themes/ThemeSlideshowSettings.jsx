"use client";
import { useEffect, useMemo, useState } from "react";
import { Play, Pause, SkipForward, Square } from "lucide-react";
import { THEME_GROUPS, ALL_THEMES } from "@/lib/themes";
import { saveSlideshow, slideshowControl } from "@/actions/slideshow";
import { useAction } from "@/components/ui/useAction";
import { useThemeFx } from "@/components/shell/SlideshowProvider";

const PRESETS = [[5, "5 minutes"], [15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [360, "6 hours"], [720, "12 hours"], [1440, "24 hours"]];
const nameOf = (id, customs) => (id.startsWith("custom:") ? customs.find((c) => c.id === id.slice(7))?.name || "Custom theme" : ALL_THEMES.find((t) => t.id === id)?.name || id);
const fmtLeft = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); if (m < 1) return "less than a minute"; if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`; const h = Math.floor(m / 60), r = m % 60; return `${h}h${r ? ` ${r}m` : ""}`; };

export default function ThemeSlideshowSettings({ customThemes }) {
  const fx = useThemeFx(); const s = fx.state; const { run, pending } = useAction();
  const [sel, setSel] = useState(new Set(s.themes)); const [mins, setMins] = useState(s.intervalMin || 30); const [custom, setCustom] = useState(!PRESETS.some(([m]) => m === (s.intervalMin || 30)));
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(i); }, []);
  const list = useMemo(() => [...sel], [sel]);
  const dirty = s.enabled && (JSON.stringify([...sel].sort()) !== JSON.stringify([...(s.themes || [])].sort()) || mins !== s.intervalMin);
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const cleanMins = Math.max(5, Math.min(10080, Number(mins) || 30));
  async function save(enabled) { const r = await run(() => saveSlideshow({ enabled, themes: list, interval_min: cleanMins }), { ok: enabled ? (s.enabled ? "Slideshow updated" : "Theme slideshow on") : "Theme slideshow off" }); if (r) fx.update({ ...r, themes: list, intervalMin: cleanMins }, { animate: false }); }
  async function ctl(a, msg) { const r = await run(() => slideshowControl(a), msg ? { ok: msg } : undefined); if (r) fx.update({ ...r, themes: s.themes, intervalMin: s.intervalMin }); }
  const entries = s.themes || []; const ci = entries.indexOf(s.current); const nextEntry = entries.length ? entries[(ci + 1) % entries.length] : null;
  const left = s.nextAt ? new Date(s.nextAt).getTime() - now : 0;
  return (
    <div id="slideshow" className="card" style={{ scrollMarginTop: 72 }}>
      <div className="card-title">
        <span>Theme slideshow</span>
        <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
          <span className="small">{s.enabled ? "ON" : "OFF"}</span>
          <input type="checkbox" role="switch" className="check" checked={s.enabled} aria-label="Theme slideshow" disabled={pending} onChange={(e) => (e.target.checked ? save(true) : ctl("stop", "Theme slideshow off"))} />
        </label>
      </div>
      <p className="small muted" style={{ marginTop: -4, marginBottom: 12 }}>Automatically rotates the look of the app. Layout and data never change — only the theme.</p>

      {s.enabled && <div className="card" style={{ background: "var(--color-surface-elevated)", marginBottom: 14, padding: 12 }}>
        <div className="grid grid-cols-3 gap-2 small"><div><div className="muted">Current</div><strong>{nameOf(s.current || "", customThemes)}</strong></div><div><div className="muted">Next</div><strong>{nextEntry ? nameOf(nextEntry, customThemes) : "—"}</strong></div>
          <div><div className="muted">Next switch</div><strong>{s.paused ? "Paused" : s.nextAt ? `in ${fmtLeft(left)}` : "—"}</strong></div></div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button className="btn btn-sm" onClick={() => ctl("next")} disabled={pending}><SkipForward size={14} /> Skip to next</button>
          {s.paused ? <button className="btn btn-sm" onClick={() => ctl("resume", "Slideshow resumed")}><Play size={14} /> Resume</button> : <button className="btn btn-sm" onClick={() => ctl("pause", "Slideshow paused")}><Pause size={14} /> Pause</button>}
          <button className="btn btn-sm btn-danger" onClick={() => ctl("stop", "Theme slideshow off")}><Square size={13} /> Stop</button></div></div>}

      <div className="flex items-center justify-between mb-2"><span className="label" style={{ margin: 0 }}>Themes in rotation <strong style={{ color: "var(--color-text)" }}>({sel.size} selected)</strong></span>
        <span className="flex gap-1"><button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set(ALL_THEMES.map((t) => t.id).concat(customThemes.map((c) => "custom:" + c.id))))}>All</button><button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>None</button></span></div>
      <div className="flex flex-col gap-3">
        {[...THEME_GROUPS.map((g) => ({ label: g.label, items: g.themes.map((t) => ({ id: t.id, name: t.name })) })), ...(customThemes.length ? [{ label: "Your themes", items: customThemes.map((c) => ({ id: "custom:" + c.id, name: c.name })) }] : [])].map((g) => (
          <fieldset key={g.label} style={{ border: 0, padding: 0, margin: 0 }}><legend className="small muted mb-1">{g.label}</legend>
            <div className="flex flex-wrap gap-2">{g.items.map((t) => (
              <label key={t.id} className="chip chip-btn" style={{ cursor: "pointer", gap: 8 }} aria-pressed={sel.has(t.id)}>
                <input type="checkbox" className="check" style={{ width: 16, height: 16 }} checked={sel.has(t.id)} onChange={() => toggle(t.id)} />{t.name}</label>))}</div></fieldset>))}
      </div>

      <div className="mt-4"><span className="label">Switch theme every</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Interval">
          {PRESETS.map(([m, l]) => <label key={m} className="chip chip-btn" style={{ cursor: "pointer", gap: 6 }} aria-pressed={!custom && mins === m}><input type="radio" name="iv" className="sr-only" checked={!custom && mins === m} onChange={() => { setCustom(false); setMins(m); }} />{l}</label>)}
          <label className="chip chip-btn" style={{ cursor: "pointer", gap: 6 }} aria-pressed={custom}><input type="radio" name="iv" className="sr-only" checked={custom} onChange={() => setCustom(true)} />Custom</label></div>
        {custom && <div className="flex items-center gap-2 mt-2"><input className="input" style={{ width: 110 }} type="number" min="5" max="10080" value={mins} onChange={(e) => setMins(e.target.value)} aria-label="Custom interval in minutes" /><span className="small muted">minutes (minimum 5)</span></div>}</div>

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        {!s.enabled ? <button className="btn btn-primary" onClick={() => save(true)} disabled={pending || sel.size < 2}>Start slideshow</button> : <button className="btn btn-primary" onClick={() => save(true)} disabled={pending || !dirty || sel.size < 2}>Apply changes</button>}
        {sel.size < 2 && <span className="small muted">Select at least 2 themes.</span>}
      </div>
    </div>);
}
