"use client";
import { useActionState, useRef, useState } from "react";
import { prepareCommandAttempt, type CommandAttempt } from "@/domain/command-attempt";
import type { ReturnReview } from "@/domain/return-reviews";
import type { OperationalActionState } from "@/app/office/operational-actions";
import { resolveReturnReview } from "./actions";

export function ReturnReviewForm({ review, approvalRequired }: Readonly<{ review: ReturnReview; approvalRequired: boolean }>) {
  const attempt = useRef<CommandAttempt | undefined>(undefined);
  const [decision, setDecision] = useState("");
  const [state, action, pending] = useActionState(async (_state: OperationalActionState, form: FormData): Promise<OperationalActionState> => {
    try {
      attempt.current = prepareCommandAttempt(form, attempt.current, ["request_id"], () => crypto.randomUUID());
      return await resolveReturnReview({}, form);
    } catch { return { outcome: "error", message: "The response did not arrive. Retry the same decision to confirm it safely.",
      ...(attempt.current?.identifiers["request_id"] ? { reference: attempt.current.identifiers["request_id"] } : {}) }; }
  }, {});
  const prefix = `review-${review.id}`;
  return <div className="management-panel management-panel-critical">
    <div><p className="eyebrow">Financial decision</p><h3>Approve the collection credit</h3>
      <p>Approval keeps the recorded quantities, VAT, credit and cash unchanged. It issues the official invoice or credit note and records your reason.</p>
      {decision === "authorized_manual_return" ? <p>The separate approval accepts the recorded credit without using the original invoice&apos;s remaining return allowance.</p> : null}
      {decision === "original_sale" ? <p>The original invoice must have enough allowance for these exact quantities and amounts. The check runs again when you approve.</p> : null}
    </div>
    <div>{state.message ? <div className={state.outcome === "error" ? "form-error" : "form-success"} role={state.outcome === "error" ? "alert" : "status"}><p>{state.message}</p>{state.reference ? <small>Audit reference: <code>{state.reference}</code></small> : null}</div> : null}
      {state.outcome !== "success" ? <form action={action} className="management-form" onReset={(event) => event.preventDefault()}>
        <input type="hidden" name="exception_id" value={review.id} /><input type="hidden" name="delivery_id" value={review.deliveryID} /><input type="hidden" name="expected_version" value={review.version} />
        <label htmlFor={`${prefix}-decision`}>Credit basis<select id={`${prefix}-decision`} name="decision" value={decision} onChange={(event) => setDecision(event.target.value)} required>
          <option value="" disabled>Choose a financial decision</option><option value="original_sale">Use original invoice allowance, if available</option><option value="authorized_manual_return">Approve the recorded credit separately</option>
        </select></label>
        <label htmlFor={`${prefix}-reason`}>Reason<textarea id={`${prefix}-reason`} name="reason" required maxLength={1000} /></label>
        {approvalRequired ? <label htmlFor={`${prefix}-approval`}>Approval reference<textarea id={`${prefix}-approval`} name="approval_reference" required maxLength={1000} placeholder="Who approved this credit and the supporting reference" /></label> : null}
        <label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes" required />I reviewed the returned goods, credit, VAT and recorded cash and approve this financial decision.</label>
        <button type="submit" disabled={pending}>{pending ? "Recording approval…" : state.outcome === "error" ? "Retry approval" : "Approve credit and issue document"}</button>
      </form> : null}
    </div>
  </div>;
}
