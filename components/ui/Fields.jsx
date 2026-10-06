"use client";
export function Field({ label, children, className = "" }) {
  return <label className={`field ${className}`}><span className="label">{label}</span>{children}</label>;
}
export function PrioritySelect(props) {
  return <select className="select" {...props}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>;
}
export function ProjectSelect({ projects = [], ...props }) {
  return <select className="select" {...props}><option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>;
}
export const tagsToString = (t) => (Array.isArray(t) ? t.join(", ") : t || "");
export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}
export function Chips({ value, onChange, options, all = "All" }) {
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {[{ value: "", label: all }, ...options].map((o) => <button key={o.value} type="button" className="chip chip-btn" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}
