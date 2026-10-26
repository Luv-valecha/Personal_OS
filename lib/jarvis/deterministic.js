import { parseCommand } from "@/lib/commands";
import { parseQuickTask } from "@/lib/nlp";
import { extractAtProject } from "@/lib/projectref";
import { parseTaskQuestion } from "@/lib/jarvis/taskquery";
import { memoryIntent } from "@/lib/memory-rules";
import { matchTheme } from "@/lib/themes";
import { bugIntent } from "@/lib/jarvis/bugintent";

// Reliable, rule-based interpretation for the most common explicit commands. Used FIRST (saves free-tier quota, works
// when the AI is down). Returns {tool,args} or null — never a guess: anything unclear falls through to the AI / a question.
export function deterministicIntent(text, tz) {
  const t = text.trim(); const lower = t.toLowerCase();
  const mem = memoryIntent(t); if (mem) return mem;
  // Budget questions → the exact budget tool (never the AI, never a guess). Setting/changing a budget is not handled here.
  if (/\bbudget\b/i.test(t) && /^(?:what|how|am i|are we|do i|show|tell|check|is|where|can i|give)/i.test(t) && !/\b(set|change|update|increase|decrease|raise|lower|edit|make|add|create|remove|delete)\b/i.test(t)) return { tool: "get_budget", args: {} };
  const bug = bugIntent(t); if (bug) return bug;
  if (/^(what|which|list|show)\b.*\bthemes?\b.*$/i.test(t) && !/\b(switch|change|set|use)\b/i.test(t)) return { tool: "list_themes", args: {} };
  { const th = t.replace(/[.!?]+$/, "").match(/^(?:please\s+)?(?:switch|change|set|use|apply|go)\s+(?:my\s+|the\s+)?(?:app\s+)?(?:theme\s+)?(?:back\s+)?to\s+(?:the\s+)?(.+?)(?:\s+theme)?$/i) || t.replace(/[.!?]+$/, "").match(/^(?:please\s+)?(?:switch|change|set|use|apply)\s+(?:my\s+|the\s+)?theme\s+(?:to\s+)?(.+)$/i) || t.replace(/[.!?]+$/, "").match(/^(?:please\s+)?use\s+the\s+(.+?)\s+theme$/i);
    if (th && (/\btheme\b/i.test(t) || /^(?:switch|change|set|use|apply)\s+to\s+(?:the\s+)?\S+\s*$/i.test(t) && matchTheme(th[1]).id)) return { tool: "set_theme", args: { theme: th[1] } }; }
  const c = parseCommand(t, tz);
  if (c?.type === "focus") return { tool: "start_focus_session", args: { minutes: c.minutes, ...(c.label ? { task: c.label } : {}) } };
  if (c?.type === "create") {
    const p = c.payload;
    if (c.entity === "task") { const q = parseQuickTask(p.text, tz); // A bare date ("for tomorrow") is the day the user plans to do it (scheduled_date). Only "due"/"by"/"deadline" make it a deadline.
      const isDeadline = /\b(due|deadline|by)\b/i.test(p.text);
      return { tool: "create_task", args: { title: q.title, ...(q.due_date ? { [isDeadline ? "due_date" : "scheduled_date"]: q.due_date } : {}), ...(/!(high|h)\b/i.test(p.text) ? { priority: q.priority } : {}), ...(q.projectName ? { project: q.projectName } : {}) } }; }
    if (c.entity === "idea") { const at = extractAtProject(p.title); return { tool: "create_idea", args: { title: at.text || p.title, ...(at.ref ? { project: at.ref } : {}) } }; }
    if (c.entity === "note") return { tool: "create_note", args: { title: p.title } };
    if (c.entity === "project") return { tool: "create_project", args: { name: p.name } };
    if (c.entity === "bookmark") return { tool: "create_bookmark", args: { url: p.url } };
    if (c.entity === "expense") return { tool: "create_expense", args: { amount: p.amount, category: p.category === "other" ? undefined : p.category, description: p.description } };
    if (c.entity === "deadline") return { tool: "create_deadline", args: { title: p.title, due_date: p.due_date } };
  }
  // splits: "Rahul owes me 300 for lunch" · "I owe Aman 200 for cab" · "Rahul paid me back 300" · "I paid Aman back 200"
  let sm = t.match(/^([\p{L}][\p{L} .'-]{0,40}?)\s+owes?\s+me\s+(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:for|because|as)?\s*(.*)$/iu);
  if (sm) return { tool: "add_split_entry", args: { friend: sm[1].trim(), kind: "lent", amount: +sm[2], reason: sm[3].trim() || undefined } };
  if ((sm = t.match(/^i\s+owe\s+([\p{L}][\p{L} .'-]{0,40}?)\s+(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:for|because|as)?\s*(.*)$/iu))) return { tool: "add_split_entry", args: { friend: sm[1].trim(), kind: "borrowed", amount: +sm[2], reason: sm[3].trim() || undefined } };
  if ((sm = t.match(/^([\p{L}][\p{L} .'-]{0,40}?)\s+(?:paid|gave)\s+me\s+back\s+(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(.*)$/iu))) return { tool: "add_split_entry", args: { friend: sm[1].trim(), kind: "they_paid_me", amount: +sm[2], reason: sm[3].replace(/^for\s+/i, "").trim() || undefined } };
  if ((sm = t.match(/^i\s+(?:paid|gave)\s+([\p{L}][\p{L} .'-]{0,40}?)\s+back\s+(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(.*)$/iu))) return { tool: "add_split_entry", args: { friend: sm[1].trim(), kind: "i_paid_them", amount: +sm[2], reason: sm[3].replace(/^for\s+/i, "").trim() || undefined } };
  if (/^(who owes (me|whom)|my balances|how much (do )?(i owe|people owe me))\??$/.test(lower)) return { tool: "list_balances", args: {} };
  // structured task questions ("tasks due this week", "high-priority tasks in X", "how many tasks did I complete this month")
  const tq = parseTaskQuestion(t); if (tq) return { tool: "list_tasks", args: tq };
  // simple, unambiguous read questions
  if (/^(show|list|what are)?\s*(my\s+)?overdue( tasks)?\??$/.test(lower)) return { tool: "list_tasks", args: { filter: "overdue" } };
  if (/^(show|list|what are)?\s*(me\s+)?(my\s+)?(today'?s|todays) tasks\??$/.test(lower)) return { tool: "list_tasks", args: { filter: "today" } };
  if (/^what should i (work on|do)( today| now| next)?\??$/.test(lower)) return { tool: "get_priorities", args: {} };
  const m = lower.match(/^how much (have i |did i )?(spent|spend)( so far)?( this| in the)? (month|week)\??$/) || lower.match(/^how much (have i |did i )?(spent|spend) (today)\??$/);
  if (m) return { tool: "get_expense_summary", args: { period: m[5] || m[3] || "month" } };
  return null;
}
