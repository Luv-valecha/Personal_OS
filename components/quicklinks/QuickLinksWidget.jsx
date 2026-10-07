"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Star } from "lucide-react";
import QuickLinkTile from "@/components/quicklinks/QuickLinkTile";
import QuickLinkForm from "@/components/quicklinks/QuickLinkForm";
import { Empty } from "@/components/ui/misc";

export default function QuickLinksWidget({ data }) {
  const links = data.quicklinks || []; const [adding, setAdding] = useState(false);
  return (<>
    <div className="card-title"><span>Quick links</span><Link href="/settings#quicklinks" className="small">Manage</Link></div>
    {links.length === 0 ? <Empty title="No links yet" hint="Save the places you open every day." /> :
      <div className="grid grid-cols-2 gap-x-2">{links.slice(0, 8).map((l) => <div key={l.id} className="relative" style={{ minWidth: 0 }}>{l.favorite && <Star size={9} fill="var(--color-accent)" color="var(--color-accent)" style={{ position: "absolute", top: 4, right: 4 }} aria-label="Pinned" />}<QuickLinkTile link={l} /></div>)}</div>}
    {links.length > 8 && <Link href="/settings#quicklinks" className="small muted">+{links.length - 8} more</Link>}
    <button className="btn btn-ghost btn-sm mt-2" onClick={() => setAdding(true)}><Plus size={14} /> Add link</button>
    {adding && <QuickLinkForm onClose={() => setAdding(false)} />}
  </>);
}
