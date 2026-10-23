import test from "node:test"; import assert from "node:assert/strict";
import { cacheableRequest, looksLikeCommand, ttlFor, keyParts, normalizeQuery, storable, READONLY_TOOLS, TTL } from "@/lib/jarvis/cachepolicy";
import { TOOLS } from "@/lib/jarvis/tools";
test("commands are never cacheable; questions are", () => {
  for (const s of ["add task buy milk", "Create a bug in X", "delete my task foo", "mark the nav bug as resolved", "switch to Hell theme", "remember that I like tea", "start a 25 minute focus", "please add an idea", "can you remove that note"]) assert.equal(cacheableRequest(s), false, s);
  for (const s of ["what is my average coffee spend", "who owes me money", "how many tasks are overdue", "what should I do next"]) assert.equal(cacheableRequest(s), true, s);
});
test("follow-ups (history) and empty/huge input are not cacheable", () => { assert.equal(cacheableRequest("what about tomorrow", [{ role: "user", text: "x" }]), false); assert.equal(cacheableRequest("hi"), false); assert.equal(cacheableRequest("x".repeat(400)), false); });
test("normalisation makes trivially-different phrasings share an entry", () => assert.equal(normalizeQuery("  Who OWES me?  "), normalizeQuery("who owes me")));
test("key includes today and tz (no stale 'today' after midnight, no cross-timezone reuse)", () => { const a = keyParts("today's tasks", { today: "2026-10-23", tz: "Asia/Kolkata" }); assert.notDeepEqual(a, keyParts("today's tasks", { today: "2026-10-24", tz: "Asia/Kolkata" })); assert.notDeepEqual(a, keyParts("today's tasks", { today: "2026-10-23", tz: "UTC" })); });
test("ttlFor: only read-only, successful, UI-action-free responses", () => {
  assert.equal(ttlFor({ type: "result", text: "x", cards: [] }, ["list_tasks"]), TTL.grounded);
  assert.equal(ttlFor({ type: "result", text: "x", cards: [] }, ["list_events"]), TTL.time);
  assert.equal(ttlFor({ type: "result", text: "x", cards: [] }, ["list_tasks", "create_task"]), 0);   // any write in the chain → never cached
  assert.equal(ttlFor({ type: "result", text: "x", cards: [] }, ["set_theme"]), 0);
  for (const type of ["error", "clarify", "confirm"]) assert.equal(ttlFor({ type, text: "x" }, ["list_tasks"]), 0, type);
  assert.equal(ttlFor({ type: "result", text: "x", clientActions: [{ type: "theme" }] }, ["list_themes"]), 0);
  assert.equal(ttlFor({ type: "answer", text: "Hello!" }, []), TTL.plain); assert.equal(ttlFor({ type: "answer", text: "I'm not sure how to help with that." }, []), 0); assert.equal(ttlFor({ type: "error", code: "NO_KEY", text: "x" }, []), 0);
});
test("storable() drops tokens and unknown fields", () => assert.deepEqual(Object.keys(storable({ type: "result", text: "t", cards: [], confirm: { token: "SECRET" }, via: "x", extra: 1 })).sort(), ["cards", "clientActions", "text", "type"]));
test("allow-list stays in sync with the real tool registry (no stale names), and contains no write tools", () => {
  for (const n of READONLY_TOOLS) assert.ok(TOOLS[n], `READONLY_TOOLS names a tool that does not exist: ${n}`);
  for (const n of ["create_task", "update_task", "delete_task", "complete_task", "create_expense", "settle_split", "remember", "forget_memory", "set_theme", "create_bug", "update_bug", "start_focus_session", "create_note"]) assert.ok(!READONLY_TOOLS.has(n), n);
});
