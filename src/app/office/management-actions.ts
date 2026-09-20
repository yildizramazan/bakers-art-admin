"use server";

import { revalidatePath } from "next/cache";
import {
  isFinancialFinalizationResult,
  isOfficeCommandResult,
  validateDeliveryFinalizationInput,
  validateEntityActiveInput,
  validateFinancialCorrectionInput,
  validatePaymentStatusInput,
} from "@/domain/office-commands";
import { canIssueFinancialCorrection } from "@/lib/office/capabilities";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isInvoiceReplacementResult, parseInvoiceReplacement } from "@/domain/invoice-replacement";

export interface OfficeCommandActionState {
  readonly outcome?: "success" | "error";
  readonly message?: string;
  readonly reference?: string;
  readonly invoiceID?: string;
  readonly invoiceNumber?: string;
  readonly creditNoteID?: string;
  readonly creditNoteNumber?: string;
}

const invalidMessage = "The request was not valid. Refresh the record and try again.";
const unavailableMessage = "The command result could not be confirmed. Retry these same details to confirm it safely.";

function failure(reference?: string): OfficeCommandActionState {
  return reference
    ? { outcome: "error", message: unavailableMessage, reference }
    : { outcome: "error", message: invalidMessage };
}

function success(message: string, reference: string): OfficeCommandActionState {
  return { outcome: "success", message, reference };
}

function revalidateRecord(section: string, recordID: string): void {
  revalidatePath(`/office/${section}`);
  revalidatePath(`/office/${section}/${recordID}`);
}

export async function setEntityActive(
  _previousState: OfficeCommandActionState,
  formData: FormData,
): Promise<OfficeCommandActionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return failure();
  const input = validateEntityActiveInput(formData);
  if (!input.ok) return failure();

  const supabase = await createSupabaseServerClient();
  // The RPC checks current authority, then replays an exact receipt before
  // inspecting mutable target state. A read here would reject lost-response retries.
  const { data, error } = await supabase.rpc("admin_set_entity_active", {
    p_organization_id: identity.organizationID,
    p_request_id: input.requestID,
    p_entity_type: input.entityType,
    p_entity_id: input.entityID,
    p_is_active: input.isActive,
    p_reason: input.reason,
  });
  if (error || !isOfficeCommandResult(data, "admin.entity.set_active", input.requestID)) return failure(input.requestID);

  const section = input.entityType === "product" ? "products" : input.entityType === "customer_account" ? "customers" : "shops";
  revalidateRecord(section, input.entityID);
  revalidatePath("/office");
  revalidatePath("/office/audit");
  return success(`${input.isActive ? "Activation" : "Deactivation"} was recorded.`, input.requestID);
}

export async function finalizeOfficeDelivery(
  _previousState: OfficeCommandActionState,
  formData: FormData,
): Promise<OfficeCommandActionState> {
  const identity = await requireOfficeIdentity();
  const input = validateDeliveryFinalizationInput(formData);
  if (!input.ok) return failure();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("finalize_office_delivery", {
    p_organization_id: identity.organizationID,
    p_delivery_id: input.deliveryID,
    p_request_id: input.requestID,
  });
  if (error || !isFinancialFinalizationResult(data, { deliveryID: input.deliveryID, documentKind: "invoice" })) return failure(input.requestID);

  revalidateRecord("deliveries", input.deliveryID);
  revalidatePath("/office/invoices");
  revalidatePath("/office/audit");
  revalidatePath("/office");
  return success("The authoritative invoice was issued and its PDF was queued.", input.requestID);
}

export async function updatePaymentStatus(
  _previousState: OfficeCommandActionState,
  formData: FormData,
): Promise<OfficeCommandActionState> {
  const identity = await requireOfficeIdentity();
  const input = validatePaymentStatusInput(formData);
  if (!input.ok) return failure();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_update_payment_status", {
    p_organization_id: identity.organizationID,
    p_request_id: input.requestID,
    p_payment_id: input.paymentID,
    p_new_status: input.newStatus,
    p_evidence_reference: input.evidenceReference,
    p_reason: input.reason,
  });
  if (error || !isOfficeCommandResult(data, "financial.payment.set_status", input.requestID)) return failure(input.requestID);

  revalidateRecord("payments", input.paymentID);
  revalidatePath("/office/audit");
  revalidatePath("/office");
  return success("The payment status and append-only evidence history were updated.", input.requestID);
}

export async function issueFinancialCorrection(
  _previousState: OfficeCommandActionState,
  formData: FormData,
): Promise<OfficeCommandActionState> {
  const identity = await requireOfficeIdentity();
  const input = validateFinancialCorrectionInput(formData);
  if (!input.ok) return failure();

  const supabase = await createSupabaseServerClient();
  if (identity.role === "accountant" && !input.approvalReference) return failure(input.requestID);
  if (!(await canIssueFinancialCorrection(identity, supabase))) return failure(input.requestID);

  const original = await supabase
    .from("financial_documents")
    .select("id,kind,source_delivery_id,source_correction_id,issued_at")
    .eq("organization_id", identity.organizationID)
    .eq("id", input.originalFinancialDocumentID)
    .eq("kind", "invoice")
    .maybeSingle();
  if (
    original.error
    || !original.data
    || typeof original.data.issued_at !== "string"
  ) return failure(input.requestID);
  let sourceDeliveryID = original.data.source_delivery_id;
  if (!sourceDeliveryID && original.data.source_correction_id) {
    const source = await supabase.from("corrections").select("original_delivery_id")
      .eq("organization_id", identity.organizationID).eq("id", original.data.source_correction_id).maybeSingle();
    if (source.error) return failure(input.requestID);
    sourceDeliveryID = source.data?.original_delivery_id;
  }
  if (sourceDeliveryID !== input.originalDeliveryID) return failure(input.requestID);

  if (input.replacementDeliveryID) {
    const replacement = await supabase
      .from("deliveries")
      .select("id,replacement_for_delivery_id,lifecycle_state,acceptance_state")
      .eq("organization_id", identity.organizationID)
      .eq("id", input.replacementDeliveryID)
      .eq("replacement_for_delivery_id", input.originalDeliveryID)
      .eq("lifecycle_state", "completed")
      .eq("acceptance_state", "accepted")
      .maybeSingle();
    if (replacement.error || !replacement.data) return failure(input.requestID);
  }

  const { data, error } = await supabase.rpc("admin_issue_financial_correction", {
    p_organization_id: identity.organizationID,
    p_request_id: input.requestID,
    p_correction_id: input.correctionID,
    p_original_delivery_id: input.originalDeliveryID,
    p_original_financial_document_id: input.originalFinancialDocumentID,
    p_replacement_delivery_id: input.replacementDeliveryID,
    p_kind: input.kind,
    p_net_delta_minor: input.netDeltaMinor,
    p_tax_delta_minor: input.taxDeltaMinor,
    p_gross_delta_minor: input.grossDeltaMinor,
    p_reason: input.reason,
    p_approval_reference: input.approvalReference,
  });
  if (error || !isFinancialFinalizationResult(data, { correctionID: input.correctionID, documentKind: "credit_note" })) return failure(input.requestID);

  revalidateRecord("invoices", input.originalFinancialDocumentID);
  revalidatePath("/office/credit-notes");
  revalidatePath("/office/deliveries");
  revalidatePath("/office/audit");
  revalidatePath("/office");
  return success("The correction and sealed credit note were issued; its PDF was queued.", input.requestID);
}

export async function replaceOfficeInvoice(
  _previousState: OfficeCommandActionState,
  formData: FormData,
): Promise<OfficeCommandActionState> {
  const identity = await requireOfficeIdentity();
  const input = parseInvoiceReplacement(formData);
  if (!input) return failure();
  const supabase = await createSupabaseServerClient();
  if (!(await canIssueFinancialCorrection(identity, supabase))
    || (identity.role === "accountant" && !input.approvalReference)) return failure(input.requestID);
  const { data, error } = await supabase.rpc("admin_replace_invoice", {
    p_organization_id: identity.organizationID, p_request_id: input.requestID,
    p_correction_id: input.correctionID, p_original_invoice_id: input.invoiceID,
    p_unit_prices: input.unitPrices, p_expected_totals: input.expectedTotals,
    p_reason: input.reason, p_approval_reference: input.approvalReference,
  });
  if (error || !isInvoiceReplacementResult(data, input.requestID, input.correctionID, input.invoiceID)) {
    if (error?.code === "23514") return { outcome: "error", reference: input.requestID,
      message: "This invoice is no longer eligible for the reviewed replacement. Refresh it and check payments, credits and returned goods before trying again." };
    return failure(input.requestID);
  }
  revalidateRecord("invoices", input.invoiceID);
  revalidatePath("/office/invoices"); revalidatePath("/office/credit-notes");
  revalidatePath("/office/reports"); revalidatePath("/office/audit");
  return { ...success("The reversal credit note and replacement invoice were issued. Both PDFs are being prepared.", input.requestID),
    invoiceID: data.invoice.financial_document_id, invoiceNumber: data.invoice.issued_number,
    creditNoteID: data.credit_note.financial_document_id, creditNoteNumber: data.credit_note.issued_number };
}
