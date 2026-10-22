import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listMemories } from "@/lib/memory";
import { MEMORY_LIMITS } from "@/lib/memory-rules";
import MemoryClient from "@/components/modules/MemoryClient";
export const metadata = { title: "JARVIS memory" };
export default async function MemoryPage() {
  const user = await requireUser(); const rows = await listMemories(user.id);
  return (<><div className="page-head"><div><h1>JARVIS memory</h1><p className="sub">Things you asked JARVIS to remember. Say “remember that …” to JARVIS, or add and edit them here.</p></div><Link className="btn" href="/settings">Back to Settings</Link></div>
    <MemoryClient initial={JSON.parse(JSON.stringify(rows))} limit={MEMORY_LIMITS.perUser} max={MEMORY_LIMITS.chars} /></>);
}
