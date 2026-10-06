"use server";
import { query } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { crud, safe, fail, refresh } from "@/lib/crud";
import { bookmarkSchema } from "@/lib/validation";
import { fetchMetadata, normalizeUrl } from "@/lib/metadata";
const bm = crud("bookmarks", bookmarkSchema.extend({ domain: bookmarkSchema.shape.title }), { kind: "bookmark" });

export async function createBookmark(input) {
  return safe(async () => {
    const u = normalizeUrl(input?.url);
    if (!u) throw fail("Enter a valid web address (http or https)");
    let title = String(input.title || "").trim(), description = String(input.description || "").trim();
    if (!title) { const m = await fetchMetadata(u.href); title = m.title || ""; if (!description) description = m.description || ""; }
    // Metadata failure never blocks saving: fall back to the hostname.
    if (!title) title = u.hostname.replace(/^www\./, "");
    return bm.create({ ...input, url: u.href, title, description, domain: u.hostname.replace(/^www\./, "") });
  });
}
export async function updateBookmark(id, input) { return safe(() => bm.update(id, input)); }
export async function deleteBookmark(id) { return safe(() => bm.remove(id)); }
async function flip(id, col) { const uid = await requireUserId(); await query(`UPDATE bookmarks SET ${col} = NOT ${col} WHERE id=$1 AND user_id=$2`, [id, uid]); refresh(); return true; }
export async function toggleFavoriteBookmark(id) { return safe(() => flip(id, "favorite")); }
export async function toggleArchiveBookmark(id) { return safe(() => flip(id, "archived")); }
