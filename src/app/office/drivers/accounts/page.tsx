import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AccountForm, type PendingAccount } from "./account-form";

export const metadata = { title: "Create employee account" };

export default async function AccountsPage() {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") notFound();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_user_provisions", { p_organization_id: identity.organizationID });
  if (error || !Array.isArray(data)) throw new Error("Unfinished account setups could not be loaded.");
  const pending = data as PendingAccount[];
  return <div className="office-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/office/drivers">Drivers / Users</Link><span> / Create account</span></nav>
    <div className="page-heading"><div><p className="eyebrow">{identity.organizationName}</p><h1>Create employee account</h1><p>Give each person their own login. Drivers and accountants start with their standard role permissions; additional permissions can be granted from their employee record.</p></div></div>
    <AccountForm />
    {pending.length ? <section className="related-section"><h2>Awaiting account setup</h2><div className="account-pending-list">{pending.map((account) => <AccountForm key={account.request_id} account={account} />)}</div></section> : null}
  </div>;
}
