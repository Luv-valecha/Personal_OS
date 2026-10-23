import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
import { ALL_THEMES, THEME_IDS, THEME_GROUPS, isThemeId, matchTheme } from "@/lib/themes";
const css = fs.readFileSync("styles/themes.css", "utf8");
const block = css.match(/\[data-theme="hell"\]\s*\{[\s\S]*?\}/)?.[0] || "";
const tok = (n) => block.match(new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, pa) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * pa + parseInt(b.slice(i, i + 2), 16) * (1 - pa)).toString(16).padStart(2, "0")).join("");

test("Hell is registered once, selectable, and resolvable by name (settings picker + JARVIS use the same registry)", () => {
  assert.equal(THEME_IDS.filter((x) => x === "hell").length, 1); assert.ok(isThemeId("hell")); assert.ok(ALL_THEMES.find((t) => t.id === "hell").blurb);
  assert.ok(THEME_GROUPS.some((g) => g.themes.some((t) => t.id === "hell"))); assert.equal(matchTheme("Hell").id, "hell"); assert.equal(matchTheme("the hell theme").id, "hell");
  assert.equal(new Set(THEME_IDS).size, THEME_IDS.length, "no duplicate ids");
});
test("every theme in the registry has a CSS token block (no theme can be selected without styling)", () => { for (const id of THEME_IDS) assert.ok(css.includes(`[data-theme="${id}"]`), id); });
test("Hell defines the full token set the other themes define", () => { for (const t of ["c-bg", "c-surface", "c-border", "c-text", "c-primary", "c-primary-fg", "c-secondary", "c-accent"]) assert.ok(tok(t), t); assert.match(block, /color-scheme:\s*dark/); assert.match(block, /--bg-effect/); });
test("WCAG contrast (computed from the real CSS): text, muted text, primary button, indicators", () => {
  const bg = tok("c-bg"), surface = tok("c-surface"), text = tok("c-text"), pri = tok("c-primary"), prifg = tok("c-primary-fg"), sec = tok("c-secondary"), acc = tok("c-accent");
  const muted = mix(text, bg, 0.6);   // matches --color-text-muted: color-mix(text 60%, bg)
  const checks = { "body text on bg": [text, bg, 7], "body text on card": [text, surface, 7], "muted text on card": [muted, surface, 4.5], "muted text on bg": [muted, bg, 4.5],
    "primary button label on primary": [prifg, pri, 4.5], "primary (focus ring / links) on bg": [pri, bg, 4.5], "primary on card": [pri, surface, 4.5], "secondary on card": [sec, surface, 4.5], "accent on card": [acc, surface, 4.5] };
  for (const [name, [a, b, min]] of Object.entries(checks)) assert.ok(ratio(a, b) >= min, `${name}: ${ratio(a, b).toFixed(2)} < ${min}`);
  assert.ok(ratio(tok("c-border"), bg) >= 1.1, "borders visible but subtle");
});
test("Hell uses only existing animation hooks (so global reduced-motion handling applies)", () => {
  const g = fs.readFileSync("styles/globals.css", "utf8"); const fx = block.match(/--fx-anim:\s*([\w-]+)/)[1], wipe = block.match(/--wipe-anim:\s*([\w-]+)/)[1];
  assert.ok(g.includes(`@keyframes ${fx}`), fx); assert.ok(g.includes(`@keyframes ${wipe}`), wipe);
  assert.ok(g.includes('html[data-motion="off"]') && g.includes("prefers-reduced-motion"));
  assert.ok(!/text-shadow/.test(block), "no glowing text");
});
