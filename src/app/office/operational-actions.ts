"use server";

import { revalidatePath } from "next/cache";
import {
  isExactManagementResult,
  parseMasterDataCommand,
  parseMembershipCommand,
  parseOrderRevisionCommand,
  parseOrganizationCommand,
  parsePolicyRevisionCommand,
  parseRouteCommand,
  parseRouteCopy,
  parseRouteStopCommand,
  parseShiftLoadCommand,
  type ManagementCommandInput,
} from "@/domain/admin-management";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface OperationalActionState {
  readonly outcome?: "success" | "error";
  readonly message?: string;
  readonly reference?: string;
  readonly entityID?: string;
}

const invalidMessage = "Check the required fields, dates, quantities and confirmation, then try again.";
const unavailableMessage = "The save result could not be confirmed. Retry these same details to confirm it safely.";

function failure(reference?: string, code?: string): OperationalActionState {
  const messages: Readonly<Record<string, string>> = {
    "40001": "This record changed since you opened it. Open the record again and review the latest details before saving.",
    "23505": "A record with that code, barcode or assignment already exists. Use a unique value or edit the existing record.",
    "23P01": "These effective dates overlap a published revision. Schedule its end date before publishing this replacement.",
    "23503": "A selected record is unavailable or belongs to a different customer or driver. Review your selections.",
    "23514": "This action does not match the record's current state or business rules. Review the dates, assignment and saved details.",
    "22023": "Check the dates and field values. Scheduled policy end dates must be tomorrow or later.",
    "42501": "Your current account cannot make this change.",
    "55000": "Check the route's planned orders. An active published route locks its assigned plan; new assignments require a published plan for the same date.",
    "40P01": "Another operation changed this assignment at the same time. Retry these same details safely.",
  };
  return reference ? { outcome: "error", message: (code ? messages[code] : undefined) ?? unavailableMessage, reference } : { outcome: "error", message: invalidMessage };
}

function success(message: string, input: ManagementCommandInput): OperationalActionState {
  return { outcome: "success", message, reference: input.requestID, entityID: input.entityID };
}

// The RPC locks and authorizes the actor and target, checks the expected version,
// and returns exact-input receipts before checking the target's current state.
// A separate preflight here would reject a successful command's lost-response retry.
function revalidate(section: string, entityID: string): void {
  revalidatePath(`/office/${section}`);
  revalidatePath(`/office/${section}/${entityID}`);
  revalidatePath("/office");
  revalidatePath("/office/audit");
}

const masterTargets = {
  product: { table: "products", section: "products" },
  product_barcode: { table: "product_barcodes", section: "barcodes" },
  customer_account: { table: "customer_accounts", section: "customers" },
  shop_location: { table: "shop_locations", section: "shops" },
  tax_rule: { table: "tax_rules", section: "tax" },
  price_rule: { table: "price_rules", section: "pricing" },
} as const;

export async function saveMasterData(_state: OperationalActionState, formData: FormData): Promise<OperationalActionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return failure();
  const input = parseMasterDataCommand(formData);
  if (!input) return failure();
  const target = masterTargets[input.type as keyof typeof masterTargets];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_save_master_data", {
    p_organization_id: identity.organizationID,
    p_request_id: input.requestID,
    p_entity_type: input.type,
    p_entity_id: input.entityID,
    p_expected_version: input.expectedVersion,
    p_payload: input.payload,
  });
  if (error || !isExactManagementResult(data, { command: `admin.master_data.${input.type}`, requestID: input.requestID, entityType: input.type, entityID: input.entityID, action: input.action })) return failure(input.requestID, error?.code);
  revalidate(target.section, input.entityID);
  return success(`${input.action === "create" ? "Created" : "Updated"} ${input.type.replaceAll("_", " ")} ${input.entityID}.`, input);
}

const policyTargets = {
  organization_settings: { table: "organization_settings_revisions", section: "settings" },
  tax_rule: { table: "tax_rule_revisions", section: "tax" },
  price_rule: { table: "price_rule_revisions", section: "pricing" },
} as const;

export async function managePolicyRevision(_state: OperationalActionState, formData: FormData): Promise<OperationalActionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return failure();
  const input = parsePolicyRevisionCommand(formData);
  if (!input) return failure();
  const target = policyTargets[input.type as keyof typeof policyTargets];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(input.action === "retire" ? "admin_retire_policy_revision" : "admin_manage_policy_revision", {
    p_organization_id: identity.organizationID,
    p_request_id: input.requestID,
    p_revision_type: input.type,
    p_revision_id: input.entityID,
    p_expected_version: input.expectedVersion,
    ...(input.action === "retire" ? {} : { p_action: input.action }),
    p_payload: input.payload,
  });
  const entityType = `${input.type}_revision`;
  if (error || !isExactManagementResult(data, { command: `admin.policy_revision.${input.type}`, requestID: input.requestID, entityType, entityID: input.entityID, action: input.action })) return failure(input.requestID, error?.code);
  revalidate(target.section, input.entityID);
  return success(`${input.type.replaceAll("_", " ")} revision ${input.action} completed for ${input.entityID}.`, input);
}

export async function manageOrderRevision(_state: OperationalActionState, formData: FormData): Promise<OperationalActionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return failure();
  const input = parseOrderRevisionCommand(formData);
  if (!input) return failure();
  const section = input.type === "standing_order" ? "standing-orders" : "daily-orders";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_manage_order_revision", {
    p_organization_id: identity.organizationID,
    p_request_id: input.requestID,
    p_order_type: input.type,
    p_order_id: input.entityID,
    p_expected_version: input.expectedVersion,
    p_action: input.action,
    p_payload: input.payload,
  });
  const entityType = `${input.type}_revision`;
  if (error || !isExactManagementResult(data, { command: `admin.order_revision.${input.type}`, requestID: input.requestID, entityType, entityID: input.entityID, action: input.action })) return failure(input.requestID, error?.code);
  revalidate(section, input.entityID);
  return success(`${input.type.replaceAll("_", " ")} ${input.action} completed for ${input.entityID}.`, input);
}

export async function manageRoute(_state: OperationalActionState, formData: FormData): Promise<OperationalActionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return failure();
  const input = parseRouteCommand(formData);
  if (!input) return failure();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_manage_route", {
    p_organization_id: identity.organizationID,
    p_request_id: input.requestID,
    p_route_id: input.entityID,
    p_expected_version: input.expectedVersion,
    p_action: input.action,
    p_payload: input.payload,
  });
  if (error || !isExactManagementResult(data, { command: "admin.route", requestID: input.requestID, entityType: "route", entityID: input.entityID, action: input.action })) return failure(input.requestID, error?.code);
  revalidate("routes", input.entityID);
  return success(`Route ${input.action} completed for ${input.entityID}.`, input);
}

export async function manageRouteStop(_state: OperationalActionState, formData: FormData): Promise<OperationalActionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return failure();
  const input = parseRouteStopCommand(formData);
  if (!input) return failure();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_manage_route_stop", {
    p_organization_id: identity.organizationID,
    p_request_id: input.requestID,
    p_route_id: input.entityID,
    p_expected_route_version: input.expectedVersion,
    p_action: input.action,
    p_payload: input.payload,
  });
  if (error || !isExactManagementResult(data, { command: "admin.route_stop", requestID: input.requestID, entityType: "route", entityID: input.entityID, action: input.action })) return failure(input.requestID, error?.code);
  revalidate("routes", input.entityID);
  return success(`Route-stop ${input.action} completed for route ${input.entityID}.`, input);
}

export async function copyRoute(_state: OperationalActionState, formData: FormData): Promise<OperationalActionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return failure();
  const input = parseRouteCopy(formData);
  if (!input) return { outcome: "error", message: "Choose a planned shift and enter a reason for this copy." };
  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("admin_copy_route", {
    p_organization_id: identity.organizationID, p_request_id: input.requestID,
    p_source_route_id: input.sourceRouteID, p_expected_source_version: input.expectedSourceVersion,
    p_route_id: input.routeID, p_shift_id: input.shiftID, p_reason: input.reason,
  });
  if (error || !isExactManagementResult(data, { command: "admin.route.copy", requestID: input.requestID,
    entityType: "route", entityID: input.routeID, action: "copy" })) {
    if (error?.code === "23514") return { outcome: "error", reference: input.requestID,
      message: "Choose a different planned shift with an active driver. Every source shop and customer must still be active, and the route must have 1–500 stops." };
    if (error?.code === "23505") return { outcome: "error", reference: input.requestID,
      message: "The selected shift already has a route. Choose another planned shift." };
    return failure(input.requestID, error?.code);
  }
  revalidate("routes", input.routeID);
  revalidatePath(`/office/routes/${input.sourceRouteID}/copy`);
  return { outcome: "success", message: "Draft route created. Review its stops and attach the new day's orders before publishing.",
    reference: input.requestID, entityID: input.routeID };
}

export async function manageShiftLoad(_state: OperationalActionState, formData: FormData): Promise<OperationalActionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return failure();
  const input = parseShiftLoadCommand(formData);
  if (!input) return failure();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_manage_shift_load", {
    p_organization_id: identity.organizationID,
    p_request_id: input.requestID,
    p_shift_id: input.entityID,
    p_expected_version: input.expectedVersion,
    p_action: input.action,
    p_payload: input.payload,
  });
  if (error || !isExactManagementResult(data, { command: "admin.shift_load", requestID: input.requestID, entityType: "shift", entityID: input.entityID, action: input.action })) return failure(input.requestID, error?.code);
  revalidate("loads", input.entityID);
  return success(`Shift/load ${input.action} completed for ${input.entityID}.`, input);
}

export async function manageMembership(_state: OperationalActionState, formData: FormData): Promise<OperationalActionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return failure();
  const input = parseMembershipCommand(formData);
  if (!input) return failure();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_manage_membership", {
    p_organization_id: identity.organizationID,
    p_request_id: input.requestID,
    p_membership_id: input.entityID,
    p_expected_version: input.expectedVersion,
    p_action: input.action,
    p_payload: input.payload,
  });
  if (error || !isExactManagementResult(data, { command: "admin.membership", requestID: input.requestID, entityType: "organization_membership", entityID: input.entityID, action: input.action })) return failure(input.requestID, error?.code);
  revalidate("drivers", String(input.payload["profile_id"]));
  return success(`Membership ${input.action} completed for pre-provisioned user ${String(input.payload["user_id"])}.`, input);
}

export async function saveOrganization(_state: OperationalActionState, formData: FormData): Promise<OperationalActionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return failure();
  const input = parseOrganizationCommand(formData);
  if (!input || input.entityID !== identity.organizationID) return failure();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_update_organization", {
    p_organization_id: identity.organizationID, p_request_id: input.requestID,
    p_expected_version: input.expectedVersion, p_payload: input.payload,
  });
  if (error || !isExactManagementResult(data, { command: "admin.organization", requestID: input.requestID, entityType: "organization", entityID: input.entityID, action: "update" })) return failure(input.requestID, error?.code);
  revalidate("settings", input.entityID);
  revalidatePath("/office", "layout");
  return success("Business details saved.", input);
}
