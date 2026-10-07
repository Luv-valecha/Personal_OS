import Link from "next/link";
// Dashboard | Today — same app, same components, two lenses.
export default function ViewTabs({ active }) {
  return (<nav className="seg" aria-label="Dashboard views">
    {[["dashboard", "Dashboard", "/dashboard"], ["today", "Today", "/today"]].map(([k, l, h]) => (
      <Link key={k} href={h} aria-current={active === k ? "page" : undefined} style={{ padding: "5px 14px", borderRadius: "calc(var(--radius) * .6)", fontSize: 13, minHeight: 30, display: "inline-flex", alignItems: "center", color: active === k ? "var(--color-text)" : "var(--color-text-muted)", background: active === k ? "var(--color-surface)" : "none", boxShadow: active === k ? "0 0 0 1px var(--color-border)" : "none" }}>{l}</Link>))}
  </nav>);
}
