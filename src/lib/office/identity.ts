import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { OfficeIdentity, OfficeOrganizationChoice, OfficeRole } from "@/domain/office";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface MembershipRow {
  readonly organization_id: string;
  readonly role: string;
  readonly status: string;
}

function isOfficeRole(value: string): value is OfficeRole {
  return value === "owner_admin" || value === "accountant";
}

const activeOfficeMemberships = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data: authentication, error: authenticationError } = await supabase.auth.getUser();
  if (authenticationError || !authentication.user) redirect("/login");
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("organization_id,role,status")
    .eq("user_id", authentication.user.id)
    .eq("status", "active")
    .order("organization_id");
  if (error) throw new Error("Authorized office memberships could not be loaded.");
  const memberships = ((data ?? []) as readonly MembershipRow[]).filter((row) => isOfficeRole(row.role));
  if (memberships.length === 0) redirect("/access-denied");
  return { supabase, user: authentication.user, memberships };
});

export const requireOfficeIdentity = cache(async (): Promise<OfficeIdentity> => {
  const { supabase, user, memberships: eligible } = await activeOfficeMemberships();

  const cookieStore = await cookies();
  const requestedOrganization = cookieStore.get("office_organization")?.value;
  const membership =
    eligible.find((row) => row.organization_id === requestedOrganization) ?? eligible[0];
  if (!membership || !isOfficeRole(membership.role)) redirect("/access-denied");

  const [profileResult, organizationResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name,employee_id,is_active")
      .eq("organization_id", membership.organization_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single(),
    supabase
      .from("organizations")
      .select("legal_name,trading_name,timezone_name,is_active")
      .eq("id", membership.organization_id)
      .eq("is_active", true)
      .single(),
  ]);
  if (profileResult.error || organizationResult.error) {
    throw new Error("The selected office identity is not active.");
  }

  return Object.freeze({
    userID: user.id,
    organizationID: membership.organization_id,
    organizationName:
      organizationResult.data.trading_name ?? organizationResult.data.legal_name,
    displayName: profileResult.data.display_name,
    employeeID: profileResult.data.employee_id,
    role: membership.role,
    timezoneName: organizationResult.data.timezone_name,
  });
});

export const availableOfficeOrganizations = cache(async (): Promise<readonly OfficeOrganizationChoice[]> => {
  const { supabase, memberships } = await activeOfficeMemberships();
  const ids = memberships.map((membership) => membership.organization_id);
  const { data, error } = await supabase
    .from("organizations")
    .select("id,legal_name,trading_name,is_active")
    .in("id", ids)
    .eq("is_active", true)
    .order("legal_name");
  if (error) throw new Error("Available organizations could not be loaded.");
  const organizations = (data ?? []) as readonly {
    readonly id: string;
    readonly legal_name: string;
    readonly trading_name: string | null;
    readonly is_active: boolean;
  }[];
  return organizations.flatMap((organization) => {
    const membership = memberships.find((candidate) => candidate.organization_id === organization.id);
    if (!membership || !isOfficeRole(membership.role)) return [];
    return [{ id: organization.id, name: organization.trading_name ?? organization.legal_name, role: membership.role }];
  });
});
