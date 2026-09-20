import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DriverDeviceManagement, type DriverDeviceRow } from "@/app/office/drivers/device-management";
import { DriverDownloadForm, type DownloadDevice } from "@/app/office/routes/download-form";
import {
  DeliveryFinalizationManagement,
  EntityActiveManagement,
  FinancialCorrectionManagement,
  InvoiceReplacementManagement,
  PaymentStatusManagement,
} from "@/app/office/record-management";
import { RecordTable } from "@/components/record-table";
import { detailRelationsForRole, type OfficeDetailRelation } from "@/domain/office-details";
import { isPaymentStatus, type ManagedEntityType } from "@/domain/office-commands";
import { officeSections, sectionForRole } from "@/domain/office";
import { editorForSection } from "@/domain/office-editors";
import { canReviseOrder } from "@/domain/order-templates";
import { displayValue, exactOfficeSelect, titleForColumn, type DisplayRow } from "@/domain/presentation";
import type { ReplacementLine } from "@/domain/invoice-replacement";
import { canIssueFinancialCorrection } from "@/lib/office/capabilities";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { withRecordLabels } from "@/lib/office/record-labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const canonicalUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface DetailRouteParams {
  readonly section: string;
  readonly recordID: string;
}

interface LoadedRelation {
  readonly definition: OfficeDetailRelation;
  readonly rows: readonly DisplayRow[];
}

const managedEntitiesBySection: Readonly<Record<string, ManagedEntityType | undefined>> = {
  products: "product",
  customers: "customer_account",
  shops: "shop_location",
};

export async function generateMetadata({ params }: Readonly<{ params: Promise<DetailRouteParams> }>): Promise<Metadata> {
  const { section: slug } = await params;
  const section = officeSections.find((candidate) => candidate.slug === slug);
  return { title: section ? `${section.title} details` : "Record unavailable" };
}

export default async function ResourceDetailPage({ params }: Readonly<{ params: Promise<DetailRouteParams> }>) {
  const identity = await requireOfficeIdentity();
  const { section: slug, recordID } = await params;
  const section = sectionForRole(slug, identity.role);
  if (!section || !canonicalUUID.test(recordID)) notFound();

  const relations = detailRelationsForRole(slug, identity.role);
  const detailColumns = section.detailColumns ?? section.columns;
  const parentColumns = relations.map((relation) => relation.parentColumn);
  const selectedColumns = [...new Set(["id", ...(slug === "routes" ? ["version"] : []),
    ...(slug === "invoices" ? ["source_correction_id", "document_snapshot"] : []), ...section.columns, ...detailColumns, ...parentColumns])];
  const supabase = await createSupabaseServerClient();
  let recordQuery = supabase.from(section.table).select(exactOfficeSelect(selectedColumns)).eq("id", recordID);
  recordQuery = section.table === "organizations"
    ? recordQuery.eq("id", identity.organizationID)
    : recordQuery.eq("organization_id", identity.organizationID);
  if (section.documentType) recordQuery = recordQuery.eq("kind", section.documentType);
  const { data, error } = await recordQuery.maybeSingle();
  if (error) throw new Error(`${section.title} details could not be loaded.`);
  if (!data) notFound();
  const record = (await withRecordLabels(supabase, identity, [data as unknown as DisplayRow], section.columns))[0]!;
  const editor = identity.role === "owner_admin" ? editorForSection(slug) : undefined;

  const loadedRelations: readonly LoadedRelation[] = await Promise.all(relations.map(async (relation) => {
    const parentValue = record[relation.parentColumn];
    if (typeof parentValue !== "string") return { definition: relation, rows: [] };
    let relationQuery = supabase
      .from(relation.table)
      .select(exactOfficeSelect(["id", ...relation.columns]))
      .eq("organization_id", identity.organizationID)
      .eq(relation.foreignColumn, parentValue)
      .order(relation.orderBy, { ascending: relation.ascending ?? false })
      .limit(100);
    if (relation.documentType) relationQuery = relationQuery.eq("kind", relation.documentType);
    const result = await relationQuery;
    if (result.error) throw new Error(`${relation.title} could not be loaded.`);
    return { definition: relation, rows: await withRecordLabels(supabase, identity, (result.data ?? []) as unknown as readonly DisplayRow[], relation.columns) };
  }));
  const membership = loadedRelations.find((relation) => relation.definition.slug === "membership")?.rows[0];
  const pendingOrderRevision = editor?.family === "order" ? loadedRelations.find((relation) => relation.definition.slug === "revisions")?.rows.find((row) => row["status"] === "draft" && row["id"] !== recordID) : undefined;
  const driverUserID = record["user_id"];
  const devices: readonly DriverDeviceRow[] = (loadedRelations.find((relation) => relation.definition.slug === "devices")?.rows ?? []).flatMap((row) => {
    if (typeof row["id"] !== "string" || typeof row["installation_id"] !== "string") return [];
    return [{
      id: row["id"],
      installationID: row["installation_id"],
      displayName: typeof row["display_name"] === "string" ? row["display_name"] : null,
      revokedAt: typeof row["revoked_at"] === "string" ? row["revoked_at"] : null,
      lastSuccessfulSyncAt: typeof row["last_successful_sync_at"] === "string" ? row["last_successful_sync_at"] : null,
    }];
  });
  const canManageDriverDevices = slug === "drivers"
    && identity.role === "owner_admin"
    && typeof driverUserID === "string"
    && membership?.["role"] === "driver"
    && membership["status"] === "active";
  const managedEntityType = managedEntitiesBySection[slug];
  const canPrepareDownload = slug === "routes" && identity.role === "owner_admin" && ["published", "ready"].includes(String(record["status"]));
  let downloadDevices: readonly DownloadDevice[] = [];
  if (canPrepareDownload && typeof record["driver_user_id"] === "string") {
    const result = await supabase.from("devices").select("id,display_name,registered_at")
      .eq("organization_id", identity.organizationID).eq("user_id", record["driver_user_id"]).is("revoked_at", null).order("registered_at", { ascending: false }).limit(50);
    if (result.error) throw new Error("Registered driver phones could not be loaded.");
    downloadDevices = (result.data ?? []).map((device) => ({ id: String(device.id), label: `${device.display_name || "Driver phone"} · ${String(device.id).slice(0, 8)}` }));
  }
  const canManageActiveState = identity.role === "owner_admin"
    && managedEntityType !== undefined
    && typeof record["is_active"] === "boolean";
  const canFinalizeDelivery = slug === "deliveries"
    && record["lifecycle_state"] === "completed"
    && record["acceptance_state"] === "accepted"
    && record["finalization_state"] === "not_requested";
  const paymentStatus = slug === "payments" && isPaymentStatus(record["current_status"])
    ? record["current_status"]
    : undefined;
  let onAccountBalance: DisplayRow | undefined;
  if (slug === "payments" && record["method"] === "on_account_invoice") {
    const result = await supabase.from("office_on_account_balances")
      .select("amount_minor,current_invoice_total_minor,currency_code")
      .eq("organization_id", identity.organizationID).eq("id", recordID).maybeSingle();
    if (result.error) throw new Error("Current issued invoice totals could not be loaded.");
    onAccountBalance = result.data ?? undefined;
  }
  let correctionDeliveryID = record["source_delivery_id"];
  if (slug === "invoices" && !correctionDeliveryID && typeof record["source_correction_id"] === "string") {
    const source = await supabase.from("corrections").select("original_delivery_id")
      .eq("organization_id", identity.organizationID).eq("id", record["source_correction_id"]).maybeSingle();
    if (source.error) throw new Error("Invoice source could not be loaded.");
    correctionDeliveryID = source.data?.original_delivery_id;
  }
  const canCorrectInvoice = slug === "invoices"
    && typeof correctionDeliveryID === "string"
    && typeof record["issued_at"] === "string"
    && await canIssueFinancialCorrection(identity, supabase);
  const replacementLines: ReplacementLine[] = [];
  let replacementUnavailable = "Price replacement is available for original unpaid on-account invoices with sale lines and no earlier credits, returns or price adjustments.";
  if (canCorrectInvoice && record["source_delivery_id"] && record["payment_method_snapshot"] === "on_account_invoice"
    && loadedRelations.find((relation) => relation.definition.slug === "corrections")?.rows.length === 0) {
    const snapshot = record["document_snapshot"] as Record<string, unknown>;
    const payment = snapshot?.["payment"] as Record<string, unknown> | undefined;
    const sales = snapshot?.["sale_lines"] as readonly Record<string, unknown>[] | undefined;
    if (payment && typeof payment["payment_id"] === "string" && Array.isArray(sales)
      && Array.isArray(snapshot["return_lines"]) && snapshot["return_lines"].length === 0
      && Array.isArray(snapshot["adjustments"]) && snapshot["adjustments"].length === 0) {
      const [currentPayment, sourceLines] = await Promise.all([
        supabase.from("payments").select("current_status").eq("organization_id", identity.organizationID).eq("id", payment["payment_id"]).maybeSingle(),
        supabase.from("financial_document_lines").select("id,source_delivery_line_id,description_snapshot,quantity:quantity::text,unit_amount_minor:unit_amount_minor::text,tax_rate_basis_points")
          .eq("organization_id", identity.organizationID).eq("financial_document_id", recordID).order("line_number").limit(1000),
      ]);
      if (currentPayment.error || sourceLines.error) throw new Error("Invoice replacement details could not be loaded.");
      if (currentPayment.data?.current_status === "unpaid") {
        for (const line of sourceLines.data ?? []) {
          const frozen = sales.find((sale) => sale["id"] === line.source_delivery_line_id);
          const mode = frozen?.["price_mode"];
          if (mode !== "tax_inclusive" && mode !== "tax_exclusive") break;
          replacementLines.push({ id: line.id, description: line.description_snapshot, quantity: String(line.quantity),
            unitAmountMinor: String(line.unit_amount_minor), taxRateBasisPoints: line.tax_rate_basis_points, priceMode: mode });
        }
        if (replacementLines.length > 0 && replacementLines.length === sales.length) replacementUnavailable = "";
      }
    }
  }

  return (
    <div className="office-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/office">Dashboard</Link><span aria-hidden="true">/</span>
        <Link href={`/office/${section.slug}`}>{section.title}</Link><span aria-hidden="true">/</span>
        <span>Details</span>
      </nav>
      <div className="page-heading">
        <div><p className="eyebrow">{identity.organizationName}</p><h1>{section.title} details</h1><p>{section.description}</p></div>
        <Link className="quiet-link" href={`/office/${section.slug}`}>Back to list</Link>
      </div>
      {editor ? <div className="toolbar section-toolbar"><Link className="primary-link" href={`/office/manage/${editor.kind}/${recordID}`}>Manage {editor.title.toLowerCase()}</Link>{pendingOrderRevision ? <Link className="quiet-link" href={`/office/manage/${editor.kind}/${pendingOrderRevision["id"]}`}>Continue draft revision</Link> : editor.family === "policy" || canReviseOrder(editor.kind, record["status"]) ? <Link className="quiet-link" href={`/office/manage/${editor.kind}/new?copy=${recordID}`}>Create next revision</Link> : null}{editor.kind === "standing_order" && record["status"] === "published" ? <Link className="primary-link" href={`/office/manage/planned_order/new?template=${recordID}`}>Generate daily order</Link> : null}{slug === "routes" ? <><Link className="primary-link" href={`/office/routes/${recordID}/stops`}>Manage stops</Link><Link className="quiet-link" href={`/office/routes/${recordID}/copy`}>Copy route</Link></> : null}</div> : null}
      <section aria-labelledby="record-title">
        <h2 id="record-title">Record</h2>
        <dl className="detail-grid">
          {detailColumns.map((column) => (
            <div key={column}><dt>{titleForColumn(column)}</dt><dd>{displayValue(column, record[column], record)}</dd></div>
          ))}
        </dl>
      </section>
      {slug === "credit-notes" && typeof record["source_delivery_id"] === "string" ? (
        <div className="editor-notice"><p>This credit note records the balance owed to the customer from the collection below. No cash was collected or refunded when it was issued.</p></div>
      ) : null}
      {canManageActiveState ? <EntityActiveManagement entityID={recordID} entityType={managedEntityType} isActive={record["is_active"] as boolean} /> : null}
      {canPrepareDownload ? <DriverDownloadForm routeID={recordID} expectedVersion={String(record["version"])} devices={downloadDevices}
        alreadyPrepared={(loadedRelations.find((relation) => relation.definition.slug === "downloads")?.rows.length ?? 0) > 0} /> : null}
      {canFinalizeDelivery ? <DeliveryFinalizationManagement deliveryID={recordID} /> : null}
      {onAccountBalance ? <section aria-labelledby="current-invoice-balance">
        <h2 id="current-invoice-balance">Current invoice totals</h2>
        <dl className="detail-grid">
          {[["amount_minor", "Originally recorded"], ["current_invoice_total_minor", "Current issued total"]].map(([key, label]) =>
            <div key={key}><dt>{label}</dt><dd>{displayValue(key!, onAccountBalance[key!], onAccountBalance)}</dd></div>)}
        </dl>
        <p>Current totals include office credits, voids and replacement invoices for this delivery. The original recorded amount is preserved. Separate collection credits remain customer credits until allocated.</p>
      </section> : null}
      {paymentStatus ? <PaymentStatusManagement paymentID={recordID} currentStatus={paymentStatus} /> : null}
      {canCorrectInvoice ? (
        <FinancialCorrectionManagement
          documentID={recordID}
          deliveryID={correctionDeliveryID as string}
          approvalRequired={identity.role === "accountant"}
        />
      ) : null}
      {canCorrectInvoice ? <InvoiceReplacementManagement documentID={recordID}
        invoiceNumber={String(record["issued_number"])} originalGrossMinor={String(record["gross_minor"])}
        lines={replacementLines} unavailableReason={replacementUnavailable} approvalRequired={identity.role === "accountant"} /> : null}
      {canManageDriverDevices ? <DriverDeviceManagement driverUserID={driverUserID} devices={devices} /> : null}
      {loadedRelations.map(({ definition, rows }) => (
        <section className="related-section" aria-labelledby={`relation-${definition.slug}`} key={definition.slug}>
          <div className="related-heading"><h2 id={`relation-${definition.slug}`}>{definition.title}</h2><span className="record-count">{rows.length === 100 ? "First 100 records" : `${rows.length} records`}</span></div>
          {rows.length === 0 ? <p className="compact-empty">No records yet.</p> : (
            <RecordTable
              caption={`${definition.title} for this ${section.title.toLowerCase()} record`}
              columns={definition.columns}
              rows={rows}
              {...(definition.detailSection ? { detailBasePath: `/office/${definition.detailSection}` } : {})}
              {...(typeof record["currency_code"] === "string" ? { currencyCode: record["currency_code"] } : {})}
              {...(definition.protectedFileKind ? { protectedFile: { kind: definition.protectedFileKind, section: section.slug, parentID: recordID } } : {})}
            />
          )}
        </section>
      ))}
    </div>
  );
}
