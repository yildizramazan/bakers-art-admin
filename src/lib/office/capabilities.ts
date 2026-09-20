import "server-only";

import type { OfficeIdentity } from "@/domain/office";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

export async function canIssueFinancialCorrection(
  identity: OfficeIdentity,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<boolean> {
  if (identity.role === "owner_admin") return true;
  const membership = await supabase
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", identity.organizationID)
    .eq("user_id", identity.userID)
    .eq("role", "accountant")
    .eq("status", "active")
    .maybeSingle();
  if (membership.error || !membership.data) return false;
  const capability = await supabase
    .from("membership_capabilities")
    .select("id")
    .eq("organization_id", identity.organizationID)
    .eq("membership_id", membership.data.id)
    .eq("capability", "financial_correction")
    .eq("enabled", true)
    .maybeSingle();
  return !capability.error && capability.data !== null;
}
