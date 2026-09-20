"use server";

import { revalidatePath } from "next/cache";
import { isExactManagementResult } from "@/domain/admin-management";
import { driverDownloadFailure, parseDriverDownload } from "@/domain/driver-download";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OperationalActionState } from "@/app/office/operational-actions";

export async function prepareDriverDownload(_state: OperationalActionState, form: FormData): Promise<OperationalActionState> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") return { outcome: "error", message: driverDownloadFailure("42501") };
  const input = parseDriverDownload(form);
  if (!input) return { outcome: "error", message: "Choose a registered phone, add a reason and confirm the route is ready." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_prepare_driver_download", {
    p_organization_id: identity.organizationID, p_request_id: input.requestID,
    p_route_id: input.routeID, p_expected_route_version: input.expectedVersion,
    p_device_id: input.deviceID, p_work_package_id: input.packageID, p_reason: input.reason,
  });
  if (error || !isExactManagementResult(data, { command: "admin.driver_download", requestID: input.requestID,
    entityType: "work_package", entityID: input.packageID, action: "prepare" })) {
    return { outcome: "error", message: driverDownloadFailure(error?.code, error?.message), reference: input.requestID };
  }
  revalidatePath(`/office/routes/${input.routeID}`);
  revalidatePath("/office/loads");
  revalidatePath("/office/audit");
  revalidatePath("/office");
  return { outcome: "success", message: "Download prepared. The driver can now sync on the selected phone, check Ready offline, and confirm the load.",
    reference: input.requestID, entityID: input.packageID };
}
