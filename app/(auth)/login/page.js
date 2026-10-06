import { redirect } from "next/navigation";
import AuthForm from "@/components/shell/AuthForm";
import { getUser } from "@/lib/auth";
export const metadata = { title: "Sign in" };
export default async function LoginPage() {
  if (await getUser().catch(() => null)) redirect("/dashboard");
  return <AuthForm mode="login" registrationOpen={process.env.ALLOW_REGISTRATION !== "false"} />;
}
