"use server";

import { revalidatePath } from "next/cache";
import { validateDeviceProvisionInput, validateDeviceRevocationInput } from "@/domain/device-management";
import { isOfficeCommandResult } from "@/domain/office-commands";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface DeviceActionState {
  readonly outcome?: "success" | "error";
  readonly message?: string;
  readonly reference?: string;
}

const invalidMessage = "The request was not valid. Refresh the page and try again.";
const unavailableMessage = "The device change could not be confirmed. Refresh the current records before trying again.";

export async function provisionDriverDevice(
  _previousState: DeviceActionState,
  formData: FormData,
): Promise<DeviceActionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return { outcome: "error", message: invalidMessage };
  const input = validateDeviceProvisionInput(formData);
  if (!input.ok) return { outcome: "error", message: invalidMessage };

  const supabase = await createSupabaseServerClient();
  const target = await supabase
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", identity.organizationID)
    .eq("user_id", input.userID)
    .eq("role", "driver")
    .eq("status", "active")
    .maybeSingle();
  if (target.error || !target.data) return { outcome: "error", message: invalidMessage };

  const { error } = await supabase.rpc("provision_driver_device", {
    p_organization_id: identity.organizationID,
    p_user_id: input.userID,
    p_installation_id: input.installationID,
    p_display_name: input.displayName,
  });
  if (error) return { outcome: "error", message: unavailableMessage };
  revalidatePath("/office/drivers");
  revalidatePath("/office/drivers/[recordID]", "page");
  return { outcome: "success", message: "The driver device is provisioned." };
}

export async function revokeDriverDevice(
  _previousState: DeviceActionState,
  formData: FormData,
): Promise<DeviceActionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return { outcome: "error", message: invalidMessage };
  const input = validateDeviceRevocationInput(formData);
  if (!input.ok) return { outcome: "error", message: invalidMessage };

  const supabase = await createSupabaseServerClient();
  const target = await supabase
    .from("devices")
    .select("id,revoked_at")
    .eq("organization_id", identity.organizationID)
    .eq("id", input.deviceID)
    .maybeSingle();
  if (target.error || !target.data || target.data.revoked_at !== null) {
    return { outcome: "error", message: unavailableMessage, reference: input.requestID };
  }
  const { data, error } = await supabase.rpc("admin_revoke_device", {
    p_organization_id: identity.organizationID,
    p_request_id: input.requestID,
    p_device_id: input.deviceID,
    p_reason: input.reason,
  });
  if (error || !isOfficeCommandResult(data, "admin.device.revoke", input.requestID)) {
    return { outcome: "error", message: unavailableMessage, reference: input.requestID };
  }
  revalidatePath("/office/drivers");
  revalidatePath("/office/drivers/[recordID]", "page");
  revalidatePath("/office/audit");
  return { outcome: "success", message: "The driver device is revoked and cannot be reactivated.", reference: input.requestID };
}
