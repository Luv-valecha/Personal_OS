"use client";
import { repeatToPayload } from "@/lib/repeat-ui";
import { describeRule, effectiveRule } from "@/lib/recurrence";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRESETS = [["none", "Does not repeat"], ["daily", "Every day"], ["weekday", "Every weekday"], ["weekly", "Every week"], ["monthly", "Every month"], ["yearly", "Every year"], ["custom", "Custom…"]];

// Compact repeat control: preset → (custom: every N units / weekdays / day of month) → ends. All state lives in `value` (see lib/repeat-ui.js).
export default function RepeatPicker({ value: v, onChange, startDate }) {
  const set = (patch) => onChange({ ...v, ...patch });
  const p = repeatToPayload(v);
  const rule = p.error ? null : p.recurrence_rule || effectiveRule({ recurrence: p.recurrence }, startDate);
  const toggleDay = (d) => set({ weekdays: v.weekdays.includes(d) ? v.weekdays.filter((x) => x !== d) : [...v.weekdays, d] });
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="label">Repeats</legend>
      <select className="select" value={v.preset} onChange={(e) => set({ preset: e.target.value })} aria-label="Repeat">{PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {v.preset === "custom" && (
        <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
            <span className="small">Every</span>
            <input className="input" style={{ width: 70 }} type="number" min={1} max={365} inputMode="numeric" value={v.interval} onChange={(e) => set({ interval: e.target.value })} aria-label="Repeat every" />
            <select className="select" style={{ width: "auto" }} value={v.unit} onChange={(e) => set({ unit: e.target.value })} aria-label="Repeat unit"><option value="days">day(s)</option><option value="weeks">week(s)</option><option value="months">month(s)</option><option value="years">year(s)</option></select>
          </div>
          {v.unit === "weeks" && (
            <div role="group" aria-label="Repeat on weekdays" className="flex gap-1" style={{ flexWrap: "wrap" }}>
              {DAYS.map((d, i) => <button key={d} type="button" className="btn btn-sm" aria-pressed={v.weekdays.includes(i)} onClick={() => toggleDay(i)} style={v.weekdays.includes(i) ? { background: "var(--color-primary)", color: "var(--color-primary-fg, #fff)" } : undefined}>{d}</button>)}
              <span className="small muted" style={{ alignSelf: "center" }}>{v.weekdays.length ? "" : "same weekday as the start"}</span>
            </div>)}
          {v.unit === "months" && (
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
              <select className="select" style={{ width: "auto" }} value={v.monthMode} onChange={(e) => set({ monthMode: e.target.value })} aria-label="Day of month"><option value="same">Same day as the start</option><option value="day">On day…</option><option value="last">Last day of the month</option></select>
              {v.monthMode === "day" && <input className="input" style={{ width: 70 }} type="number" min={1} max={31} value={v.monthDay} onChange={(e) => set({ monthDay: e.target.value })} aria-label="Day of the month" />}
            </div>)}
        </div>)}
      {v.preset !== "none" && (
        <div className="flex items-center gap-2" style={{ marginTop: 8, flexWrap: "wrap" }}>
          <span className="small">Ends</span>
          <select className="select" style={{ width: "auto" }} value={v.ends} onChange={(e) => set({ ends: e.target.value })} aria-label="Repeat ends"><option value="never">Never</option><option value="until">On a date</option><option value="count">After a number of times</option></select>
          {v.ends === "until" && <input className="input" style={{ width: "auto" }} type="date" value={v.until} onChange={(e) => set({ until: e.target.value })} aria-label="Repeat until" />}
          {v.ends === "count" && <><input className="input" style={{ width: 80 }} type="number" min={1} max={1000} value={v.count} onChange={(e) => set({ count: e.target.value })} aria-label="Number of occurrences" /><span className="small">times</span></>}
        </div>)}
      {v.preset !== "none" && <p className="small muted" style={{ margin: "6px 0 0" }} role={p.error ? "alert" : undefined}>{p.error || describeRule(rule, startDate)}</p>}
    </fieldset>
  );
}
