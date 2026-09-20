"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { provisionAccount, type ProvisionState } from "./actions";

export interface PendingAccount { request_id: string; display_name: string; email: string; employee_id: string; role: string }

export function AccountForm({ account }: Readonly<{ account?: PendingAccount }>) {
  const attempt = useRef<{ id: string; fingerprint: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(async (_previous: ProvisionState, form: FormData): Promise<ProvisionState> => {
    form.set("action", account ? "resume" : "create");
    const fingerprint = JSON.stringify([...form.entries()]);
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = { id: account?.request_id ?? crypto.randomUUID(), fingerprint };
    form.set("request_id", attempt.current.id);
    try { return await provisionAccount({}, form); }
    catch { return { message: "The response did not arrive. Retry the same details to resume safely." }; }
  }, {});
  if (state.result) return <section className="editor-result" aria-live="polite">
    <h2>{state.result.state === "active" ? "Account already active" : "Account created"}</h2>
    {state.result.setup_url ? <>
      <p>Share this private, single-use link with the employee. They will choose their own password. No email has been sent.</p>
      <label className="visually-hidden" htmlFor={`setup-link-${state.result.request_id}`}>Private password setup link</label>
      <textarea id={`setup-link-${state.result.request_id}`} className="setup-link" readOnly value={state.result.setup_url} rows={4} />
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(state.result!.setup_url!); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Link copied" : "Copy setup link"}</button>
      <p className="field-help">If it expires, resume this account to generate a new link. The employee must finish setup before they can work.</p>
    </> : <p>This employee has completed password setup.</p>}
    <div className="toolbar"><Link className="quiet-link" href={`/office/drivers/${state.result.profile_id}`}>View employee</Link><Link className="quiet-link" href="/office/drivers">All users</Link></div>
  </section>;
  return <form action={action} className="management-form editor-form" aria-busy={pending} onReset={(event) => event.preventDefault()}>
    <fieldset disabled={pending}>
      {account ? <><h3>{account.display_name}</h3><p>{account.email} · {account.employee_id} · {account.role.replaceAll("_", " ")}</p><p className="field-help">Resume an interrupted setup or generate a fresh password setup link.</p></> : <div className="editor-grid">
        <div className="editor-field"><label htmlFor="new-account-name">Full name</label><input id="new-account-name" name="display_name" required maxLength={200} autoComplete="off" /></div>
        <div className="editor-field"><label htmlFor="new-account-email">Email address</label><input id="new-account-email" name="email" type="email" required maxLength={254} autoComplete="off" autoCapitalize="none" /></div>
        <div className="editor-field"><label htmlFor="new-account-employee">Employee ID</label><input id="new-account-employee" name="employee_id" required maxLength={100} autoComplete="off" /></div>
        <div className="editor-field"><label htmlFor="new-account-role">Role</label><select id="new-account-role" name="role" defaultValue="driver"><option value="driver">Driver</option><option value="accountant">Accountant</option><option value="owner_admin">Owner / Admin</option></select></div>
        <div className="editor-field editor-field-wide"><label htmlFor="new-account-reason">Reason for adding this account</label><textarea id="new-account-reason" name="reason" required maxLength={1000} rows={2} /></div>
      </div>}
      {state.message ? <p className="form-error" role="alert">{state.message}</p> : null}
      <button type="submit">{pending ? "Preparing account…" : account ? "Resume account setup" : "Create account and setup link"}</button>
    </fieldset>
  </form>;
}
