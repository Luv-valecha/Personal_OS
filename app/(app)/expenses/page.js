import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings, getToday } from "@/lib/server-utils";
import { getMoney } from "@/lib/queries";
import { expenseStats, resolveRange } from "@/lib/analytics";
import ExpensesClient from "@/components/modules/ExpensesClient";
export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }) {
  const user = await requireUser(); const today = await getToday(); const settings = await getSettings(user.id); const sp = await searchParams;
  const valid = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
  const preset = sp?.range || (valid(sp?.from) && valid(sp?.to) ? "custom" : "month");
  let [from, to] = preset === "custom" ? [sp.from, sp.to] : resolveRange(preset, today); if (from > to) [from, to] = [to, from];
  const category = sp?.cat || null; const q = (sp?.q || "").slice(0, 60) || null;
  const [money, stats, recent, categories] = await Promise.all([
    getMoney(user.id, today), expenseStats(user.id, { from, to, category, contains: q }, today),
    query(`SELECT id, amount, category, description, spent_on FROM expenses WHERE user_id=$1 AND spent_on BETWEEN $2 AND $3 AND ($4::text IS NULL OR lower(category)=lower($4)) AND ($5::text IS NULL OR description ILIKE '%'||$5||'%') ORDER BY spent_on DESC, created_at DESC LIMIT 100`, [user.id, from, to, category, q]),
    query("SELECT DISTINCT category FROM expenses WHERE user_id=$1 ORDER BY 1", [user.id]),
  ]);
  return <ExpensesClient money={money} stats={stats} recent={recent} categories={categories.map((c) => c.category)} filters={{ preset, from, to, category: category || "", q: q || "" }} today={today} currency={settings.currency} budget={Number(settings.monthly_budget) || 0} />;
}
