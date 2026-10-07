"use server";
import { query, one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { crud, safe, fail, refresh } from "@/lib/crud";
import { quickLinkSchema } from "@/lib/validation";
import { z } from "zod";

const links = crud("quick_links", quickLinkSchema, { kind: "link", touch: true });

export async function createQuickLink(input) {
  return safe(async () => {
    const uid = await requireUserId();
    const n = await one("SELECT count(*)::int AS n, COALESCE(max(position),0)+1 AS pos FROM quick_links WHERE user_id=$1", [uid]);
    if (n.n >= 60) throw fail("You can save up to 60 quick links");
    return links.create(input, { position: n.pos });
  });
}
export async function updateQuickLink(id, input) { return safe(() => links.update(id, input)); }
export async function deleteQuickLink(id) { return safe(() => links.remove(id)); }
export async function toggleFavoriteQuickLink(id) {
  return safe(async () => { const uid = await requireUserId(); await query("UPDATE quick_links SET favorite = NOT favorite, updated_at=now() WHERE id=$1 AND user_id=$2", [id, uid]); refresh(); return true; });
}
// ids = full ordered list of the user's link ids. Positions are only written for rows that belong to the user.
export async function reorderQuickLinks(ids) {
  return safe(async () => {
    const uid = await requireUserId(); const list = z.array(z.string().uuid()).max(200).parse(ids);
    await query("UPDATE quick_links q SET position = v.pos FROM (SELECT unnest($1::uuid[]) AS id, generate_series(1, $2::int) AS pos) v WHERE q.id=v.id AND q.user_id=$3", [list, list.length, uid]);
    refresh(); return true;
  });
}
