import { authenticateMobile, mjson } from "@/lib/mobile-auth";
import { revokeById } from "@/lib/apitokens";
import { one } from "@/lib/db";
import { geminiConfigured } from "@/lib/jarvis/provider";

// GET  /api/mobile/me  → verifies the pairing token; used by the Android app's "Link" and "Test connection".
// DELETE /api/mobile/me → revokes THIS token (Android "Unlink").
export async function GET(req) {
  const { auth, res } = await authenticateMobile(req); if (res) return res;
  const u = await one("SELECT display_name FROM users WHERE id=$1", [auth.uid]); if (!u) return mjson({ ok: false, code: "BAD_TOKEN", text: "Account not found." }, 401);
  return mjson({ ok: true, api: 1, user: { name: u.display_name }, device: { name: auth.name, expiresAt: auth.expiresAt }, jarvis: { aiConfigured: geminiConfigured() } });
}
export async function DELETE(req) {
  const { auth, res } = await authenticateMobile(req); if (res) return res;
  await revokeById(auth.tokenId); return mjson({ ok: true });
}
