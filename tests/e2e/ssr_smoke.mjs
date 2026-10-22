// Renders every page server-side as a seeded DEV user (minted session) and fails on non-200 or Next error markers.
import pg from "pg"; import { SignJWT } from "jose"; import dotenv from "dotenv"; import crypto from "node:crypto";
dotenv.config({ path: ".env.local", quiet: true });
const BASE = process.env.BASE || "http://localhost:3100"; const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const uid = (await db.query("INSERT INTO users(email,password_hash) VALUES ($1,'x') RETURNING id", [`ssr-${crypto.randomBytes(3).toString("hex")}@e2e.test`])).rows[0].id;
const cookie = "session=" + await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(uid).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const pages = ["dashboard", "today", "tasks", "calendar", "deadlines", "notes", "bookmarks", "projects", "ideas", "checklists", "focus", "expenses", "splits", "music", "files", "developer", "activity", "search", "settings", "settings/memory", "settings/android"];
let bad = 0;
for (const p of pages) { const r = await fetch(`${BASE}/${p}`, { headers: { cookie }, redirect: "manual" }); const t = await r.text(); const err = r.status !== 200 || /Application error|Internal Server Error|digest/.test(t); if (err) bad++; console.log(`${err ? "FAIL" : "ok  "} ${r.status} /${p}`); }
await db.query("DELETE FROM users WHERE id=$1", [uid]); await db.end(); console.log(bad ? `${bad} failing` : "all pages render"); process.exit(bad ? 1 : 0);
