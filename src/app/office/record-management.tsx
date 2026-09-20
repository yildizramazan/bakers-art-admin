"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { minorToPounds, poundsToMinor, replacementTotals, type ReplacementLine } from "@/domain/invoice-replacement";
import { signedHundredthsFromDecimal } from "@/domain/office-editors";
import { prepareCommandAttempt, type CommandAttempt } from "@/domain/command-attempt";
import {
  finalizeOfficeDelivery,
  issueFinancialCorrection,
  replaceOfficeInvoice,
  setEntityActive,
  updatePaymentStatus,
  type OfficeCommandActionState,
} from "@/app/office/management-actions";
import {
  allowedPaymentTransitions,
  type ManagedEntityType,
  type OfficialCorrectionKind,
  type PaymentStatus,
} from "@/domain/office-commands";

const initialState: OfficeCommandActionState = {};

function useRecoverableCommand(
  command: (state: OfficeCommandActionState, form: FormData) => Promise<OfficeCommandActionState>,
  generatedFields: readonly string[] = ["request_id"],
) {
  const attempt = useRef<CommandAttempt | undefined>(undefined);
  return useActionState(async (_state: OfficeCommandActionState, form: FormData) => {
    try {
      attempt.current = prepareCommandAttempt(form, attempt.current, generatedFields, () => crypto.randomUUID());
      return await command({}, form);
    } catch {
      return {
        outcome: "error" as const,
        message: "The response did not arrive. Retry these same details to confirm the result safely.",
        ...(attempt.current?.identifiers["request_id"] ? { reference: attempt.current.identifiers["request_id"] } : {}),
      };
    }
  }, initialState);
}

function ActionMessage({ state }: Readonly<{ state: OfficeCommandActionState }>) {
  if (!state.message) return null;
  return (
    <div className={state.outcome === "error" ? "form-error" : "form-success"} role={state.outcome === "error" ? "alert" : "status"}>
      <p>{state.message}</p>
      {state.reference ? <small>Audit reference: <code>{state.reference}</code></small> : null}
    </div>
  );
}

function CommandIntroduction({ id, eyebrow, title, children }: Readonly<{ id: string; eyebrow: string; title: string; children: React.ReactNode }>) {
  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

export function EntityActiveManagement({
  entityID,
  entityType,
  isActive,
}: Readonly<{ entityID: string; entityType: ManagedEntityType; isActive: boolean }>) {
  const [state, action, pending] = useRecoverableCommand(setEntityActive);
  if (state.outcome === "success") return <ActionMessage state={state} />;
  const nextActive = !isActive;
  const verb = nextActive ? "Activate" : "Deactivate";
  return (
    <section className="management-panel" aria-labelledby="entity-active-title">
      <CommandIntroduction id="entity-active-title" eyebrow="Audited owner action" title={`${verb} record`}>
        {nextActive
          ? "Restore this record for future operational use. Historic evidence remains unchanged."
          : "Remove this record from future operational use without deleting its historic evidence."}
      </CommandIntroduction>
      <form action={action} className="management-form" aria-busy={pending} onReset={(event) => event.preventDefault()}>
        <input type="hidden" name="request_id" />
        <input type="hidden" name="entity_id" value={entityID} />
        <input type="hidden" name="entity_type" value={entityType} />
        <input type="hidden" name="is_active" value={String(nextActive)} />
        <label htmlFor="entity-change-reason">Reason</label>
        <textarea id="entity-change-reason" name="reason" rows={3} required maxLength={500} />
        <label className="command-confirmation">
          <input type="checkbox" name="confirm_entity_change" value="change" required />
          Confirm {verb.toLowerCase()} for future use
        </label>
        <button className={nextActive ? undefined : "danger-button"} type="submit" disabled={pending}>
          {pending ? "Recording…" : `${verb} record`}
        </button>
        <ActionMessage state={state} />
      </form>
    </section>
  );
}

export function DeliveryFinalizationManagement({ deliveryID }: Readonly<{ deliveryID: string }>) {
  const [state, action, pending] = useRecoverableCommand(finalizeOfficeDelivery);
  if (state.outcome === "success") return <ActionMessage state={state} />;
  return (
    <section className="management-panel management-panel-critical" aria-labelledby="delivery-finalization-title">
      <CommandIntroduction id="delivery-finalization-title" eyebrow="Audited financial action" title="Issue authoritative invoice">
        Validate the accepted delivery, allocate the official invoice number, seal its snapshot and queue its private PDF. Issuance is immutable.
      </CommandIntroduction>
      <form action={action} className="management-form" aria-busy={pending} onReset={(event) => event.preventDefault()}>
        <input type="hidden" name="request_id" />
        <input type="hidden" name="delivery_id" value={deliveryID} />
        <label className="command-confirmation">
          <input type="checkbox" name="confirm_finalization" value="issue" required />
          Confirm this accepted delivery is ready for invoice issuance
        </label>
        <button type="submit" disabled={pending}>{pending ? "Issuing…" : "Issue invoice"}</button>
        <ActionMessage state={state} />
      </form>
    </section>
  );
}

function statusLabel(status: PaymentStatus): string {
  return status.replaceAll("_", " ");
}

export function PaymentStatusManagement({ paymentID, currentStatus }: Readonly<{ paymentID: string; currentStatus: PaymentStatus }>) {
  const [state, action, pending] = useRecoverableCommand(updatePaymentStatus);
  if (state.outcome === "success") return <ActionMessage state={state} />;
  const transitions = allowedPaymentTransitions(currentStatus);
  if (transitions.length === 0) {
    return <p className="terminal-command-note">This payment status is terminal. No further audited transition is available.</p>;
  }
  return (
    <section className="management-panel" aria-labelledby="payment-status-title">
      <CommandIntroduction id="payment-status-title" eyebrow="Audited financial action" title="Update payment status">
        Append evidence for a permitted one-way transition. The current status is <strong>{statusLabel(currentStatus)}</strong>.
      </CommandIntroduction>
      <form action={action} className="management-form" aria-busy={pending} onReset={(event) => event.preventDefault()}>
        <input type="hidden" name="request_id" />
        <input type="hidden" name="payment_id" value={paymentID} />
        <label htmlFor="new-payment-status">New status</label>
        <select id="new-payment-status" name="new_status" required defaultValue="">
          <option value="" disabled>Select a permitted transition</option>
          {transitions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
        </select>
        <label htmlFor="payment-evidence-reference">Evidence reference <span>(optional)</span></label>
        <input id="payment-evidence-reference" name="evidence_reference" autoComplete="off" maxLength={250} />
        <label htmlFor="payment-status-reason">Reason</label>
        <textarea id="payment-status-reason" name="reason" rows={3} required maxLength={500} />
        <label className="command-confirmation">
          <input type="checkbox" name="confirm_payment_status" value="change" required />
          Confirm this evidence-backed status transition
        </label>
        <button type="submit" disabled={pending}>{pending ? "Recording…" : "Record payment status"}</button>
        <ActionMessage state={state} />
      </form>
    </section>
  );
}

export function FinancialCorrectionManagement({
  documentID,
  deliveryID,
  approvalRequired,
}: Readonly<{ documentID: string; deliveryID: string; approvalRequired: boolean }>) {
  const [state, action, pending] = useRecoverableCommand(issueFinancialCorrection, ["request_id", "correction_id"]);
  const [kind, setKind] = useState<OfficialCorrectionKind>("credit");
  const [amounts, setAmounts] = useState({ net: "", tax: "", gross: "" });
  const minorAmounts = {
    net: signedHundredthsFromDecimal(amounts.net),
    tax: signedHundredthsFromDecimal(amounts.tax),
    gross: signedHundredthsFromDecimal(amounts.gross),
  };
  const validAmounts = minorAmounts.net !== undefined && minorAmounts.tax !== undefined && minorAmounts.gross !== undefined
    && BigInt(minorAmounts.net) <= 0n && BigInt(minorAmounts.tax) <= 0n && BigInt(minorAmounts.gross) < 0n
    && BigInt(minorAmounts.net) + BigInt(minorAmounts.tax) === BigInt(minorAmounts.gross);
  if (state.outcome === "success") return <ActionMessage state={state} />;
  return (
    <section className="management-panel management-panel-critical" aria-labelledby="financial-correction-title">
      <CommandIntroduction id="financial-correction-title" eyebrow="Controlled financial correction" title="Issue correction credit note">
        Issue a credit note while preserving the original invoice. Enter reductions in pounds, for example −1.00 for a £1.00 credit. Net plus VAT must equal the total.
      </CommandIntroduction>
      <form action={action} className="management-form" aria-busy={pending} onReset={(event) => event.preventDefault()}>
        <input type="hidden" name="request_id" />
        <input type="hidden" name="correction_id" />
        <input type="hidden" name="original_delivery_id" value={deliveryID} />
        <input type="hidden" name="original_financial_document_id" value={documentID} />
        <label htmlFor="correction-kind">Correction kind</label>
        <select id="correction-kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value as OfficialCorrectionKind)}>
          <option value="credit">Partial or full credit</option>
          <option value="void">Void remaining invoice balance</option>
        </select>
        <input type="hidden" name="replacement_delivery_id" value="" />
        <div className="minor-unit-grid">
          {([['net', 'Net change'], ['tax', 'VAT change'], ['gross', 'Total change']] as const).map(([key, label]) => <label key={key} htmlFor={`${key}-delta`}>{label} (£)
            <input id={`${key}-delta`} name={`${key}_delta_pounds`} inputMode="decimal" maxLength={21} aria-describedby="correction-money-help" required
              value={amounts[key]} onChange={(event) => setAmounts((previous) => ({ ...previous, [key]: event.target.value }))} />
            <input type="hidden" name={`${key}_delta_minor`} value={minorAmounts[key] ?? ""} />
          </label>)}
        </div>
        <p className="field-help" id="correction-money-help">Use up to two decimal places. A void must reverse the exact remaining invoice amounts. Credits cannot exceed them.</p>
        {Object.values(amounts).every((value) => value !== "") && !validAmounts ? <p role="status">Enter zero or negative net and VAT changes, and a negative total equal to their sum.</p> : null}
        <label htmlFor="correction-reason">Reason</label>
        <textarea id="correction-reason" name="reason" rows={3} required maxLength={500} />
        <label htmlFor="correction-approval">Approval reference {approvalRequired ? null : <span>(optional)</span>}</label>
        <input id="correction-approval" name="approval_reference" autoComplete="off" maxLength={250} required={approvalRequired} />
        <label className="command-confirmation">
          <input type="checkbox" name="confirm_correction" value="issue" required />
          Confirm irreversible correction and credit-note issuance
        </label>
        <button className="danger-button" type="submit" disabled={pending || !validAmounts}>{pending ? "Issuing…" : "Issue correction"}</button>
        <ActionMessage state={state} />
      </form>
    </section>
  );
}

export function InvoiceReplacementManagement({ documentID, invoiceNumber, originalGrossMinor, lines, approvalRequired, unavailableReason }: Readonly<{
  documentID: string; invoiceNumber: string; originalGrossMinor: string;
  lines: readonly ReplacementLine[]; approvalRequired: boolean;
  unavailableReason: string;
}>) {
  const [prices, setPrices] = useState(() => lines.map((line) => minorToPounds(line.unitAmountMinor)));
  const [state, action, pending] = useRecoverableCommand(replaceOfficeInvoice, ["request_id", "correction_id"]);
  const totals = replacementTotals(lines, prices);
  const changed = lines.some((line, index) => poundsToMinor(prices[index] ?? "") !== line.unitAmountMinor);
  if (state.outcome === "success") return <section className="management-panel">
    <ActionMessage state={state} />
    {state.invoiceID ? <p><Link href={`/office/invoices/${state.invoiceID}`}>Open replacement {state.invoiceNumber}</Link></p> : null}
    {state.creditNoteID ? <p><Link href={`/office/credit-notes/${state.creditNoteID}`}>Open reversal {state.creditNoteNumber}</Link></p> : null}
  </section>;
  if (unavailableReason) return <p className="terminal-command-note">{unavailableReason}</p>;
  return <section className="management-panel management-panel-critical" aria-labelledby="invoice-replacement-title">
    <CommandIntroduction id="invoice-replacement-title" eyebrow="Audited price correction" title="Replace invoice prices">
      Reverse {invoiceNumber} with a full credit note and issue a new invoice with corrected unit prices.
      Delivered quantities and tax rates stay as originally recorded.
    </CommandIntroduction>
    <form action={action} className="management-form" aria-busy={pending} onReset={(event) => event.preventDefault()}>
      <input type="hidden" name="request_id" /><input type="hidden" name="correction_id" />
      <input type="hidden" name="invoice_id" value={documentID} />
      {lines.map((line, index) => <div className="management-panel" key={line.id}>
        <input type="hidden" name="original_line_id" value={line.id} />
        <label htmlFor={`replacement-price-${index}`}>{line.description} — unit price (£)</label>
        <p className="field-help" id={`replacement-price-help-${index}`}>
          {line.quantity} units · {line.taxRateBasisPoints / 100}% VAT · price {line.priceMode === "tax_inclusive" ? "includes" : "excludes"} VAT.
          Original unit price £{minorToPounds(line.unitAmountMinor)}.
        </p>
        <input id={`replacement-price-${index}`} name="unit_price" inputMode="decimal" required
          pattern="(0|[1-9][0-9]*)(\.[0-9]{1,2})?" maxLength={20} value={prices[index]}
          aria-describedby={`replacement-price-help-${index}`} onChange={(event) => {
            const value = event.target.value; setPrices((current) => current.map((price, i) => i === index ? value : price));
          }} />
      </div>)}
      <div aria-live="polite" className="editor-notice">
        <p>Full reversal credit: −£{minorToPounds(originalGrossMinor)}</p>
        {totals ? <p>New invoice: £{minorToPounds(totals.net_minor)} net + £{minorToPounds(totals.tax_minor)} VAT = <strong>£{minorToPounds(totals.gross_minor)}</strong></p>
          : <p>Enter valid pound amounts with at most two decimal places.</p>}
      </div>
      <input type="hidden" name="expected_net_minor" value={totals?.net_minor ?? ""} />
      <input type="hidden" name="expected_tax_minor" value={totals?.tax_minor ?? ""} />
      <input type="hidden" name="expected_gross_minor" value={totals?.gross_minor ?? ""} />
      <label htmlFor="replacement-reason">Reason for replacement</label>
      <textarea id="replacement-reason" name="reason" rows={3} maxLength={500} required />
      <label htmlFor="replacement-approval">Approval reference {approvalRequired ? null : <span>(optional)</span>}</label>
      <input id="replacement-approval" name="approval_reference" maxLength={250} required={approvalRequired} />
      <label className="command-confirmation"><input type="checkbox" name="confirm_replacement" value="issue" required />
        Confirm the reviewed credit and replacement invoice amounts
      </label>
      <button className="danger-button" type="submit" disabled={pending || !changed || !totals || totals.gross_minor === "0"}>
        {pending ? "Issuing replacement…" : "Issue replacement invoice"}
      </button>
      <ActionMessage state={state} />
    </form>
  </section>;
}
