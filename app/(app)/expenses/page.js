import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings, getToday } from "@/lib/server-utils";
import { getMoney } from "@/lib/queries";
import { addDays, startOfMonth } from "@/lib/dates";
import ExpensesClient from "@/components/modules/ExpensesClient";
export const metadata = { title: "Expenses" };
export default async function ExpensesPage({ searchParams }) {
  const user = await requireUser(); const today = await getToday(); const settings = await getSettings(user.id); await searchParams;
  const [money, recent, cats, daily] = await Promise.all([
    getMoney(user.id, today),
    query("SELECT id, amount, category, description, spent_on FROM expenses WHERE user_id=$1 ORDER BY spent_on DESC, created_at DESC LIMIT 100", [user.id]),
    query("SELECT category, SUM(amount)::float AS total FROM expenses WHERE user_id=$1 AND spent_on>=$2 AND spent_on<=$3 GROUP BY category ORDER BY total DESC", [user.id, startOfMonth(today), today]),
    query("SELECT spent_on::text AS day, SUM(amount)::float AS total FROM expenses WHERE user_id=$1 AND spent_on>$2 AND spent_on<=$3 GROUP BY 1", [user.id, addDays(today, -14), today]),
  ]);
  return <ExpensesClient money={money} recent={recent} cats={cats} daily={daily} today={today} currency={settings.currency} budget={Number(settings.monthly_budget) || 0} />;
}
