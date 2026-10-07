"use client";
import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { THEME_GROUPS, DEFAULT_CUSTOM, customThemeStyle } from "@/lib/themes";
import { setTheme, saveCustomTheme, applyCustomTheme, deleteCustomTheme } from "@/actions/settings";
import { useAction } from "@/components/ui/useAction";
import { Field } from "@/components/ui/Fields";
import { useThemeFx } from "@/components/shell/SlideshowProvider";

export default function ThemeSelector({ current, customThemes, activeCustom }) {
  const { run, pending } = useAction(); const fx = useThemeFx(); const [sel, setSel] = useState(current);
  const animate = () => fx.play();
  async function pick(id) { document.documentElement.setAttribute("data-theme", id); document.documentElement.removeAttribute("style"); setSel(id); animate(); fx.setCurrent(id); await run(() => setTheme(id)); }
  async function useCustom(t) { applyStyle(t.tokens); setSel("custom"); animate(); fx.setCurrent("custom:" + t.id); await run(() => applyCustomTheme(t.id)); }
  return (<div className="flex flex-col gap-6">
    {THEME_GROUPS.map((g) => (<div key={g.id}><div className="sub mb-2">{g.label}</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {g.themes.map((t) => (<button key={t.id} data-theme={t.id} type="button" className="theme-card" aria-pressed={sel === t.id} onClick={() => pick(t.id)}>
          <div className="flex items-center justify-between"><strong style={{ fontFamily: "var(--font-heading)", fontSize: 14 }}>{t.name}</strong>{sel === t.id && <Check size={15} color="var(--color-primary)" aria-label="Active" />}</div>
          <div className="swatch"><i style={{ background: "var(--c-primary)" }} /><i style={{ background: "var(--c-secondary)" }} /><i style={{ background: "var(--c-accent)" }} /><i style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }} /></div>
          <div className="small" style={{ color: "var(--color-text-muted)" }}>{t.blurb}</div></button>))}</div></div>))}
    {customThemes.length > 0 && <div><div className="sub mb-2">Your themes</div><div className="flex flex-col gap-2">{customThemes.map((t) => (
      <div key={t.id} className="list-row card" style={{ padding: "8px 12px" }}><span className="flex gap-1">{["primary", "secondary", "accent", "background"].map((k) => <i key={k} style={{ width: 14, height: 14, borderRadius: 4, background: t.tokens[k], border: "1px solid var(--color-border)" }} />)}</span><strong className="grow">{t.name}</strong>
        {sel === "custom" && activeCustom === t.id ? <span className="chip chip-active">Active</span> : <button className="btn btn-sm" onClick={() => useCustom(t)}>Use</button>}
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => confirm(`Delete “${t.name}”?`) && run(() => deleteCustomTheme(t.id), { ok: "Theme deleted" })} aria-label={`Delete ${t.name}`}><Trash2 size={14} /></button></div>))}</div></div>}
    <CustomBuilder onApplied={() => { setSel("custom"); animate(); }} pending={pending} />
  </div>);
}
function applyStyle(tokens) {
  const el = document.documentElement; el.setAttribute("data-theme", "custom");
  for (const [k, v] of Object.entries(customThemeStyle(tokens))) el.style.setProperty(k, v);
}
function CustomBuilder({ onApplied }) {
  const { run, pending } = useAction(); const [name, setName] = useState("My theme"); const [t, setT] = useState(DEFAULT_CUSTOM);
  const set = (k, v) => { const n = { ...t, [k]: v }; setT(n); applyStyle(n); };
  const color = (k, label) => <Field label={label} key={k}><div className="flex gap-2"><input type="color" value={t[k]} onChange={(e) => set(k, e.target.value)} aria-label={label} style={{ width: 44, height: 40, padding: 2, background: "none", border: "1px solid var(--color-border)", borderRadius: 8 }} /><input className="input" value={t[k]} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && set(k, e.target.value)} style={{ fontFamily: "monospace" }} aria-label={`${label} hex`} /></div></Field>;
  async function save() { if (await run(() => saveCustomTheme({ name, tokens: t }), { ok: "Theme saved" })) onApplied(); }
  return (<div className="card"><div className="card-title">Custom theme builder <span className="small">Live preview — changes apply instantly</span></div>
    <div className="form-grid two">
      {color("primary", "Primary")}{color("secondary", "Secondary")}{color("accent", "Accent")}{color("background", "Background")}{color("surface", "Surface")}{color("border", "Border")}{color("text", "Text")}
      <Field label={`Border radius: ${t.radius}px`}><input type="range" min="0" max="28" value={t.radius} onChange={(e) => set("radius", Number(e.target.value))} /></Field>
      <Field label="Card style"><select className="select" value={t.card} onChange={(e) => set("card", e.target.value)}><option value="outlined">Outlined</option><option value="elevated">Elevated</option><option value="flat">Flat</option></select></Field>
      <Field label="Animation intensity"><select className="select" value={t.intensity} onChange={(e) => set("intensity", e.target.value)}><option value="none">None</option><option value="subtle">Subtle</option><option value="medium">Medium</option></select></Field>
      <Field label="Background effect"><select className="select" value={t.effect} onChange={(e) => set("effect", e.target.value)}><option value="none">None</option><option value="glow">Soft glow</option><option value="grid">Grid</option><option value="dots">Dots</option></select></Field></div>
    <div className="flex gap-2 mt-4 flex-wrap"><input className="input" style={{ maxWidth: 220 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Theme name" maxLength={40} /><button className="btn btn-primary" onClick={save} disabled={pending || !name.trim()}>Save &amp; use theme</button></div>
  </div>);
}
