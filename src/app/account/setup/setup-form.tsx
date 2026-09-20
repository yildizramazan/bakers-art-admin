"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { finishAccountSetup, verifySetupLink, type SetupState } from "./actions";

export function SetupForm() {
  const router = useRouter();
  const started = useRef(false);
  const [verified, setVerified] = useState<SetupState | null>(null);
  const [state, action, pending] = useActionState(finishAccountSetup, {});
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = window.location.hash;
    window.history.replaceState(null, "", window.location.pathname);
    void verifySetupLink(fragment).then(setVerified).catch(() => setVerified({ message: "The setup service could not be reached. Ask the owner for a fresh link and try again." }));
  }, []);
  useEffect(() => {
    // Auth cookie changes refresh the Next route. Clear its canonical URL too:
    // a native history replacement alone can be restored by that refresh.
    if (verified) router.replace("/account/setup", { scroll: false });
  }, [verified, router]);
  if (!verified) return <p role="status">Checking your private setup link…</p>;
  if (!verified.userID) return <p className="form-error" role="alert">{verified.message}</p>;
  if (state.complete) return <div aria-live="polite"><h2>Your account is ready</h2><p className="login-copy">Sign in as {state.email} with the password you just chose.</p>{state.role === "driver" ? <p className="login-copy">Open the Wholesale Driver app on your iPhone and sign in to receive your assigned work.</p> : <Link className="primary-link" href="/office">Open office</Link>}</div>;
  return <form className="login-form" action={action} aria-busy={pending}>
    <p className="login-copy">Create a password for <strong>{verified.email}</strong>.</p>
    <input type="hidden" name="user_id" value={verified.userID} />
    <label htmlFor="setup-password">New password</label><input id="setup-password" name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" aria-describedby="password-help" />
    <p className="field-help" id="password-help">Use at least 12 characters. A long, unique passphrase works well.</p>
    <label htmlFor="setup-confirmation">Confirm password</label><input id="setup-confirmation" name="confirmation" type="password" required minLength={12} maxLength={72} autoComplete="new-password" />
    {state.message ? <p className="form-error" role="alert">{state.message}</p> : null}
    <button type="submit" disabled={pending}>{pending ? "Saving your account…" : "Save password and activate account"}</button>
  </form>;
}
