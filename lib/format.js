export const money = (n, cur = "₹") => `${cur}${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export function activityText(a) {
  const v = { created: "Created", completed: "Completed", deleted: "Deleted", added: "Added" }[a.action] || a.action;
  const k = { task: "task", note: "note", bookmark: "bookmark", project: "project", expense: "expense", file: "", idea: "idea", event: "event", deadline: "deadline", focus: "focus session", developer: "developer project" }[a.kind] ?? a.kind;
  return `${v} ${k}${a.label ? ": " + a.label : ""}`.replace(/\s+:/, ":");
}
export function relTime(ts, tz) {
  const d = new Date(ts), diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now"; if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d) === new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const t = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
  if (sameDay) return t; if (diff < 172800) return "Yesterday"; return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: tz });
}
export const STATUS_LABEL = { idea: "Idea", planned: "Planned", in_progress: "In progress", paused: "Paused", completed: "Completed", archived: "Archived" };
