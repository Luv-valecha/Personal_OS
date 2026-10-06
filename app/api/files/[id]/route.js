import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { one } from "@/lib/db";

export async function GET(_req, { params }) {
  try {
    const uid = await requireUserId(); const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const f = await one("SELECT name, mime_type, data FROM files WHERE id=$1 AND user_id=$2", [id, uid]);
    if (!f || !f.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new Response(f.data, { headers: {
      "Content-Type": f.mime_type, "Content-Length": String(f.data.length),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(f.name)}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
    } });
  } catch (e) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[download]", e); return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
