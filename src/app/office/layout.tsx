import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/login/actions";
import { OfficeNavigation, type OfficeNavigationItem } from "@/components/office-navigation";
import { officeSections } from "@/domain/office";
import { selectOfficeOrganization } from "@/lib/office/actions";
import { availableOfficeOrganizations, requireOfficeIdentity } from "@/lib/office/identity";

export const dynamic = "force-dynamic";

export default async function OfficeLayout({ children }: Readonly<{ children: ReactNode }>) {
  const identity = await requireOfficeIdentity();
  const organizations = await availableOfficeOrganizations();
  const sections = officeSections.filter((section) => section.roles.includes(identity.role));
  const navigation: readonly OfficeNavigationItem[] = [
    { href: "/office", label: "Dashboard" },
    ...sections.map((section) => ({ href: `/office/${section.slug}`, label: section.title })),
    { href: "/office/return-reviews", label: "Return reviews" },
    { href: "/office/reports", label: "Reports & CSV" },
  ];

  return (
    <div className="office-shell">
      <aside className="office-sidebar" aria-label="Office navigation">
        <Link className="office-brand" href="/office"><span className="brand-mark" aria-hidden="true">W</span><span>Wholesale<br /><strong>Office</strong></span></Link>
        <OfficeNavigation items={navigation} />
      </aside>
      <div className="office-workspace">
        <header className="office-header">
          <div>
            {organizations.length > 1 ? (
              <form action={selectOfficeOrganization} className="organization-switcher">
                <label htmlFor="office-organization">Organization</label>
                <select id="office-organization" name="organization" defaultValue={identity.organizationID}>
                  {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                </select>
                <button type="submit">Switch</button>
              </form>
            ) : <strong>{identity.organizationName}</strong>}
            <span>{identity.displayName} · {identity.employeeID}</span>
          </div>
          <div className="header-actions"><span className="role-chip">{identity.role === "owner_admin" ? "Owner / Admin" : "Accountant"}</span><form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form></div>
        </header>
        <main id="main-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
