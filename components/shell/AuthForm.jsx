"use client";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction, registerAction } from "@/actions/auth";
import Logo from "@/components/ui/Logo";

export default function AuthForm({ mode, registrationOpen = true }) {
  const reg = mode === "register";
  const [state, action, pending] = useActionState(reg ? registerAction : loginAction, null);
  return (
    <main style={{ position: "relative", zIndex: 1, minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "min(100%, 400px)" }}>
        <div className="flex items-center gap-3 mb-6"><Logo size={44} />
          <div><h1 style={{ fontSize: 22 }}>{reg ? "Create your dashboard" : "Welcome back, Lucifer"}</h1><p className="sub">{reg ? "Your private personal operating system." : "Sign in to continue."}</p></div></div>
        <form action={action} className="card flex flex-col gap-3" style={{ padding: 20 }}>
          {state?.error && <div className="error-box" role="alert">{state.error}</div>}
          {reg && <label className="field"><span className="label">Display name</span><input className="input" name="display_name" defaultValue="Lucifer" maxLength={60} autoComplete="nickname" /></label>}
          <label className="field"><span className="label">Email</span><input className="input" name="email" type="email" required autoComplete="email" autoFocus defaultValue={state?.email || ""} key={state?.email || "e"} /></label>
          <label className="field"><span className="label">Password{reg && " (8+ characters)"}</span><input className="input" name="password" type="password" required minLength={reg ? 8 : 1} autoComplete={reg ? "new-password" : "current-password"} /></label>
          <button className="btn btn-primary" disabled={pending} style={{ minHeight: 42 }}>{pending ? "Please wait…" : reg ? "Create account" : "Sign in"}</button>
        </form>
        <p className="sub mt-4 text-center">{reg ? <>Already have an account? <Link href="/login" style={{ color: "var(--color-primary)" }}>Sign in</Link></> : registrationOpen ? <>New here? <Link href="/register" style={{ color: "var(--color-primary)" }}>Create an account</Link></> : "Registration is closed on this instance."}</p>
      </div>
    </main>
  );
}
