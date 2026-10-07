import { diffDays } from "@/lib/dates";
// Deterministic "Priority Now" scoring (no AI). Reuses the existing task priority field + project priority/status.
// overdue → very high · due today → high · high priority → high · due tomorrow → moderate · older task → rising · high-priority project → bonus
export function scoreTask(t, today, now = Date.now()) {
  let score = 0; const why = [];
  if (t.due_date) {
    const d = diffDays(t.due_date, today);
    if (d < 0) { score += 100 + Math.min(-d, 10) * 3; why.push(d === -1 ? "Overdue by 1 day" : `Overdue by ${-d} days`); }
    else if (d === 0) { score += 80; why.push("Due today"); }
    else if (d === 1) { score += 45; why.push("Due tomorrow"); }
    else if (d <= 3) { score += 25; why.push(`Due in ${d} days`); }
    else if (d <= 7) score += 10;
  }
  if (t.priority === "high") { score += 40; why.push("High priority"); } else if (t.priority === "medium") score += 12;
  if (t.project_priority === "high") { score += 10; if (t.project_name) why.push(`Project: ${t.project_name}`); }
  if (t.project_status === "in_progress") score += 5;
  const age = Math.max(0, (now - new Date(t.created_at).getTime()) / 86400000); score += Math.min(age * 0.8, 15);
  if (t.focused_today) { score += 6; why.push("Already in progress"); }
  return { score, why };
}
export function pickPriority(tasks, today) {
  let best = null;
  for (const t of tasks) { if (t.completed) continue; const r = scoreTask(t, today); if (!best || r.score > best.score) best = { task: t, ...r }; }
  return best;
}
