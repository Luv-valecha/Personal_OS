// Natural-language repeat phrases → a rule (pure). The MODEL never builds rule objects; it passes the user's words and the server decides.
// → { none:true } | { rule } | { error }   (error text is shown to the user as a clarifying question)
import { addDays } from "@/lib/dates";
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const DOW = { mon: 0, tue: 1, tues: 1, wed: 2, thu: 3, thur: 3, thurs: 3, fri: 4, sat: 5, sun: 6 };
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n) => String(n).padStart(2, "0");
const num = (w) => (/^\d+$/.test(w) ? Number(w) : NUM[w]);

function parseUntil(s, start) {
  let m = s.match(/\buntil\s+(?:the\s+)?(?:end of\s+)?(\d{4}-\d{2}-\d{2})\b/); if (m) return m[1];
  m = s.match(/\b(?:until|through|till)\s+(?:the\s+)?(?:end of\s+)?(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:,?\s+(\d{4}))?\b/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2]) + 1, dayNum = m[1] || m[3], sy = +start.slice(0, 4);
  let y = m[4] ? +m[4] : sy; const pick = (yy) => `${yy}-${pad(mon)}-${pad(dayNum ? Math.min(+dayNum, dim(yy, mon)) : dim(yy, mon))}`;   // "until December" = end of that month
  let d = pick(y); if (!m[4] && d < start) d = pick(y + 1);
  return d;
}
const addMonths = (d, n) => { const t = +d.slice(0, 4) * 12 + +d.slice(5, 7) - 1 + n, y = Math.floor(t / 12), mo = (t % 12) + 1; return `${y}-${pad(mo)}-${pad(Math.min(+d.slice(8), dim(y, mo)))}`; };

export function parseRepeat(text, startDate) {
  const s = String(text || "").toLowerCase().replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return { error: "How often should it repeat?" };
  if (/^(once|never|no repeat|does not repeat|doesn't repeat|don't repeat|do not repeat|not recurring|one[- ]?time)$/.test(s)) return { none: true };
  if (/\bbi-?monthly\b|\bsemi-?monthly\b|\btwice a (week|month)\b/.test(s)) return { error: "“Bimonthly” can mean every two months or twice a month — which do you mean?" };

  let interval = 1, freq = null, byweekday, bymonthday;
  if (/\bbi-?weekly\b|\bfortnightly\b|\bevery (?:other|second) week\b/.test(s)) { freq = "weekly"; interval = 2; }
  else if (/\bevery other (day|month|year)\b/.test(s)) { interval = 2; freq = { day: "daily", month: "monthly", year: "yearly" }[s.match(/\bevery other (day|month|year)\b/)[1]]; }
  else { const m = s.match(/\bevery (\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve) (day|week|month|year)s?\b/); if (m) { interval = num(m[1]); freq = { day: "daily", week: "weekly", month: "monthly", year: "yearly" }[m[2]]; } }
  if (/\bevery weekdays?\b|\bweekdays\b|\bmonday (?:to|through|-) friday\b/.test(s)) { freq = "weekly"; byweekday = [0, 1, 2, 3, 4]; }
  else if (/\bevery weekends?\b|\bweekends\b/.test(s)) { freq = "weekly"; byweekday = [5, 6]; }
  else {
    const days = [...s.matchAll(/\b(mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?s?\b/g)].map((m) => DOW[m[1]]).filter((d) => d !== undefined);
    if (days.length) { freq ||= "weekly"; if (freq === "weekly") byweekday = [...new Set(days)].sort((a, b) => a - b); }
  }
  if (!freq) { if (/\b(daily|every day|each day|everyday)\b/.test(s)) freq = "daily"; else if (/\b(weekly|every week|each week)\b/.test(s)) freq = "weekly"; else if (/\b(monthly|every month|each month|of every month|of each month)\b/.test(s)) freq = "monthly"; else if (/\b(yearly|annually|every year|each year|annual)\b/.test(s)) freq = "yearly"; }
  if (!freq) return { error: `I couldn't tell how “${text}” repeats. Try “every day”, “every weekday”, “every Monday”, “every 2 weeks” or “the first day of every month”.` };

  if (freq === "monthly") {
    if (/\blast day\b/.test(s)) bymonthday = -1;
    else if (/\bfirst day\b/.test(s)) bymonthday = 1;
    else { const m = s.match(/\b(?:on )?(?:the |day )?(\d{1,2})(?:st|nd|rd|th)?\b(?! ?(?:week|day|month|year))/); if (m && !/\bevery \d/.test(s.slice(0, m.index + m[0].length).slice(-12))) bymonthday = +m[1]; }
    if (bymonthday !== undefined && bymonthday !== -1 && (bymonthday < 1 || bymonthday > 31)) return { error: "Which day of the month (1–31)?" };
  }
  const rule = { freq, interval, ...(freq === "weekly" && byweekday ? { byweekday } : {}), ...(bymonthday !== undefined ? { bymonthday } : {}) };

  const until = parseUntil(s, startDate); const times = s.match(/\b(?:for )?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve) (?:times|occurrences)\b/); const span = s.match(/\bfor (\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve) (day|week|month|year)s?\b/);
  if (until) rule.until = until;
  else if (times) rule.count = num(times[1]);
  else if (span) { const n = num(span[1]), u = span[2]; rule.until = u === "day" ? addDays(startDate, n - 1) : u === "week" ? addDays(startDate, n * 7 - 1) : addDays(addMonths(startDate, u === "month" ? n : n * 12), -1); }
  return { rule };
}
