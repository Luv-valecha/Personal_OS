import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listApiTokens } from "@/lib/apitokens";
import AndroidLink from "@/components/modules/AndroidLink";
export const metadata = { title: "Android companion" };
export default async function AndroidPage() {
  const user = await requireUser(); const tokens = await listApiTokens(user.id);
  return (<><div className="page-head"><div><h1>Android companion</h1><p className="sub">Link your phone so the JARVIS home-screen widget can talk to your account.</p></div><Link className="btn" href="/settings">Back to Settings</Link></div>
    <AndroidLink tokens={JSON.parse(JSON.stringify(tokens))} /></>);
}
