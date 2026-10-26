// Calls the REAL setGlass server action over HTTP (Next-Action protocol), then reloads pages like a browser would (replaying Set-Cookie).
// Scenario B simulates a database that has NOT had migration 009 applied. DEV DB ONLY (it temporarily drops/re-adds the glass column).
import fs from "node:fs"; import pg from "pg"; import { SignJWT } from "jose"; import dotenv from "dotenv"; import crypto from "node:crypto";
dotenv.config({ path: ".env.local", quiet: true });
const BASE = process.env.BASE || "http://localhost:3100", url = process.env.DATABASE_URL; if (!/localhost|127\.0\.0\.1/.test(url)) { console.log("refusing: not a local DB"); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json", "utf8")).node;
const actionId = (name) => Object.entries(manifest).find(([, v]) => v.exportedName === name)?.[0];
const db = new pg.Client({ connectionString: url }); await db.connect(); const q = async (s, p) => (await db.query(s, p)).rows;
const uid = (await q("INSERT INTO users(email,password_hash) VALUES ($1,'x') RETURNING id", [`glass-${crypto.randomBytes(3).toString("hex")}@e2e.test`]))[0].id; await q("INSERT INTO dashboard_settings(user_id) VALUES ($1) ON CONFLICT DO NOTHING", [uid]);
const session = "session=" + await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(uid).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const jar = new Map(); const cookieHeader = () => [session, ...[...jar].map(([k, v]) => `${k}=${v}`)].join("; ");
const absorb = (res) => { for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
async function act(name, args) { const res = await fetch(BASE + "/settings", { method: "POST", headers: { "next-action": actionId(name), "content-type": "text/plain;charset=UTF-8", cookie: cookieHeader() }, body: JSON.stringify(args) }); absorb(res); const t = await res.text(); const m = t.match(/\{"ok":(true|false)[^\n]*/); return { status: res.status, ok: m ? m[1] === "true" : null, raw: (m?.[0] || t).slice(0, 160) }; }
const glassOf = async (path, withJar = true) => { const res = await fetch(BASE + path, { headers: { cookie: withJar ? cookieHeader() : session } }); return (await res.text()).match(/data-glass="(\w+)"/)?.[1]; };
const pressed = async (withJar = true) => { const h = (await (await fetch(BASE + "/settings", { headers: { cookie: withJar ? cookieHeader() : session } })).text()).replace(/<!-- -->/g, ""); const grp = h.match(/aria-label="Glass widgets"[^>]*>([\s\S]*?)<\/div>/)?.[1] || ""; return (grp.match(/aria-pressed="true"[^>]*>(\w+)</) || [])[1]; };
const noticeShown = async () => /Database update needed/.test(await (await fetch(BASE + "/settings", { headers: { cookie: cookieHeader() } })).text());
let pass = 0, failn = 0; const ok = (n, c, x = "") => { c ? pass++ : failn++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  → " + x}`); };
const COL = "ALTER TABLE dashboard_settings ADD COLUMN IF NOT EXISTS glass text NOT NULL DEFAULT 'off' CHECK (glass IN ('off','soft','strong'))";
try {
  // ── A: normal (migration 009 applied) ──
  let r = await act("setGlass", ["strong"]); ok("A: setGlass('strong') succeeds", r.ok === true, r.raw);
  for (const p of ["/dashboard", "/tasks", "/settings", "/calendar"]) ok(`A: persists across page change → ${p}`, (await glassOf(p)) === "strong", String(await glassOf(p)));
  ok("A: persists on a NEW device (session only, no glass cookie) — stored in the database", (await glassOf("/dashboard", false)) === "strong");
  ok("A: the Settings control SHOWS the saved option after a reload (it used to always show Off)", (await pressed()) === "Strong", String(await pressed()));
  ok("A: no 'database update needed' notice when migrations are applied", !(await noticeShown()));
  r = await act("setGlass", ["soft"]); ok("A: changing to 'soft' sticks after reload", r.ok === true && (await glassOf("/dashboard")) === "soft");
  r = await act("setGlass", ["off"]); ok("A: switching back to 'off' sticks", r.ok === true && (await glassOf("/dashboard")) === "off" && (await pressed()) === "Off");
  r = await act("setGlass", ["ultra"]); ok("A: an invalid value is rejected and changes nothing", r.ok === false && (await glassOf("/dashboard")) === "off", r.raw);
  // ── B: database WITHOUT the glass column (migration 009 not applied) ──
  jar.clear(); await q("ALTER TABLE dashboard_settings DROP COLUMN glass"); await q("DELETE FROM _migrations WHERE name='009_glass_widgets.sql'");
  r = await act("setGlass", ["strong"]); console.log(`      B raw result: ${r.raw}`);
  ok("B: setGlass still succeeds without the column (saved on this device)", r.ok === true, r.raw);
  for (const p of ["/dashboard", "/tasks", "/settings"]) ok(`B: setting survives reload / page change → ${p}`, (await glassOf(p)) === "strong", String(await glassOf(p)));
  ok("B: the Settings control shows the saved option (from this device's cookie)", (await pressed()) === "Strong", String(await pressed()));
  ok("B: Settings tells you plainly that a database update is pending", await noticeShown());
  ok("B: pages render at all without the column", (await fetch(BASE + "/dashboard", { headers: { cookie: cookieHeader() } })).status === 200);
} catch (e) { failn++; console.log("ERROR", e); }
finally { await q(COL); await q("INSERT INTO _migrations(name) VALUES ('009_glass_widgets.sql') ON CONFLICT DO NOTHING"); await q("DELETE FROM users WHERE id=$1", [uid]); await db.end(); console.log(`\n${pass} passed, ${failn} failed`); process.exit(failn ? 1 : 0); }
