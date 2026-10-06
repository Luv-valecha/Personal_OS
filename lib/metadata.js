import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

// Never let metadata fetching break the app: every path returns {} on failure.
function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase(); return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:");
}
export function normalizeUrl(raw) {
  let s = String(raw || "").trim(); if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { const u = new URL(s); if (!["http:", "https:"].includes(u.protocol)) return null; return u; } catch { return null; }
}
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
export async function fetchMetadata(rawUrl) {
  try {
    let url = normalizeUrl(rawUrl); if (!url) return {};
    for (let hop = 0; hop < 3; hop++) {
      const addrs = await dns.lookup(url.hostname, { all: true });
      if (!addrs.length || addrs.some((a) => isPrivate(a.address))) return {};
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(4000), headers: { "user-agent": "Mozilla/5.0 PersonalDashboardBot", accept: "text/html" } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = new URL(res.headers.get("location"), url); if (!/^https?:$/.test(url.protocol)) return {}; continue; }
      if (!res.ok || !(res.headers.get("content-type") || "").includes("html")) return {};
      const reader = res.body.getReader(); let html = ""; const dec = new TextDecoder();
      while (html.length < 200000) { const { done, value } = await reader.read(); if (done) break; html += dec.decode(value, { stream: true }); if (/<\/head>/i.test(html)) break; }
      reader.cancel().catch(() => {});
      const meta = (n) => (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, "i")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, "i")) || [])[1];
      const title = meta("og:title") || (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
      return { title: title ? decode(title).slice(0, 300) : undefined, description: (meta("og:description") || meta("description") || "") && decode(meta("og:description") || meta("description")).slice(0, 500) };
    }
  } catch {}
  return {};
}
