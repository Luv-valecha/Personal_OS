"use client";
import { fmtDate } from "@/lib/dates";
import { money as fm } from "@/lib/format";

// Lightweight SVG charts (no dependencies). Colours come from theme tokens so every theme restyles them.
export const PALETTE = ["var(--color-primary)", "var(--color-secondary)", "var(--color-accent)", "color-mix(in srgb, var(--color-primary) 55%, var(--color-text))", "color-mix(in srgb, var(--color-secondary) 55%, var(--color-text))", "color-mix(in srgb, var(--color-accent) 55%, var(--color-text))", "color-mix(in srgb, var(--color-text) 45%, var(--color-surface))", "color-mix(in srgb, var(--color-primary) 30%, var(--color-surface))"];

export function Bars({ data, cur, label, height = 120, labelEvery = 1, fmtLabel = (x) => x, ariaLabel }) {
  const W = Math.max(280, data.length * 18); const max = Math.max(1, ...data.map((d) => d.value));
  return (<div style={{ overflowX: "auto" }}><svg viewBox={`0 0 ${W} ${height + 18}`} width="100%" style={{ minWidth: Math.min(W, 560), height: height + 18 }} role="img" aria-label={ariaLabel}>
    {data.map((d, i) => { const w = W / data.length; const h = (d.value / max) * (height - 6); return (<g key={i}>
      <rect x={i * w + w * 0.15} width={w * 0.7} rx="3" y={height - h} height={Math.max(d.value ? 3 : 1, h)} fill={d.value ? "var(--color-primary)" : "var(--color-border)"}><title>{`${d.title || d.label}: ${fm(d.value, cur)}`}</title></rect>
      {i % labelEvery === 0 && <text x={i * w + w / 2} y={height + 13} textAnchor="middle" fontSize="9" fill="var(--color-text-muted)">{fmtLabel(d.label)}</text>}</g>); })}</svg></div>);
}

export function Line({ points, cur, height = 120, ariaLabel }) {
  if (!points.length) return null; const W = 420; const max = Math.max(1, ...points.map((p) => p.value)); const step = W / Math.max(1, points.length - 1);
  const path = points.map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - (p.value / max) * (height - 8) - 2).toFixed(1)}`).join(" ");
  return (<svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ height }} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
    <path d={`${path} L${W},${height} L0,${height} Z`} fill="color-mix(in srgb, var(--color-primary) 16%, transparent)" /><path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    <title>{`Cumulative spending, ends at ${fm(points[points.length - 1].value, cur)}`}</title></svg>);
}

export function Donut({ items, cur, size = 150 }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1; const R = 54, C = 2 * Math.PI * R; let acc = 0;
  return (<div className="flex items-center gap-4 flex-wrap"><svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label="Spending by category">
    <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-border)" strokeWidth="18" />
    {items.map((it, i) => { const len = (it.value / total) * C; const el = <circle key={it.label} cx="70" cy="70" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="18" strokeDasharray={`${Math.max(0, len - 1)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)"><title>{`${it.label}: ${fm(it.value, cur)}`}</title></circle>; acc += len; return el; })}
    <text x="70" y="68" textAnchor="middle" fontSize="11" fill="var(--color-text-muted)">Total</text><text x="70" y="84" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-text)">{fm(total, cur)}</text></svg>
    <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: 1, minWidth: 150 }}>{items.map((it, i) => (<li key={it.label} className="flex items-center gap-2 small" style={{ padding: "3px 0" }}><i style={{ width: 10, height: 10, borderRadius: 3, background: PALETTE[i % PALETTE.length], flex: "none" }} /><span className="grow trunc">{it.label}</span><span className="muted">{fm(it.value, cur)} · {Math.round((it.value / total) * 100)}%</span></li>))}</ul></div>);
}
