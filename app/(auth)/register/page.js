import { redirect } from "next/navigation";
import AuthForm from "@/components/shell/AuthForm";
import { getUser } from "@/lib/auth";
export const metadata = { title: "Create account" };
export default async function RegisterPage() {
  if (await getUser().catch(() => null)) redirect("/dashboard");
  if (process.env.ALLOW_REGISTRATION === "false") redirect("/login");
  return <AuthForm mode="register" />;
}
