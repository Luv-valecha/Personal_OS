"use server";
import { requireUserId } from "@/lib/auth";
import { safe, refresh } from "@/lib/crud";
import { createApiToken, revokeApiToken } from "@/lib/apitokens";

// Settings → Android companion. Requires a normal logged-in website session (cookie); tokens are created/revoked here only.
export async function createMobileToken(name) { return safe(async () => { const uid = await requireUserId(); const { token, row } = await createApiToken(uid, name); refresh(); return { token, id: row.id, name: row.name }; }); }
export async function revokeMobileToken(id) { return safe(async () => { const uid = await requireUserId(); await revokeApiToken(uid, id); refresh(); return true; }); }
