"use server";

import { revalidatePath } from "next/cache";
import { validateEnvironment } from "@/config/environment";
import { accountUUID, validProvisionResult, type AccountProvisionResult } from "@/domain/account-setup";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProvisionState { readonly message?: string; readonly result?: AccountProvisionResult }

export async function provisionAccount(_previous: ProvisionState, form: FormData): Promise<ProvisionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return { message: "Owner access is required." };
  const requestID = String(form.get("request_id") ?? "");
  const action = form.get("action");
  if (!accountUUID.test(requestID) || (action !== "create" && action !== "resume")) return { message: "The account request is invalid. Refresh and try again." };
  const payload = Object.fromEntries(["email", "display_name", "employee_id", "role", "reason"].map((key) => [key, String(form.get(key) ?? "").trim()]));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.functions.invoke("admin-provision-user", {
    body: { action, organization_id: identity.organizationID, request_id: requestID, ...(action === "create" ? { payload } : {}) },
  });
  if (error) {
    const detail = error.context instanceof Response ? await error.context.json().catch(() => null) : null;
    const messages: Record<string, string> = {
      email_or_employee_id_unavailable: "That email address or employee ID is already in use. Check existing users and unfinished account setups.",
      invalid_account_details: "Check the email, name, employee ID, role and reason. A previously submitted request must keep the same details.",
      owner_access_required: "Your owner access could not be confirmed. Sign in again.",
      account_setup_unavailable: "This account setup is unavailable. Check whether its access has been withdrawn.",
    };
    return { message: messages[String(detail?.error)] ?? "The result could not be confirmed. Retry these same details, or resume the account from this page after refreshing." };
  }
  if (!validProvisionResult(data, requestID, validateEnvironment(process.env).origin)) return { message: "The account was processed, but its setup link could not be verified. Resume this account after refreshing." };
  revalidatePath("/office/drivers");
  revalidatePath("/office/drivers/accounts");
  revalidatePath("/office/audit");
  return { result: data };
}
