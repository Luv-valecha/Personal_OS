// Lets `node --test` import the app's pure modules that use the "@/…" alias (no bundler needed).
import { registerHooks } from "node:module"; import { fileURLToPath, pathToFileURL } from "node:url"; import path from "node:path"; import fs from "node:fs";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({ resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) { let p = path.join(root, spec.slice(2)); if (!fs.existsSync(p) && fs.existsSync(p + ".js")) p += ".js"; return next(pathToFileURL(p).href, ctx); }
  if ((spec.startsWith("./") || spec.startsWith("../")) && !path.extname(spec)) { const base = ctx.parentURL ? path.dirname(fileURLToPath(ctx.parentURL)) : root; if (fs.existsSync(path.join(base, spec + ".js"))) return next(spec + ".js", ctx); }
  return next(spec, ctx); } });
