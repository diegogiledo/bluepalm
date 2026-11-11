"use client";
import { useActionState } from "react";
import { login } from "../actions";
import { Submit } from "@/components/portal-forms";

export function AdminLoginForm() {
  const [state, action] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      <label className="block"><span className="label">Email</span><input key={state?.email} name="email" type="email" required autoComplete="username" defaultValue={state?.email} className="input" /></label>
      <label className="block"><span className="label">Password</span><input name="password" type="password" required autoComplete="current-password" className="input" /></label>
      {state?.error && <p className="field-error" role="alert">{state.error}</p>}
      <Submit className="btn-primary w-full" pending="Signing in…">Sign in</Submit>
    </form>
  );
}
