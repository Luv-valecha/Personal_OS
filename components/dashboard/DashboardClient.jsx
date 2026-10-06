"use client";
import { useState } from "react";
import { ArrowUp, ArrowDown, Eye, EyeOff, Maximize2, SlidersHorizontal, Check, RotateCcw } from "lucide-react";
import { WIDGET_COMPONENTS } from "@/components/dashboard/widgets";
import { WIDGETS, DEFAULT_LAYOUT } from "@/lib/layout";
import { saveLayout } from "@/actions/settings";
import { useAction } from "@/components/ui/useAction";

const SIZES = ["sm", "md", "lg"]; const SPAN = { sm: "span-md", md: "span-md", lg: "span-lg" };
export default function DashboardClient({ layout: initial, data, ctx, greeting, dateLabel }) {
  const [layout, setLayout] = useState(initial); const [edit, setEdit] = useState(false); const { run, pending } = useAction();
  const move = (i, d) => setLayout((l) => { const a = [...l]; const j = i + d; if (j < 0 || j >= a.length) return l; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const patch = (i, p) => setLayout((l) => l.map((w, k) => (k === i ? { ...w, ...p } : w)));
  const save = async () => { const r = await run(() => saveLayout(layout), { ok: "Layout saved" }); if (r) setEdit(false); };
  const shown = edit ? layout : layout.filter((w) => w.visible);
  return (<>
    <div className="page-head">
      <div><h1 style={{ fontSize: 26 }}>{greeting}</h1><p className="sub">{dateLabel}</p></div>
      <div className="flex gap-2">
        {edit ? <>
          <button className="btn btn-ghost" onClick={() => setLayout(DEFAULT_LAYOUT)}><RotateCcw size={15} /> Reset</button>
          <button className="btn" onClick={() => { setLayout(initial); setEdit(false); }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={pending}><Check size={15} /> Save layout</button></>
          : <button className="btn" onClick={() => setEdit(true)}><SlidersHorizontal size={15} /> Customize</button>}
      </div>
    </div>
    <div className="grid-cards">
      {shown.map((w) => {
        const C = WIDGET_COMPONENTS[w.id]; const i = layout.findIndex((x) => x.id === w.id);
        return (
          <section key={w.id} className={`card ${SPAN[w.size] || "span-md"}`} style={edit && !w.visible ? { opacity: 0.5 } : undefined} aria-label={WIDGETS[w.id].title}>
            {edit && <div className="flex items-center gap-1 mb-3 flex-wrap" style={{ borderBottom: "1px dashed var(--color-border)", paddingBottom: 8 }}>
              <strong className="small grow">{WIDGETS[w.id].title}</strong>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => move(i, -1)} aria-label={`Move ${WIDGETS[w.id].title} up`}><ArrowUp size={15} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => move(i, 1)} aria-label={`Move ${WIDGETS[w.id].title} down`}><ArrowDown size={15} /></button>
              <button className="btn btn-ghost btn-sm" onClick={() => patch(i, { size: SIZES[(SIZES.indexOf(w.size) + 1) % 3] })} aria-label="Resize widget"><Maximize2 size={14} /> {w.size.toUpperCase()}</button>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => patch(i, { visible: !w.visible })} aria-label={w.visible ? "Hide widget" : "Show widget"}>{w.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button></div>}
            {w.visible || !edit ? <C data={data} ctx={ctx} /> : <div className="sub">Hidden</div>}
          </section>);
      })}
    </div>
  </>);
}
