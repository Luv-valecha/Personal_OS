import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { cache } from "@/lib/cache/index";

// Signed-in users only. Returns counters and breaker state — NEVER keys, values, URLs or tokens.
// Add ?probe=1 for a live round-trip check (uses 3 Redis commands from your monthly quota).
export async function GET(req) {
  let uid; try { uid = await requireUserId(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const out = { ...cache.snapshot(), note: "counters are per server instance and reset on cold start" };
  if (new URL(req.url).searchParams.get("probe") === "1") out.probe = await cache.probe(uid);
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
