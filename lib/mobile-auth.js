import "server-only";
import { NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/apitokens";

export const mjson = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const ipOf = (req) => (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();

// Authenticate an Android request by its Bearer pairing token. Returns {auth} or {res} (an error response to return).
export async function authenticateMobile(req) {
  const h = req.headers.get("authorization") || ""; const m = h.match(/^Bearer\s+(\S+)$/i);
  if (!m) return { res: mjson({ ok: false, code: "NO_TOKEN", text: "Not linked. Open the Lucifer OS app and link this phone." }, 401) };
  const v = await verifyApiToken(m[1], ipOf(req));
  if (v?.limited) return { res: mjson({ ok: false, code: "RATE", text: "Too many attempts. Wait a minute." }, 429) };
  if (!v) return { res: mjson({ ok: false, code: "BAD_TOKEN", text: "This phone's link expired or was revoked. Link it again in the app." }, 401) };
  return { auth: v };
}
