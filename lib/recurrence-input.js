// Normalises recurrence fields of an event create/update payload (pure). The client can't make the two fields disagree.
//   rule present  → recurrence = "custom", rule.tz defaults to the user's timezone, end date must not precede the start
//   recurrence is none/daily/weekly/monthly → any stored rule is cleared (null)
//   recurrence = "custom" without a rule → error
import { dateInTz } from "@/lib/dates";
export function normalizeRecurrence(input, tz) {
  const out = { ...input };
  if (out.recurrence_rule) {
    out.recurrence = "custom"; out.recurrence_rule = { ...out.recurrence_rule, tz: out.recurrence_rule.tz || tz };
    if (out.starts_at && out.recurrence_rule.until && out.recurrence_rule.until < dateInTz(out.starts_at, out.recurrence_rule.tz)) return { error: "The repeat end date is before the event starts" };
  } else if (out.recurrence === "custom") return { error: "Custom repeat needs a rule" };
  else if (out.recurrence !== undefined || out.recurrence_rule === null) out.recurrence_rule = null;
  return { value: out };
}
