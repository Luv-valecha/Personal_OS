"use client";
import { SORT_MODES } from "@/lib/tasksort";
export default function SortSelect({ value, onChange, pending }) {
  return (<label className="flex items-center gap-2 small muted" style={{ whiteSpace: "nowrap" }}>Sort
    <select className="select" style={{ minHeight: 30, padding: "2px 8px", width: "auto", fontSize: 13 }} value={value} onChange={(e) => onChange(e.target.value)} disabled={pending} aria-label="Task sort order">
      {SORT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>);
}
