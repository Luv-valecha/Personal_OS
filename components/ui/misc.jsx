"use client";
import { Fragment } from "react";
export const Empty = ({ title, hint, children }) => <div className="empty"><strong>{title}</strong>{hint}{children && <div className="mt-3">{children}</div>}</div>;
export const Loader = ({ label = "Loading" }) => <div className="loader-wrap" role="status" aria-label={label}><div className="loader" /></div>;
export const Progress = ({ value, label }) => <div className="progress" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
export const Tags = ({ tags = [] }) => tags.length ? <span className="inline-flex flex-wrap gap-1">{tags.map((t) => <span key={t} className="chip">#{t}</span>)}</span> : null;
export const ErrorBox = ({ children, onRetry }) => <div className="error-box" role="alert">{children}{onRetry && <button className="btn btn-sm ml-2" onClick={onRetry}>Retry</button>}</div>;

// ---- Safe Markdown renderer: builds React elements (never raw HTML), so user content can't inject markup. ----
function inline(text, key) {
  const out = []; let rest = text, i = 0;
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s<]+)/;
  while (rest) {
    const m = rest.match(re); if (!m) { out.push(rest); break; }
    if (m.index) out.push(rest.slice(0, m.index));
    const t = m[0], k = `${key}-${i++}`;
    if (m[1]) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (m[3]) out.push(<em key={k}>{t.slice(1, -1)}</em>);
    else if (m[4]) { const mm = t.match(/\[([^\]]+)\]\(([^)]+)\)/); out.push(<a key={k} href={mm[2]} target="_blank" rel="noopener noreferrer nofollow">{mm[1]}</a>); }
    else out.push(<a key={k} href={t} target="_blank" rel="noopener noreferrer nofollow">{t}</a>);
    rest = rest.slice(m.index + t.length);
  }
  return out;
}
export function Markdown({ text = "" }) {
  const lines = text.replace(/\r/g, "").split("\n"); const blocks = []; let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { const code = []; i++; while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]); i++; blocks.push(<pre key={k++}><code>{code.join("\n")}</code></pre>); continue; }
    const h = l.match(/^(#{1,3})\s+(.*)/); if (h) { const T = `h${h[1].length}`; blocks.push(<T key={k++}>{inline(h[2], k)}</T>); i++; continue; }
    if (/^---+$/.test(l.trim())) { blocks.push(<hr key={k++} />); i++; continue; }
    if (/^>\s?/.test(l)) { const q = []; while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, "")); blocks.push(<blockquote key={k++}>{inline(q.join(" "), k)}</blockquote>); continue; }
    if (/^\s*[-*]\s+/.test(l)) { const it = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) it.push(lines[i++].replace(/^\s*[-*]\s+/, "")); blocks.push(<ul key={k++}>{it.map((x, j) => { const c = x.match(/^\[( |x)\]\s+(.*)/i); return <li key={j} style={c ? { listStyle: "none", marginLeft: "-1.2em" } : undefined}>{c ? <Fragment><input type="checkbox" checked={c[1] !== " "} readOnly aria-label="checklist item" /> {inline(c[2], j)}</Fragment> : inline(x, j)}</li>; })}</ul>); continue; }
    if (/^\s*\d+\.\s+/.test(l)) { const it = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) it.push(lines[i++].replace(/^\s*\d+\.\s+/, "")); blocks.push(<ol key={k++}>{it.map((x, j) => <li key={j}>{inline(x, j)}</li>)}</ol>); continue; }
    if (!l.trim()) { i++; continue; }
    const para = []; while (i < lines.length && lines[i].trim() && !/^(```|#{1,3}\s|>|\s*[-*]\s|\s*\d+\.\s|---+$)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={k++}>{inline(para.join(" "), k)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
