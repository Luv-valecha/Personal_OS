// Dashboard widget registry + default layout. size: sm | md | lg (column span on wide screens).
export const WIDGETS = {
  overview: { title: "Today", defaultSize: "lg" },
  tasks: { title: "Tasks", defaultSize: "md" },
  calendar: { title: "Upcoming events", defaultSize: "md" },
  deadlines: { title: "Deadlines", defaultSize: "md" },
  money: { title: "Money", defaultSize: "md" },
  projects: { title: "Projects", defaultSize: "md" },
  notes: { title: "Notes", defaultSize: "md" },
  focus: { title: "Focus", defaultSize: "md" },
  weather: { title: "Weather", defaultSize: "sm" },
  activity: { title: "Activity", defaultSize: "md" },
};
export const DEFAULT_LAYOUT = ["overview", "tasks", "deadlines", "calendar", "focus", "money", "projects", "notes", "weather", "activity"]
  .map((id) => ({ id, visible: true, size: WIDGETS[id].defaultSize }));
// Merge a saved layout with the registry (drops unknown widgets, appends new ones).
export function normalizeLayout(saved) {
  const out = []; const seen = new Set();
  for (const w of Array.isArray(saved) ? saved : []) {
    if (WIDGETS[w?.id] && !seen.has(w.id)) { seen.add(w.id); out.push({ id: w.id, visible: w.visible !== false, size: ["sm", "md", "lg"].includes(w.size) ? w.size : WIDGETS[w.id].defaultSize }); }
  }
  for (const d of DEFAULT_LAYOUT) if (!seen.has(d.id)) out.push({ ...d });
  return out;
}
