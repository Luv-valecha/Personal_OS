import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { globalSearch } from "@/lib/queries";

export async function GET(req) {
  try {
    const uid = await requireUserId();
    const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 100);
    if (q.length < 2) return NextResponse.json({ results: {} });
    return NextResponse.json({ results: await globalSearch(uid, q) });
  } catch (e) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[search]", e); return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
