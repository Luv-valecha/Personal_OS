import test from "node:test"; import assert from "node:assert/strict";
import { validateMemory, memoryPromptBlock, memoryIntent, MEMORY_LIMITS } from "@/lib/memory-rules";
test("accepts normal facts and normalises whitespace", () => assert.deepEqual(validateMemory("  I   prefer   morning study sessions "), { ok: true, content: "I prefer morning study sessions" }));
test("rejects empty and over-long", () => { assert.equal(validateMemory("   ").ok, false); assert.equal(validateMemory("x".repeat(501)).ok, false); });
test("rejects secrets", () => { for (const s of ["my password is hunter2", "api key: abc123", "sk-abcdefghijklmnopqrstuvwxyz", "AIzaSyA1234567890abcdefghijklmnop", "card 4111 1111 1111 1111", "my pin is 4821", "-----BEGIN RSA PRIVATE KEY-----"]) assert.equal(validateMemory(s).ok, false, s); });
test("does not over-reject ordinary text", () => { for (const s of ["My exam is on 15 Dec", "I live near the pin factory", "Prefers tea over coffee", "Phone battery lasts 2 days"]) assert.equal(validateMemory(s).ok, true, s); });
test("prompt block is bounded and delimited", () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ content: "fact number " + i + " " + "x".repeat(60) }));
  const b = memoryPromptBlock(rows); assert.match(b, /<memory>[\s\S]*<\/memory>/); assert.ok(b.split("\n- ").length - 1 <= MEMORY_LIMITS.promptItems); assert.ok(b.length < MEMORY_LIMITS.promptChars + 400);
  assert.equal(memoryPromptBlock([]), "");
});
test("rule intents", () => {
  assert.deepEqual(memoryIntent("Remember that my thesis deadline is in March"), { tool: "remember", args: { content: "my thesis deadline is in March" } });
  assert.equal(memoryIntent("remember: I use VS Code").tool, "remember");
  assert.equal(memoryIntent("What do you remember about me?").tool, "list_memories");
  assert.equal(memoryIntent("forget that I use VS Code").tool, "forget_memory");
  assert.equal(memoryIntent("forget everything").tool, "forget_all_memories");
  assert.equal(memoryIntent("add a task to remember milk"), null); assert.equal(memoryIntent("do you remember my tasks"), null);
});
