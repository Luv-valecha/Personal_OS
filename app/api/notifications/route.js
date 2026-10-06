import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getNotifications } from "@/lib/queries";
import { getTz, getToday } from "@/lib/server-utils";

export async function GET() {
  try {
    const uid = await requireUserId();
    return NextResponse.json({ items: await getNotifications(uid, await getToday(), await getTz()) });
  } catch (e) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[notifications]", e); return NextResponse.json({ items: [] }, { status: 500 });
  }
}
