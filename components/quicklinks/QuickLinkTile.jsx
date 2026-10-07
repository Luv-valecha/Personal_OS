"use client";
import Link from "next/link";
import { ICON_MAP, isInternal } from "@/components/quicklinks/icons";

export function LinkIcon({ link, size = 16 }) {
  const I = ICON_MAP[link.icon];
  return <span aria-hidden style={{ width: 30, height: 30, flex: "none", display: "grid", placeItems: "center", borderRadius: "calc(var(--radius) * .6)", background: "color-mix(in srgb, var(--color-primary) 16%, var(--color-surface-elevated))", color: "var(--color-primary)", fontWeight: 700, fontSize: 13 }}>
    {I ? <I size={size} /> : (link.title || "?").trim().charAt(0).toUpperCase()}</span>;
}
// Internal links use client-side navigation; external links open a new tab with noopener.
export default function QuickLinkTile({ link, onNavigate }) {
  const inner = <><LinkIcon link={link} /><span className="grow trunc">{link.title}</span></>;
  const cls = "list-row"; const style = { minWidth: 0, padding: "6px 6px" };
  return isInternal(link.url)
    ? <Link href={link.url} className={cls} style={style} onClick={onNavigate} title={link.description || link.url}>{inner}</Link>
    : <a href={link.url} target="_blank" rel="noopener noreferrer" className={cls} style={style} title={link.description || link.url}>{inner}</a>;
}
