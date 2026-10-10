// Shared task ordering used by BOTH the dashboard widget and the Tasks page (and the Today view, which reuses the widget).
// "manual" uses tasks.manual_position (a fractional key); the other modes are pure display sorts and never write anything,
// so the saved manual order is always preserved and restored when you switch back.
export const SORT_MODES = [
  { value: "manual", label: "Manual" }, { value: "priority", label: "Priority" }, { value: "due", label: "Due date" },
  { value: "created", label: "Newest first" }, { value: "title", label: "A–Z" },
];
export const isSortMode = (m) => SORT_MODES.some((s) => s.value === m);
const rank = { high: 0, medium: 1, low: 2 };
const due = (t) => t.due_date || "9999-12-31";
const pos = (a, b) => a.manual_position - b.manual_position;
const cmp = {
  manual: pos,
  priority: (a, b) => rank[a.priority] - rank[b.priority] || due(a).localeCompare(due(b)) || pos(a, b),
  due: (a, b) => due(a).localeCompare(due(b)) || rank[a.priority] - rank[b.priority] || pos(a, b),
  created: (a, b) => String(b.created_at).localeCompare(String(a.created_at)) || pos(a, b),
  title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) || pos(a, b),
};
export function sortTasks(list, mode = "manual", { completedLast = true } = {}) {
  const f = cmp[mode] || cmp.manual;
  return [...list].sort((a, b) => (completedLast ? Number(a.completed) - Number(b.completed) : 0) || f(a, b));
}
