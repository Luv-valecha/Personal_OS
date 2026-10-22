import { z } from "zod";

const str = (max = 200) => z.string().trim().max(max);
const req = (max = 200) => z.string().trim().min(1, "This field is required").max(max);
const optDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").nullable());
const reqDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const uuidOrNull = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().uuid().nullable());
const priority = z.enum(["low", "medium", "high"]);
const tags = z.preprocess(
  (v) => (typeof v === "string" ? v.split(",") : Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean),
  z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20).transform((a) => [...new Set(a)])
);
const recurrence = z.enum(["none", "daily", "weekly", "monthly"]);

export const taskSchema = z.object({
  title: req(300), notes: str(5000).optional(), priority: priority.optional(), due_date: optDate.optional(), scheduled_date: optDate.optional(),
  estimate_minutes: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(1440).nullable()).optional(),
  tags: tags.optional(), project_id: uuidOrNull.optional(), recurrence: recurrence.optional(),
});
export const projectSchema = z.object({
  name: req(120), description: str(5000).optional(),
  status: z.enum(["idea", "planned", "in_progress", "paused", "completed", "archived"]).optional(),
  priority: priority.optional(), start_date: optDate.optional(), deadline: optDate.optional(),
  links: z.array(z.object({ title: str(100), url: str(500) })).max(30).optional(),
});
export const deadlineSchema = z.object({
  title: req(300), due_date: reqDate, priority: priority.optional(), course: str(120).optional(), project_id: uuidOrNull.optional(),
});
export const noteSchema = z.object({
  title: str(300).optional(), body: str(100000).optional(), tags: tags.optional(), project_id: uuidOrNull.optional(),
});
export const bookmarkSchema = z.object({
  url: z.string().trim().max(2000), title: str(300).optional(), description: str(1000).optional(),
  category: z.enum(["development", "research", "education", "entertainment", "shopping", "ideas", "other"]).optional(),
  tags: tags.optional(),
});
export const eventSchema = z.object({
  title: req(200), description: str(3000).optional(), location: str(200).optional(),
  starts_at: z.string().min(10), ends_at: z.string().min(10), all_day: z.boolean().optional(),
  reminder_minutes: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(10080).nullable()).optional(),
  recurrence: recurrence.optional(),
});
export const ideaSchema = z.object({
  title: req(200), description: str(5000).optional(), tags: tags.optional(), priority: priority.optional(),
  status: z.enum(["inbox", "considering", "building", "completed", "rejected"]).optional(), project_id: uuidOrNull.optional(),
});
export const BUG_STATUSES = ["open", "in_progress", "resolved", "wont_fix"];
export const bugSchema = z.object({
  title: req(300), description: str(5000).optional(), status: z.enum(BUG_STATUSES).optional(), priority: priority.optional(),
  due_date: optDate.optional(), project_id: z.string().uuid("Pick a project"),
});
export const expenseSchema = z.object({
  amount: z.preprocess((v) => Number(v), z.number().min(0).max(1e9)), category: str(40).optional(),
  description: str(300).optional(), spent_on: reqDate.optional(),
});
export const devProjectSchema = z.object({
  name: req(120), github_url: str(500).optional(), deploy_url: str(500).optional(), description: str(3000).optional(),
  tech_stack: tags.optional(), status: z.enum(["live", "building", "paused", "archived"]).optional(), notes: str(10000).optional(),
  todos: z.array(z.object({ text: str(300), done: z.boolean() })).max(100).optional(),
});
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  display_name: str(60).optional(),
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const customThemeSchema = z.object({
  name: req(40),
  tokens: z.object({
    primary: hexColor, secondary: hexColor, accent: hexColor, background: hexColor, surface: hexColor, border: hexColor, text: hexColor,
    radius: z.number().min(0).max(28), card: z.enum(["flat", "outlined", "elevated"]), intensity: z.enum(["none", "subtle", "medium"]), effect: z.enum(["none", "grid", "dots", "glow"]),
  }),
});
export function zodMessage(e) {
  return e?.issues?.[0] ? `${e.issues[0].path.join(".") || "Input"}: ${e.issues[0].message}`.replace(/^Input: /, "") : e?.message || "Something went wrong";
}

export const ICONS = ["auto", "github", "mail", "drive", "book", "school", "globe", "code", "chat", "video", "music", "cart", "wallet", "star", "home", "folder", "tasks", "calendar", "timer", "note"];
const linkUrl = z.string().trim().max(2000).refine((u) => /^https?:\/\/[^\s]+$/i.test(u) || /^\/(?!\/)[^\s]*$/.test(u), "Enter a full web address (https://…) or an internal path like /tasks");
export const quickLinkSchema = z.object({
  title: req(60), url: linkUrl, icon: z.enum(ICONS).optional(), category: str(40).optional(), description: str(200).optional(), favorite: z.boolean().optional(),
});

export const SPLIT_KINDS = ["lent", "borrowed", "they_paid_me", "i_paid_them"];
export const splitEntrySchema = z.object({
  kind: z.enum(SPLIT_KINDS), amount: z.preprocess((v) => Number(v), z.number().positive("Amount must be more than 0").max(1e8)),
  reason: str(300).optional(), entry_date: reqDate.optional(),
});
export const friendNameSchema = z.string().trim().min(1, "Enter a name").max(60);
