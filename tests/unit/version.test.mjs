import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")).version, rd = (f) => fs.readFileSync(f, "utf8");
test("every release identifier says the same version (package.json = service worker = manifest = README)", () => {
  assert.equal(pkg, "4.0.0");
  assert.match(rd("public/sw.js"), new RegExp(`const VERSION = "${pkg.replace(/\./g, "\\.")}"`));
  assert.match(rd("app/manifest.js"), new RegExp(`version: "${pkg.replace(/\./g, "\\.")}"`));
  assert.match(rd("README.md").split("\n")[0], new RegExp(pkg.replace(/\./g, "\\.")));
  assert.match(rd("CHANGELOG.md"), new RegExp(`## \\[?${pkg.replace(/\./g, "\\.")}`));
});
test("the service worker still never caches pages, APIs or server actions", () => { const sw = rd("public/sw.js"); assert.match(sw, /NEVER CACHED: HTML pages, API responses, server actions/); assert.ok(!/\/api\//.test(sw.split("\n").filter((l) => !l.trim().startsWith("*") && !l.startsWith("/*")).join("\n"))); });
