// Minimal scripted stand-in for the Gemini generateContent endpoint, used to test JARVIS end-to-end WITHOUT a real key.
// Run:  node tests/mock-gemini.mjs   then start the app with  GEMINI_API_BASE=http://localhost:4010 GEMINI_API_KEY=test
// It is NOT an AI: it maps a few phrases to function calls so the orchestrator, validation, confirmation and error paths can be exercised.
import http from "node:http";
const call = (name, args) => ({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name, args } }] } }] });
const text = (t) => ({ candidates: [{ content: { role: "model", parts: [{ text: t }] } }] });
http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", async () => {
    const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.headers["x-goog-api-key"] === "badkey") return send(400, { error: { message: "API key not valid. Please pass a valid API key." } });
    let j = {}; try { j = JSON.parse(body); } catch {}
    const contents = j.contents || []; const last = contents[contents.length - 1]; const lastText = (last?.parts || []).map((p) => p.text || "").join(" ").toLowerCase();
    const sawTool = last?.parts?.some((p) => p.functionResponse);
    if (sawTool) { const r = last.parts.find((p) => p.functionResponse).functionResponse.response; return send(200, text(r.ok ? "Done — that's recorded." : `That failed: ${r.message}`)); }
    const prevModel = [...contents].reverse().find((c) => c.role === "model")?.parts?.map((p) => p.text || "").join(" ") || "";
    if (lastText.includes("quota")) return send(429, { error: { message: "Resource has been exhausted" } });
    if (lastText.includes("badmodel")) return send(404, { error: { message: "model not found" } });
    if (lastText.includes("malformed")) return send(200, { nothing: true });
    if (lastText.includes("slowpoke")) { await new Promise((r) => setTimeout(r, 5000)); return send(200, text("late")); }
    if (lastText.includes("hack")) return send(200, call("drop_database", { sql: "DROP TABLE users" }));
    if (lastText.includes("badargs")) return send(200, call("create_task", { title: 42 }));
    const li = lastText.match(/link idea ([0-9a-f-]{36})/); if (li) return send(200, call("create_linked_task", { idea: li[1] }));
    if (lastText.includes("another user")) return send(200, call("create_linked_task", { idea: "00000000-0000-0000-0000-000000000000" }));
    if (/spent.*coffee|coffee.*₹?20/.test(lastText)) return send(200, call("create_expense", { amount: 20, description: "coffee" }));
    if (lastText.includes("ambiguous spend")) return send(200, text("How much did you spend, and in which currency?"));
    if (lastText.includes("add it to my project")) return send(200, text("Which project?"));
    if (prevModel.includes("Which project?")) return send(200, call("create_idea", { title: "Use temporal attention for video segmentation", project: lastText.trim() }));
    if (lastText.includes("delete my task")) return send(200, call("delete_task", { task: lastText.replace(/.*delete my task/, "").trim() }));
    if (lastText.includes("average coffee")) return send(200, call("get_expense_stats", { period: "last_30_days", contains: "coffee" }));
    if (lastText.includes("weekend")) return send(200, call("get_expense_stats", { period: "month" }));
    if (lastText.includes("owes")) return send(200, call("list_balances", {}));
    if (lastText.includes("overdue ideas")) return send(200, call("list_ideas", { scope: "unconverted" }));
    return send(200, text("I can help with tasks, ideas, expenses, deadlines, notes, projects and focus."));
  });
}).listen(4010, () => console.log("mock Gemini on :4010"));
