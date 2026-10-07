import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { globalSearch, recentByType } from "@/lib/queries";

export async function GET(req) {
  try {
    const uid = await requireUserId();
    const sp = new URL(req.url).searchParams; const q = (sp.get("q") || "").trim().slice(0, 100); const type = sp.get("type") || "";
    if (q.length < 2) return NextResponse.json({ results: type ? await recentByType(uid, type) : {} });
    const all = await globalSearch(uid, q);
    return NextResponse.json({ results: type ? { [type]: all[type] || [] } : all });
  } catch (e) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[search]", e); return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
