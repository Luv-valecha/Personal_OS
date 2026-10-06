import AppShell from "@/components/shell/AppShell";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/server-utils";

export default async function AppLayout({ children }) {
  const user = await requireUser();
  const [settings, projects] = await Promise.all([
    getSettings(user.id),
    query("SELECT id, name FROM projects WHERE user_id=$1 AND status NOT IN ('archived','completed') ORDER BY name LIMIT 100", [user.id]),
  ]);
  return <AppShell user={{ display_name: user.display_name }} currency={settings.currency} projects={projects}>{children}</AppShell>;
}
