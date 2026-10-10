import "server-only";
import { query, one } from "@/lib/db";
import { addDays, diffDays, startOfMonth, startOfWeek } from "@/lib/dates";

// Named ranges used by the UI presets and by JARVIS ("last 30 days", "this year"…).
export function resolveRange(name, today) {
  switch (name) {
    case "today": return [today, today];
    case "week": return [startOfWeek(today), today];
    case "last_7_days": return [addDays(today, -6), today];
    case "last_30_days": return [addDays(today, -29), today];
    case "last_90_days": return [addDays(today, -89), today];
    case "last_month": { const e = addDays(startOfMonth(today), -1); return [startOfMonth(e), e]; }
    case "year": return [today.slice(0, 4) + "-01-01", today];
    case "all": return ["1970-01-01", today];
    default: return [startOfMonth(today), today]; // "month"
  }
}
const like = (s) => `%${String(s).replace(/[\\%_]/g, "\\$&")}%`;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// One call → every metric the Expenses page shows and JARVIS can quote. All maths is SQL/JS, never the AI.
export async function expenseStats(uid, { from, to, category = null, contains = null }, today) {
  const f = [uid, from, to, category, contains ? like(contains) : null];
  const W = "user_id=$1 AND spent_on BETWEEN $2 AND $3 AND ($4::text IS NULL OR lower(category)=lower($4)) AND ($5::text IS NULL OR description ILIKE $5)";
  const effFrom = from === "1970-01-01" ? ((await one(`SELECT min(spent_on)::text AS d FROM expenses WHERE ${W}`, f))?.d || to) : from;
  const days = Math.max(1, diffDays(to, effFrom) + 1);
  const [agg, byCat, byWeekday, byMonth, daily, top, topDesc, prev] = await Promise.all([
    one(`SELECT COALESCE(SUM(amount),0)::float AS total, count(*)::int AS n, COALESCE(MAX(amount),0)::float AS max, COALESCE(MIN(amount),0)::float AS min,
           COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY amount),0)::float AS median, count(DISTINCT spent_on)::int AS active_days FROM expenses WHERE ${W}`, f),
    query(`SELECT category, SUM(amount)::float AS total, count(*)::int AS n, AVG(amount)::float AS avg FROM expenses WHERE ${W} GROUP BY category ORDER BY total DESC`, f),
    query(`SELECT extract(isodow from spent_on)::int AS dow, SUM(amount)::float AS total, count(*)::int AS n FROM expenses WHERE ${W} GROUP BY 1 ORDER BY 1`, f),
    query(`SELECT to_char(date_trunc('month', spent_on), 'YYYY-MM') AS month, SUM(amount)::float AS total, count(*)::int AS n FROM expenses WHERE user_id=$1 AND $2::date IS NOT NULL AND spent_on > ($3::date - interval '12 months') AND spent_on <= $3
           AND ($4::text IS NULL OR lower(category)=lower($4)) AND ($5::text IS NULL OR description ILIKE $5) GROUP BY 1 ORDER BY 1`, [uid, from, to, category, f[4]]),
    days <= 366 ? query(`SELECT d::date::text AS day, COALESCE(SUM(e.amount),0)::float AS total FROM generate_series($2::date, $3::date, interval '1 day') d
           LEFT JOIN expenses e ON e.spent_on = d::date AND e.user_id=$1 AND ($4::text IS NULL OR lower(e.category)=lower($4)) AND ($5::text IS NULL OR e.description ILIKE $5) GROUP BY d ORDER BY d`, [uid, effFrom, to, category, f[4]]) : [],
    query(`SELECT id, amount::float AS amount, category, description, spent_on::text AS date FROM expenses WHERE ${W} ORDER BY amount DESC, spent_on DESC LIMIT 5`, f),
    query(`SELECT lower(NULLIF(trim(description),'')) AS label, SUM(amount)::float AS total, count(*)::int AS n FROM expenses WHERE ${W} AND NULLIF(trim(description),'') IS NOT NULL GROUP BY 1 ORDER BY total DESC LIMIT 5`, f),
    // previous period of equal length directly before the range
    one(`SELECT COALESCE(SUM(amount),0)::float AS total, count(*)::int AS n FROM expenses WHERE user_id=$1 AND spent_on BETWEEN $2 AND $3 AND ($4::text IS NULL OR lower(category)=lower($4)) AND ($5::text IS NULL OR description ILIKE $5)`,
      [uid, addDays(effFrom, -days), addDays(effFrom, -1), category, f[4]]),
  ]);
  const total = r2(agg.total); const wk = byWeekday.filter((d) => d.dow >= 6).reduce((s, d) => s + d.total, 0);
  // month-end forecast only makes sense when the range includes today within the current month
  const monthStart = startOfMonth(today); let forecast = null;
  if (to >= today && effFrom <= today) { const [mf] = [monthStart > effFrom ? monthStart : effFrom]; const dm = diffDays(today, mf) + 1; const monthTotal = (await one("SELECT COALESCE(SUM(amount),0)::float AS t FROM expenses WHERE user_id=$1 AND spent_on BETWEEN $2 AND $3 AND ($4::text IS NULL OR lower(category)=lower($4)) AND ($5::text IS NULL OR description ILIKE $5)", [uid, monthStart, today, category, f[4]])).t;
    const dim = diffDays(addDays(new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 1)).toISOString().slice(0, 10), -1), monthStart) + 1; forecast = { month_so_far: r2(monthTotal), projected_month_total: r2((monthTotal / (diffDays(today, monthStart) + 1)) * dim), days_in_month: dim }; }
  return {
    range: { from: effFrom, to, days }, filters: { category, contains },
    total, count: agg.n, average_per_expense: r2(agg.n ? total / agg.n : 0), average_per_day: r2(total / days), average_per_active_day: r2(agg.active_days ? total / agg.active_days : 0),
    median: r2(agg.median), max: r2(agg.max), min: r2(agg.min), active_days: agg.active_days, no_spend_days: Math.max(0, days - agg.active_days),
    by_category: byCat.map((c) => ({ category: c.category, total: r2(c.total), count: c.n, average: r2(c.avg), share_pct: total ? Math.round((c.total / total) * 1000) / 10 : 0 })),
    by_weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name, i) => { const d = byWeekday.find((x) => x.dow === i + 1); return { weekday: name, total: r2(d?.total), count: d?.n || 0 }; }),
    weekend_total: r2(wk), weekday_total: r2(total - wk),
    by_month: byMonth.map((m) => ({ month: m.month, total: r2(m.total), count: m.n })),
    daily: daily.map((d) => ({ day: d.day, total: r2(d.total) })),
    top_expenses: top, top_descriptions: topDesc.map((d) => ({ label: d.label, total: r2(d.total), count: d.n })),
    previous_period: { from: addDays(effFrom, -days), to: addDays(effFrom, -1), total: r2(prev.total), count: prev.n, change_pct: prev.total ? Math.round(((total - prev.total) / prev.total) * 1000) / 10 : null },
    forecast,
  };
}
