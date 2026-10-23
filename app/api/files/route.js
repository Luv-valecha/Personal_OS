import { cache } from "@/lib/cache/index";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { one } from "@/lib/db";
import { logActivity } from "@/lib/crud";

// Storage is modular: today files live in PostgreSQL (bytea). To switch to S3/R2/local disk later,
// replace the INSERT here and the SELECT in [id]/route.js (see README → Files storage).
const MAX = Math.min(Number(process.env.MAX_UPLOAD_MB) || 4, 4) * 1024 * 1024;

export async function POST(req) {
  try {
    const uid = await requireUserId();
    const form = await req.formData(); const file = form.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ error: "No file received" }, { status: 400 });
    if (file.size > MAX) return NextResponse.json({ error: `File is too large (max ${MAX / 1048576} MB on the free tier)` }, { status: 413 });
    if (file.size === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });
    const tags = String(form.get("tags") || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20);
    let project = String(form.get("project_id") || "") || null;
    if (project) { const p = await one("SELECT 1 AS ok FROM projects WHERE id=$1 AND user_id=$2", [project, uid]); if (!p) project = null; }
    const buf = Buffer.from(await file.arrayBuffer());
    const name = String(file.name || "file").replace(/[\\/\r\n"]/g, "_").slice(0, 200);
    const row = await one("INSERT INTO files(user_id,project_id,name,mime_type,size_bytes,tags,data) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name",
      [uid, project, name, (file.type || "application/octet-stream").slice(0, 120), buf.length, tags, buf]);
    await logActivity(uid, "file", "added", name);
    await cache.bump(uid);   // invalidate this user's cached answers (never throws)
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[upload]", e); return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
