"use client";

import { useActionState } from "react";
import { signIn, type LoginActionState } from "./actions";

const initialState: LoginActionState = {};

export function LoginForm({ destination }: Readonly<{ destination: string }>) {
  const [state, action, pending] = useActionState(signIn, initialState);
  return (
    <form action={action} className="login-form" aria-busy={pending}>
      <input type="hidden" name="next" value={destination} />
      <label htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} aria-invalid={state.message ? true : undefined} aria-describedby={state.message ? "login-instructions login-error" : "login-instructions"} />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} aria-invalid={state.message ? true : undefined} aria-describedby={state.message ? "login-error" : undefined} />
      {state.message ? <p className="form-error" id="login-error" role="alert">{state.message}</p> : null}
      <button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
