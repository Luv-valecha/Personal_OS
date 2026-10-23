// Dashboard widget registry + default layout. size: sm | md | lg (column span on wide screens).
export const WIDGETS = {
  overview: { title: "Today", defaultSize: "lg" },
  priority: { title: "Priority now", defaultSize: "lg" },
  timeline: { title: "Today's timeline", defaultSize: "md" },
  quicklinks: { title: "Quick links", defaultSize: "md" },
  tasks: { title: "Tasks", defaultSize: "md" },
  calendar: { title: "Upcoming events", defaultSize: "md" },
  deadlines: { title: "Deadlines", defaultSize: "md" },
  money: { title: "Money", defaultSize: "md" },
  splits: { title: "Splits", defaultSize: "md" },
  projects: { title: "Projects", defaultSize: "md" },
  notes: { title: "Notes", defaultSize: "md" },
  focus: { title: "Focus", defaultSize: "md" },
  weather: { title: "Weather", defaultSize: "sm" },
  activity: { title: "Activity", defaultSize: "md" },
  // V4 widgets: opt-in (hidden until enabled in Customize) so nobody's dashboard suddenly gets crowded; hidden widgets load no data.
  ideas: { title: "Ideas", defaultSize: "md", defaultVisible: false },
  bugs: { title: "Open bugs", defaultSize: "md", defaultVisible: false },
  checklists: { title: "Checklists", defaultSize: "md", defaultVisible: false },
};
export const DEFAULT_LAYOUT = ["overview", "priority", "tasks", "timeline", "deadlines", "calendar", "quicklinks", "focus", "money", "splits", "projects", "notes", "weather", "activity", "ideas", "bugs", "checklists"]
  .map((id) => ({ id, visible: WIDGETS[id].defaultVisible !== false, size: WIDGETS[id].defaultSize }));
// Merge a saved layout with the registry (drops unknown widgets, appends new ones).
export function normalizeLayout(saved) {
  const out = []; const seen = new Set();
  for (const w of Array.isArray(saved) ? saved : []) {
    if (WIDGETS[w?.id] && !seen.has(w.id)) { seen.add(w.id); out.push({ id: w.id, visible: w.visible !== false, size: ["sm", "md", "lg"].includes(w.size) ? w.size : WIDGETS[w.id].defaultSize }); }
  }
  // Widgets added in later versions are slotted in after their predecessor in the default order (not dumped at the end).
  DEFAULT_LAYOUT.forEach((d, i) => {
    if (seen.has(d.id)) return;
    let at = -1;
    for (let k = i - 1; k >= 0 && at < 0; k--) at = out.findIndex((w) => w.id === DEFAULT_LAYOUT[k].id);
    out.splice(at + 1, 0, { ...d }); seen.add(d.id);
  });
  return out;
}
