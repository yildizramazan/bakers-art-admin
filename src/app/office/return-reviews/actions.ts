"use server";
import { revalidatePath } from "next/cache";
import { isReturnReviewResult, parseReturnReviewDecision, returnReviewFailure } from "@/domain/return-reviews";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OperationalActionState } from "@/app/office/operational-actions";

export async function resolveReturnReview(_state: OperationalActionState, form: FormData): Promise<OperationalActionState> {
  const identity = await requireOfficeIdentity();
  const input = parseReturnReviewDecision(form, identity.role === "accountant");
  if (!input) return { outcome: "error", message: "Choose a decision, record the reason and required approval, and confirm the credit." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_resolve_original_sale_review", {
    p_organization_id: identity.organizationID, p_request_id: input.requestID, p_exception_id: input.exceptionID,
    p_expected_version: input.version, p_decision: input.decision, p_reason: input.reason, p_approval_reference: input.approval,
  });
  if (error || !isReturnReviewResult(data, input)) return { outcome: "error", message: returnReviewFailure(error?.code), reference: input.requestID };
  for (const path of ["/office/return-reviews", "/office", "/office/deliveries", "/office/invoices", "/office/credit-notes", "/office/payments", "/office/audit", "/office/reports"]) revalidatePath(path);
  return { outcome: "success", message: "Credit approved and the official document issued. The driver's next sync will receive the decision.", reference: input.requestID };
}
