import PageHead from "@/components/ui/PageHead";
import SearchClient from "@/components/modules/SearchClient";
import { requireUser } from "@/lib/auth";
export const metadata = { title: "Search" };
export default async function SearchPage({ searchParams }) { await requireUser(); const sp = await searchParams; return <><PageHead title="Search" sub="Tasks, notes, projects, bookmarks, ideas, deadlines and files." /><SearchClient initial={sp?.q || ""} /></>; }
