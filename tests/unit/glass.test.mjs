import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
import { GLASS } from "@/lib/themes"; import { WIDGETS } from "@/lib/layout";
const g = fs.readFileSync("styles/globals.css", "utf8"), themes = fs.readFileSync("styles/themes.css", "utf8"), dash = fs.readFileSync("components/dashboard/DashboardClient.jsx", "utf8");
const lum = (h) => { const [r, gg, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * gg + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, pa) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * pa + parseInt(b.slice(i, i + 2), 16) * (1 - pa)).toString(16).padStart(2, "0")).join("");

test("setting values are exactly off/soft/strong and each has CSS", () => { assert.deepEqual(GLASS, ["off", "soft", "strong"]); assert.match(g, /html\[data-glass="soft"\]\s*\{[^}]*--glass-alpha/); assert.match(g, /html\[data-glass="strong"\]\s*\{[^}]*--glass-alpha/); });
test("glass only targets dashboard widget cards, and the dashboard really renders widgets that way", () => {
  assert.match(g, /\.grid-cards > \.card/); assert.ok(dash.includes('className="grid-cards"') && /className=\{`card /.test(dash));
  assert.ok(!/html\[data-glass[^\n]*\n?[^\n]*\s\.card\s*\{/.test(g.replace(/\.grid-cards > \.card/g, "")), "no unscoped .card glass rule (would affect every page)");
});
test("accessibility + compatibility fallbacks exist (reduced transparency, no backdrop-filter support)", () => { assert.match(g, /prefers-reduced-transparency: reduce/); assert.match(g, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/); });
test("there is something behind the glass to refract, and it is drawn from the theme's own colours", () => assert.match(g, /html\[data-glass="soft"\] body[\s\S]*?radial-gradient[\s\S]*?var\(--color-primary\)/));
test("new V4 widgets (incl. Music) are plain .card sections, so they get the glass look and stay out of the way by default", () => { for (const id of ["ideas", "bugs", "checklists", "music"]) assert.equal(WIDGETS[id].defaultVisible, false, id); });
test("WCAG: body text ≥ 7:1 and muted text ≥ 4.5:1 on the EFFECTIVE glass card in every hex-defined theme, soft and strong", () => {
  const num = (re) => Number(g.match(re)[1]) / 100;
  const alpha = { soft: num(/html\[data-glass="soft"\]\s*\{[^}]*--glass-alpha:\s*(\d+)%/), strong: num(/html\[data-glass="strong"\]\s*\{[^}]*--glass-alpha:\s*(\d+)%/) };
  const light = num(/html\[data-theme="light"\]\[data-glass="strong"\]\s*\{[^}]*--glass-alpha:\s*(\d+)%/);
  const backdrop = g.match(/html\[data-glass="soft"\] body, html\[data-glass="strong"\] body \{[^}]*\}/)[0];   // only the glass backdrop rule
  const blobs = [...backdrop.matchAll(/color-mix\(in srgb, var\((--color-primary|--color-secondary, var\(--color-primary\))\) (\d+)%, transparent\)/g)].map((m) => ({ which: m[1].includes("secondary") ? "sec" : "pri", p: Number(m[2]) / 100 }));
  assert.equal(blobs.length, 2, "two ambient blobs");
  let checked = 0, minText = 99, minMuted = 99;
  for (const [, id, body] of themes.matchAll(/\[data-theme="([\w-]+)"\]\s*\{([^}]*)\}/g)) {
    const t = (n) => body.match(new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`))?.[1]; const [bg, surface, text, pri, sec] = ["c-bg", "c-surface", "c-text", "c-primary", "c-secondary"].map(t); if (!bg || !surface || !text || !pri) continue; checked++;
    const muted = mix(text, bg, 0.6);
    for (const mode of ["soft", "strong"]) {
      const a = mode === "strong" && id === "light" ? light : alpha[mode];
      for (const under of [bg, mix(pri, bg, blobs.find((b) => b.which === "pri").p), mix(sec || pri, bg, blobs.find((b) => b.which === "sec").p)]) { const card = mix(surface, under, a); minText = Math.min(minText, ratio(text, card)); minMuted = Math.min(minMuted, ratio(muted, card)); }
    }
  }
  assert.ok(checked >= 15, `only ${checked} themes checked`); assert.ok(minText >= 7, `body text ${minText.toFixed(2)}`); assert.ok(minMuted >= 4.5, `muted text ${minMuted.toFixed(2)}`);
});
