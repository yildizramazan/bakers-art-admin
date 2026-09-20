import type { Metadata } from "next";
import Link from "next/link";
import { localISODate, nextCalendarDate, zonedStartOfDayISO } from "@/domain/dates";
import { parseReturnReviews } from "@/domain/return-reviews";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

interface Metric {
  readonly label: string;
  readonly value: number | bigint;
  readonly href: string;
  readonly detail: string;
}

type CountFilter =
  | Readonly<{ column: string; operator?: "eq"; value: string | number | boolean }>
  | Readonly<{ column: string; operator: "neq" | "gte" | "lt"; value: string | number | boolean }>
  | Readonly<{ column: string; operator: "in"; values: readonly (string | number | boolean)[] }>;

async function organizationCount(table: string, organizationID: string, filters: readonly CountFilter[] = []): Promise<number> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("organization_id", organizationID);
  for (const filter of filters) {
    if (filter.operator === "in") query = query.in(filter.column, [...filter.values]);
    else if (filter.operator === "neq") query = query.neq(filter.column, filter.value);
    else if (filter.operator === "gte") query = query.gte(filter.column, filter.value);
    else if (filter.operator === "lt") query = query.lt(filter.column, filter.value);
    else query = query.eq(filter.column, filter.value);
  }
  const { count, error } = await query;
  if (error) throw new Error(`The ${table} dashboard metric could not be loaded.`);
  return count ?? 0;
}

export default async function DashboardPage() {
  const identity = await requireOfficeIdentity();
  const today = localISODate(new Date(), identity.timezoneName);
  const todayStart = zonedStartOfDayISO(today, identity.timezoneName);
  const tomorrowStart = zonedStartOfDayISO(nextCalendarDate(today), identity.timezoneName);
  const recordedToday: readonly CountFilter[] = [
    { column: "recorded_at_server", operator: "gte", value: todayStart },
    { column: "recorded_at_server", operator: "lt", value: tomorrowStart },
  ];
  let metrics: readonly Metric[];
  if (identity.role === "owner_admin") {
    const [routesToday, routesInProgress, routesComplete, skippedOrFailedStops, awaitingFinalization, pendingPayments, cashDifferences, syncExceptions] = await Promise.all([
      organizationCount("routes", identity.organizationID, [{ column: "service_date", value: today }]),
      organizationCount("routes", identity.organizationID, [{ column: "service_date", value: today }, { column: "status", value: "in_progress" }]),
      organizationCount("routes", identity.organizationID, [{ column: "service_date", value: today }, { column: "status", value: "completed" }]),
      organizationCount("route_stops", identity.organizationID, [{ column: "status", operator: "in", values: ["skipped", "failed"] }, { column: "updated_at", operator: "gte", value: todayStart }, { column: "updated_at", operator: "lt", value: tomorrowStart }]),
      organizationCount("deliveries", identity.organizationID, [{ column: "acceptance_state", value: "accepted" }, { column: "lifecycle_state", value: "completed" }, { column: "finalization_state", value: "not_requested" }]),
      organizationCount("payments", identity.organizationID, [{ column: "acceptance_state", value: "verified" }, { column: "current_status", value: "pending" }]),
      organizationCount("cash_declarations", identity.organizationID, [...recordedToday, { column: "discrepancy_minor", operator: "neq", value: 0 }]),
      organizationCount("sync_exceptions", identity.organizationID, [{ column: "state", value: "open" }]),
    ]);
    metrics = [
      { label: "Today’s routes", value: routesToday, href: "/office/routes", detail: "Published and draft work" },
      { label: "Routes in progress", value: routesInProgress, href: "/office/routes", detail: "Current route state, not online presence" },
      { label: "Completed routes", value: routesComplete, href: "/office/routes", detail: "Completed today" },
      { label: "Skipped or failed stops", value: skippedOrFailedStops, href: "/office/routes", detail: "Stop exceptions recorded today" },
      { label: "Awaiting invoicing", value: awaitingFinalization, href: "/office/deliveries", detail: "Accepted delivery facts" },
      { label: "Pending payments", value: pendingPayments, href: "/office/payments", detail: "Verified evidence not treated as paid" },
      { label: "Cash discrepancy entries", value: cashDifferences, href: "/office/cash-reconciliation", detail: "Non-zero declarations recorded today" },
      { label: "Open sync exceptions", value: syncExceptions, href: "/office/audit", detail: "Needs office review" },
    ];
  } else {
    const [awaitingFinalization, invoicesToday, creditNotesToday, pendingPayments, cashDeclarations, cashDifferences] = await Promise.all([
      organizationCount("deliveries", identity.organizationID, [{ column: "acceptance_state", value: "accepted" }, { column: "lifecycle_state", value: "completed" }, { column: "finalization_state", value: "not_requested" }]),
      organizationCount("financial_documents", identity.organizationID, [{ column: "kind", value: "invoice" }, { column: "issue_date", value: today }]),
      organizationCount("financial_documents", identity.organizationID, [{ column: "kind", value: "credit_note" }, { column: "issue_date", value: today }]),
      organizationCount("payments", identity.organizationID, [{ column: "acceptance_state", value: "verified" }, { column: "current_status", value: "pending" }]),
      organizationCount("cash_declarations", identity.organizationID, recordedToday),
      organizationCount("cash_declarations", identity.organizationID, [...recordedToday, { column: "discrepancy_minor", operator: "neq", value: 0 }]),
    ]);
    metrics = [
      { label: "Awaiting invoicing", value: awaitingFinalization, href: "/office/deliveries", detail: "Accepted delivery facts" },
      { label: "Invoices issued today", value: invoicesToday, href: "/office/invoices", detail: "Immutable official records" },
      { label: "Credit notes today", value: creditNotesToday, href: "/office/credit-notes", detail: "Immutable correction records" },
      { label: "Pending payments", value: pendingPayments, href: "/office/payments", detail: "Verified evidence not treated as paid" },
      { label: "Cash declarations today", value: cashDeclarations, href: "/office/cash-reconciliation", detail: "Recorded declaration revisions" },
      { label: "Cash discrepancy entries", value: cashDifferences, href: "/office/cash-reconciliation", detail: "Non-zero declarations recorded today" },
    ];
  }

  const supabase = await createSupabaseServerClient();
  const { data: reviewData, error: reviewError } = await supabase.rpc("get_office_return_reviews", {
    p_organization_id: identity.organizationID, p_limit: 1, p_offset: 0, p_include_resolved: false,
  });
  const reviews = reviewError ? undefined : parseReturnReviews(reviewData);
  if (!reviews) throw new Error("The return review dashboard metric could not be loaded.");
  metrics = [...metrics, { label: "Return credits awaiting review", value: BigInt(reviews.total),
    href: "/office/return-reviews", detail: "Collected goods with an original invoice credit conflict" }];

  return (
    <div className="office-page">
      <div className="page-heading"><div><p className="eyebrow">{identity.role === "owner_admin" ? "Operational overview" : "Financial overview"} · {today}</p><h1>Good day, {identity.displayName.split(" ")[0]}.</h1><p>Follow current organization facts and the exceptions that need a decision.</p></div><Link className="primary-link" href={identity.role === "owner_admin" ? "/office/routes" : "/office/reports"}>{identity.role === "owner_admin" ? "Open routes" : "Open reports"}</Link></div>
      <section aria-labelledby="overview-title"><h2 id="overview-title">Today at a glance</h2><div className="metric-grid">{metrics.map((metric) => <Link href={metric.href} className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value.toLocaleString("en-GB")}</strong><small>{metric.detail}</small></Link>)}</div></section>
      <section className="attention-panel" aria-labelledby="attention-title"><div><p className="eyebrow">Review queue</p><h2 id="attention-title">Items needing attention</h2></div><p>Review deliveries awaiting synchronization, financial checks and cash differences in the relevant section.</p></section>
    </div>
  );
}
