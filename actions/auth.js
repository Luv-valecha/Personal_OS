"use server";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query, one } from "@/lib/db";
import { hashPassword, verifyPassword, createSession, destroySession, rateLimit } from "@/lib/auth";
import { loginSchema, registerSchema, zodMessage } from "@/lib/validation";
import { normalizeLayout } from "@/lib/layout";
import { ZodError } from "zod";

async function ip() { const h = await headers(); return (h.get("x-forwarded-for") || "local").split(",")[0].trim(); }
const COOKIE_OPTS = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" };

export async function registerAction(_prev, formData) {
  try {
    if (process.env.ALLOW_REGISTRATION === "false") return { error: "Registration is disabled on this instance." };
    if (!rateLimit("reg:" + (await ip()), 10, 60 * 60 * 1000)) return { error: "Too many attempts. Try again later." };
    const d = registerSchema.parse(Object.fromEntries(formData));
    const exists = await one("SELECT 1 AS ok FROM users WHERE email=$1", [d.email]);
    if (exists) return { error: "An account with this email already exists." };
    const u = await one("INSERT INTO users(email,password_hash,display_name) VALUES($1,$2,$3) RETURNING id", [d.email, await hashPassword(d.password), d.display_name || "Lucifer"]);
    await query("INSERT INTO dashboard_settings(user_id, layout) VALUES($1,$2)", [u.id, JSON.stringify(normalizeLayout([]))]);
    await createSession(u.id);
    (await cookies()).set("theme", "dark", COOKIE_OPTS);
  } catch (e) {
    if (e instanceof ZodError) return { error: zodMessage(e) };
    console.error("[register]", e); return { error: "Could not create the account. Check the server logs and database connection." };
  }
  redirect("/dashboard");
}

export async function loginAction(_prev, formData) {
  try {
    const d = loginSchema.parse(Object.fromEntries(formData));
    if (!rateLimit(`login:${await ip()}:${d.email}`, 8)) return { error: "Too many sign-in attempts. Wait a few minutes and try again.", email: d.email };
    const u = await one("SELECT id, password_hash FROM users WHERE email=$1", [d.email]);
    // Same message for unknown email / wrong password (no account enumeration). Always run a hash compare.
    const ok = await verifyPassword(d.password, u?.password_hash || "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin");
    if (!u || !ok) return { error: "Incorrect email or password.", email: d.email };
    await createSession(u.id);
    const s = await one("SELECT theme, motion FROM dashboard_settings WHERE user_id=$1", [u.id]);
    const jar = await cookies(); jar.set("theme", s?.theme || "dark", COOKIE_OPTS); jar.set("motion", s?.motion || "full", COOKIE_OPTS);
  } catch (e) {
    if (e instanceof ZodError) return { error: "Enter a valid email and password." };
    console.error("[login]", e); return { error: "Could not sign in. Check the server logs and database connection." };
  }
  redirect("/dashboard");
}

export async function logoutAction() { await destroySession(); redirect("/login"); }
