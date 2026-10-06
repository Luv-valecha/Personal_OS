"use server";
import { crud, safe } from "@/lib/crud";
import { expenseSchema } from "@/lib/validation";
import { getToday } from "@/lib/server-utils";
const ex = crud("expenses", expenseSchema, { kind: "expense", labelKey: "description" });
export async function createExpense(input) {
  return safe(async () => ex.create({ ...input, category: input?.category || "other", spent_on: input?.spent_on || (await getToday()) }));
}
export async function updateExpense(id, input) { return safe(() => ex.update(id, input)); }
export async function deleteExpense(id) { return safe(() => ex.remove(id)); }
