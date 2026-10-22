import test from "node:test"; import assert from "node:assert/strict";
import { matchTheme, ALL_THEMES, THEME_IDS } from "@/lib/themes";
test("exact id/name, case and punctuation insensitive", () => { assert.equal(matchTheme("Dark").id, "dark"); assert.equal(matchTheme("iron man").id, "ironman"); assert.equal(matchTheme("Dr. Doom theme").id, "doom"); assert.equal(matchTheme("the AMOLED theme").id, "amoled"); });
test("default", () => assert.equal(matchTheme("the default theme").id, "dark"));
test("unique partial match", () => assert.equal(matchTheme("spider").id, "spiderman"));
test("ambiguous → names, never a guess", () => { const r = matchTheme("man"); assert.ok(r.ambiguous?.length > 1, JSON.stringify(r)); });
test("unknown and injection-like input are rejected", () => { for (const s of ["", "xyzzy", "</style><script>alert(1)</script>", "custom"]) assert.ok(matchTheme(s).notFound, s); });
test("only registry ids can ever be returned", () => { for (const t of ALL_THEMES) assert.ok(THEME_IDS.includes(matchTheme(t.name).id)); });
