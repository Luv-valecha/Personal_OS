import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import BookmarksClient from "@/components/modules/BookmarksClient";
export const metadata = { title: "Bookmarks" };
export default async function BookmarksPage({ searchParams }) {
  const user = await requireUser(); const sp = await searchParams;
  const items = await query("SELECT * FROM bookmarks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 500", [user.id]);
  return <BookmarksClient items={items} initialQuery={sp?.q || ""} />;
}
