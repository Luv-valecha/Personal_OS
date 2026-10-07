import { addDays, todayStr } from "@/lib/dates";
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
// "Finish ML report tomorrow !high #uni @ML Project"  →  { title, due_date, priority, tags, projectName }
export function parseQuickTask(input, tz) {
  let text = " " + input.trim() + " ";
  const today = todayStr(tz); let due = null, priority = "medium"; const tags = []; let projectName = null;
  text = text.replace(/\s#([\w-]+)/g, (_, t) => { tags.push(t.toLowerCase()); return " "; });
  text = text.replace(/\s@([\w-]+)/g, (_, p) => { projectName = p; return " "; });
  text = text.replace(/\s!(high|med|medium|low|h|m|l)\b/gi, (_, p) => { const k = p[0].toLowerCase(); priority = k === "h" ? "high" : k === "l" ? "low" : "medium"; return " "; });
  const rules = [
    [/\s(today|tonight)\b/i, () => today],
    [/\s(tomorrow|tmrw|tom)\b/i, () => addDays(today, 1)],
    [/\sin (\d{1,3}) days?\b/i, (m) => addDays(today, +m[1])],
    [/\sin (\d{1,2}) weeks?\b/i, (m) => addDays(today, 7 * +m[1])],
    [/\snext week\b/i, () => addDays(today, 7)],
    [/\s(?:on |by |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i, (m) => {
      const target = DAYS.indexOf(m[1].toLowerCase()); const cur = new Date(today + "T00:00:00Z").getUTCDay();
      return addDays(today, ((target - cur + 7) % 7) || 7);
    }],
    [/\s(\d{4}-\d{2}-\d{2})\b/, (m) => m[1]],
  ];
  for (const [re, fn] of rules) { const m = text.match(re); if (m) { due = fn(m); text = text.replace(re, " "); break; } }
  let title = text.replace(/\s+/g, " ").trim(); title = title.charAt(0).toUpperCase() + title.slice(1);
  return { title: title || input.trim(), due_date: due, priority, tags, projectName };
}
