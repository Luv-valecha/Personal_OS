// Rule-based reading of bug commands (pure). → {tool,args} | null. Anything unclear falls through to the AI/clarification path.
import { extractAtProject } from "@/lib/projectref";
const STATUS = { open: "open", active: "active", "in progress": "in_progress", resolved: "resolved", fixed: "resolved", closed: "resolved", done: "resolved", "won't fix": "wont_fix", "wont fix": "wont_fix", "wontfix": "wont_fix", all: "all" };
const strip = (s) => s.replace(/^(?:the|a|an)\s+/i, "").replace(/[.!?]+$/, "").trim();

export function bugIntent(text) {
  const t = text.trim().replace(/[.!]+$/, ""); let m;
  // Add bug: Mobile nav overflows @Lucifer OS   |   add a bug @Project …
  if ((m = t.match(/^(?:add|create|log|file|new)\s+(?:a\s+|an\s+)?bug\s*[:\-]\s*(.+)$/i))) { const at = extractAtProject(m[1]); return at.ref && at.text ? { tool: "create_bug", args: { title: at.text, project: at.ref } } : null; }
  // Create a bug in Lucifer OS for the broken task editor   |   Add a bug to my Lucifer OS project: mobile nav overflow
  if ((m = t.match(/^(?:add|create|log|file|new)\s+(?:a\s+|an\s+)?bug\s+(?:in|to|for|on)\s+(?:my\s+|the\s+)?(.+?)(?:\s+project)?\s*(?:[:\-]|\bfor\b|\babout\b|\bwhere\b|\bthat\b)\s*(?:the\s+)?(.+)$/i))) return { tool: "create_bug", args: { title: strip(m[2]), project: strip(m[1]) } };
  // Show me the open bugs in Lucifer OS
  if ((m = t.match(/^(?:show|list|what are|what's|which are|give)\s+(?:me\s+)?(?:the\s+|my\s+|all\s+)*(open|active|resolved|closed|fixed|in progress|won'?t fix|all)?\s*bugs?(?:\s+(?:in|for|of|on|from)\s+(?:my\s+|the\s+)?(.+?)(?:\s+project)?)?$/i))) {
    const args = {}; if (m[1]) args.status = STATUS[m[1].toLowerCase()]; if (m[2]) args.project = strip(m[2]); return { tool: "list_bugs", args }; }
  // Mark the dashboard rendering bug as resolved
  if ((m = t.match(/^(?:mark|set|move|flag)\s+(?:the\s+)?(.+?)\s+bug\s+(?:as\s+|to\s+)(open|resolved|fixed|closed|done|in progress|won'?t fix)$/i))) return { tool: "update_bug", args: { bug: strip(m[1]), status: STATUS[m[2].toLowerCase().replace("’", "'")] } };
  return null;
}
