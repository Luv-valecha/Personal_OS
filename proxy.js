import { NextResponse } from "next/server";

// Fast, optimistic gate: no session cookie → redirect to /login.
// Real verification (signature, user exists) happens server-side in layouts, actions and route handlers.
const PUBLIC = ["/login", "/register", "/offline", "/manifest.webmanifest", "/sw.js"];
export function proxy(req) {
  const { pathname } = req.nextUrl;
  // /api/mobile/* authenticates itself with a Bearer pairing token (Android companion); every other /api route still needs the session cookie.
  const isPublic = PUBLIC.some((p) => pathname === p) || pathname.startsWith("/icons/") || pathname.startsWith("/api/mobile/");
  const has = req.cookies.has("session");
  if (!has && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone(); url.pathname = "/login"; return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|ico|webp|js|css|txt)$).*)"] };
