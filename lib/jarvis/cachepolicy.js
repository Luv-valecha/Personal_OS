// What JARVIS may cache. PURE. The goal is to skip the slow Gemini round trip for repeated READ-ONLY questions — never to replay an action.
// Safety rules: (1) only the AI path is cached (rules-path commands are already instant and always fresh);
// (2) single-turn only (follow-ups depend on history); (3) a response is stored only if EVERY tool it used is on the read-only allow-list;
// (4) anything that looks like a command is never stored; (5) errors, clarifications, confirmations and UI actions are never stored.
export const READONLY_TOOLS = new Set(["list_tasks", "list_ideas", "list_expenses", "get_expense_summary", "get_expense_stats", "list_balances", "list_deadlines", "list_events", "list_projects", "get_project_overview", "list_memories", "list_themes", "list_bugs", "search_application", "get_focus_summary", "get_priorities", "get_budget"]);
export const isReadOnlyTool = (name) => READONLY_TOOLS.has(name);
const TIME_SENSITIVE = new Set(["list_events", "get_priorities", "list_deadlines", "get_focus_summary"]);   // answers phrased relative to "now"
export const TTL = { grounded: 300, time: 60, plain: 600, dashboard: 60 };

const COMMAND = /^\s*(?:please\s+|hey\s+jarvis,?\s+|can you\s+|could you\s+)?(add|create|new|make|delete|remove|erase|clear|complete|finish|mark|set|schedule|reschedule|move|rename|edit|update|change|switch|remember|forget|start|stop|pause|resume|settle|log|file|convert|turn|cancel|save|archive|restore|undo|redo|toggle|snooze|reset|import|export|send|post)\b/i;
export const looksLikeCommand = (t) => COMMAND.test(t);
export const normalizeQuery = (t) => String(t || "").toLowerCase().replace(/[\s\u00a0]+/g, " ").replace(/^[\s"'“”]+|[\s"'“”.!?]+$/g, "").trim();
export function cacheableRequest(text, history = []) { const n = normalizeQuery(text); return history.length === 0 && n.length >= 3 && n.length <= 300 && !looksLikeCommand(n); }
// Key parts: today + tz are included so "today's tasks" can never be served after midnight / for another timezone.
export const keyParts = (text, ctx) => ({ q: normalizeQuery(text), today: ctx.today, tz: ctx.tz });

// → ttl seconds, or 0 = do not cache
export function ttlFor(resp, trace = []) {
  if (!resp || resp.confirm || resp.code || (resp.clientActions || []).length) return 0;
  if (trace.length === 0) return resp.type === "answer" && resp.text && !/^I'm not sure/i.test(resp.text) ? TTL.plain : 0;
  if (resp.type !== "result" || !trace.every(isReadOnlyTool)) return 0;
  return trace.some((t) => TIME_SENSITIVE.has(t)) ? TTL.time : TTL.grounded;
}
// Whitelist what is stored — never tokens or unknown fields.
export const storable = (r) => ({ type: r.type, text: r.text, cards: r.cards || [], clientActions: [] });
