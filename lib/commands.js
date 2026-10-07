import { parseQuickTask } from "@/lib/nlp";
import { zonedToIso, todayStr } from "@/lib/dates";

// Deterministic natural-language command parsing for the command palette. No AI, no guessing:
// a command is only executed directly when the user used an explicit verb ("add task: …", "start 45 minute focus").
// Anything ambiguous returns a *form* intent (opens the structured Quick Add pre-filled) instead.
const PAGES = { today: "/today", dashboard: "/dashboard", tasks: "/tasks", calendar: "/calendar", projects: "/projects", focus: "/focus", notes: "/notes", ideas: "/ideas", deadlines: "/deadlines", settings: "/settings", expenses: "/expenses", files: "/files", bookmarks: "/bookmarks", developer: "/developer", activity: "/activity", search: "/search" };
const ENTITY = { task: "task", todo: "task", note: "note", idea: "idea", expense: "expense", bookmark: "bookmark", link: "link", event: "event", deadline: "deadline", project: "project" };
const CATS = ["food", "transport", "shopping", "bills", "entertainment", "health", "other"];

function parseTime(text) { // "6pm", "at 18:30", "9 am"
  const m = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || text.match(/\bat\s+(\d{1,2}):(\d{2})\b/i) || text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!m) return null; let h = +m[1]; const min = m[2] ? +m[2] : 0; const ap = (m[3] || "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0; if (h > 23) return null;
  return { h, min, rest: text.replace(m[0], " ").replace(/\s+/g, " ").trim() };
}
const money = (n) => n;

export function parseCommand(raw, tz) {
  const text = raw.trim(); if (!text) return null; let m;
  // Focus: "start 45 minute focus", "focus 45", "start focus", "25 min focus on ML report"
  if ((m = text.match(/^(?:start|begin)\s+(?:a\s+)?(\d{1,3})[\s-]*(?:min(?:ute)?s?|m)\s*(?:focus|timer|session)?(?:\s+(?:on|for)\s+(.+))?$/i)) || (m = text.match(/^(?:start\s+)?(\d{1,3})[\s-]*(?:min(?:ute)?s?|m)\s+(?:focus|timer|session)(?:\s+(?:on|for)\s+(.+))?$/i)) || (m = text.match(/^(?:start\s+)?focus\s+(?:for\s+)?(\d{1,3})\s*(?:min(?:ute)?s?|m)?(?:\s+(?:on|for)\s+(.+))?$/i))) {
    const minutes = +m[1]; if (minutes >= 1 && minutes <= 240) return { type: "focus", minutes, label: (m[2] || "").trim(), title: `Start ${minutes} minute focus${m[2] ? ` on “${m[2].trim()}”` : ""}` };
  }
  if ((m = text.match(/^(?:start|begin)\s+focus(?:\s+(?:on|for)\s+(.+))?$/i))) return { type: "focus", minutes: 25, label: (m[1] || "").trim(), title: `Start 25 minute focus${m[1] ? ` on “${m[1].trim()}”` : ""}` };
  // Navigation
  if ((m = text.match(/^(?:open|go to|goto|show me|show)\s+(?:the\s+)?(?:my\s+)?(\w+)$/i)) && PAGES[m[1].toLowerCase()]) return { type: "nav", href: PAGES[m[1].toLowerCase()], title: `Open ${m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()}` };
  // Add <entity>: …   |   <entity>: …
  m = text.match(/^(?:(?:add|new|create)\s+(?:a\s+|an\s+)?)(task|todo|note|idea|expense|bookmark|link|event|deadline|project)\b\s*[:\-]?\s*(.*)$/i) || text.match(/^(task|todo|note|idea|expense|bookmark|deadline|event|project)\s*:\s*(.+)$/i);
  if (!m) return null;
  const entity = ENTITY[m[1].toLowerCase()]; const body = (m[2] || "").trim();
  const form = (prefill = {}) => ({ type: "form", entity, prefill, title: `Add ${entity}${body ? ` “${body.slice(0, 40)}”` : ""} (opens form)` });
  if (!body) return form();
  if (entity === "task") { const p = parseQuickTask(body, tz); return { type: "create", entity, payload: { text: body }, title: `Create task “${p.title}”${p.due_date ? ` · due ${p.due_date}` : ""}${p.priority === "high" ? " · high priority" : ""}` }; }
  if (entity === "idea") return { type: "create", entity, payload: { title: body.charAt(0).toUpperCase() + body.slice(1) }, title: `Capture idea “${body}”` };
  if (entity === "note") return { type: "create", entity, payload: { title: body.charAt(0).toUpperCase() + body.slice(1), body: "" }, title: `Create note “${body}”` };
  if (entity === "project") return { type: "create", entity, payload: { name: body.charAt(0).toUpperCase() + body.slice(1), status: "planned" }, title: `Create project “${body}”` };
  if (entity === "bookmark") { const u = body.match(/https?:\/\/\S+|(?:[\w-]+\.)+[a-z]{2,}(?:\/\S*)?/i); return u ? { type: "create", entity, payload: { url: u[0] }, title: `Save bookmark ${u[0]}` } : form(); }
  if (entity === "link") { const u = body.match(/https?:\/\/\S+|\/[a-z]\S*/i); return u ? { type: "create", entity, payload: { url: u[0], title: body.replace(u[0], "").replace(/[:\-]\s*$/, "").trim() || u[0].replace(/^https?:\/\/(www\.)?/, "").split("/")[0] }, title: `Add quick link ${u[0]}` } : form({ title: body }); }
  if (entity === "expense") {
    const a = body.match(/(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)/i); if (!a) return form({ description: body });
    const rest = body.replace(a[0], " ").replace(/\b(on|for|spent)\b/gi, " ").replace(/\s+/g, " ").trim(); const cat = CATS.find((c) => rest.toLowerCase().includes(c)) || "other";
    return { type: "create", entity, payload: { amount: money(+a[1]), category: cat, description: rest }, title: `Add expense ${a[1]} · ${cat}${rest ? ` · ${rest}` : ""}` };
  }
  if (entity === "deadline") { const p = parseQuickTask(body, tz); return p.due_date ? { type: "create", entity, payload: { title: p.title, due_date: p.due_date }, title: `Add deadline “${p.title}” · ${p.due_date}` } : form({ title: p.title }); }
  if (entity === "event") {
    const p = parseQuickTask(body, tz); const t = parseTime(p.title); // needs BOTH a day and a time, otherwise ask — never guess
    if (!p.due_date || !t) return form({ title: (t ? t.rest : p.title) });
    const start = zonedToIso(`${p.due_date}T${String(t.h).padStart(2, "0")}:${String(t.min).padStart(2, "0")}`, tz);
    return { type: "create", entity, payload: { title: t.rest.charAt(0).toUpperCase() + t.rest.slice(1) || "Event", starts_at: start, ends_at: new Date(new Date(start).getTime() + 3600000).toISOString() }, title: `Add event “${t.rest}” · ${p.due_date} ${String(t.h).padStart(2, "0")}:${String(t.min).padStart(2, "0")}` };
  }
  return form();
}
export { todayStr };
