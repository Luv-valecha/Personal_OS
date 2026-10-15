import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { one } from "@/lib/db";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set and at least 32 characters long.");
  return new TextEncoder().encode(s);
}

export const hashPassword = (pw) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

export async function createSession(userId) {
  const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId)
    .setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

import { actingUserId } from "@/lib/request-context";

export async function getUserId() {
  const acting = actingUserId(); if (acting) return acting;   // set ONLY by app/api/mobile/* after verifying a pairing token
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.sub || null;
  } catch { return null; }
}

// Cached per request. Returns null if not logged in or the account no longer exists.
export const getUser = cache(async () => {
  const id = await getUserId();
  if (!id) return null;
  return one("SELECT id, email, display_name FROM users WHERE id=$1", [id]);
});

// For pages/layouts: redirects to /login if unauthenticated.
export async function requireUser() {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

// For server actions / route handlers: throws if unauthenticated. Every query MUST filter by this id.
export async function requireUserId() {
  const id = await getUserId();
  if (!id) throw new Error("UNAUTHENTICATED");
  return id;
}

// Tiny in-memory rate limiter (per server instance — best effort on serverless).
const hits = new Map();
export function rateLimit(key, limit = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return true;
}
