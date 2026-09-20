import type { OfficeRole } from "@/domain/office";

export type ReportFilter =
  | Readonly<{ column: string; operator: "eq"; value: string }>
  | Readonly<{ column: string; operator: "in"; values: readonly string[] }>
  | Readonly<{ column: string; operator: "not_null" }>;

export interface ConditionalReportCount {
  readonly outputColumn: string;
  readonly sourceColumn: string;
  readonly values: readonly string[];
}

export interface ReportDifference {
  readonly outputColumn: string;
  readonly leftColumn: string;
  readonly rightColumn: string;
  readonly omitZero?: boolean;
}

export interface ReportDefinition {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly table: string;
  readonly sourceColumns: readonly string[];
  readonly outputColumns: readonly string[];
  readonly dateColumn: string;
  readonly roles: readonly OfficeRole[];
  readonly filters?: readonly ReportFilter[];
  readonly groupColumns: readonly string[];
  readonly sumColumns: readonly string[];
  readonly countColumn?: string;
  readonly conditionalCounts?: readonly ConditionalReportCount[];
  readonly differences?: readonly ReportDifference[];
  readonly latestPer?: Readonly<{ keys: readonly string[]; revisionColumn: string }>;
}

const both: readonly OfficeRole[] = ["owner_admin", "accountant"];
const owner: readonly OfficeRole[] = ["owner_admin"];
const acceptedDeliveryFilters: readonly ReportFilter[] = [
  { column: "lifecycle_state", operator: "eq", value: "completed" },
  { column: "acceptance_state", operator: "eq", value: "accepted" },
];

export const reportDefinitions: readonly ReportDefinition[] = [
  {
    slug: "daily-sales", title: "Daily sales", description: "Operational accepted-delivery totals by service day and currency. Later invoice corrections appear in Issued financial totals.", table: "deliveries",
    sourceColumns: ["service_date", "sale_net_minor", "sale_tax_minor", "sale_gross_minor", "return_net_minor", "return_tax_minor", "return_gross_minor", "total_net_minor", "total_tax_minor", "total_gross_minor", "currency_code"],
    outputColumns: ["service_date", "currency_code", "delivery_count", "sale_net_minor", "sale_tax_minor", "sale_gross_minor", "return_net_minor", "return_tax_minor", "return_gross_minor", "total_net_minor", "total_tax_minor", "total_gross_minor"],
    dateColumn: "service_date", roles: both, filters: acceptedDeliveryFilters, groupColumns: ["service_date", "currency_code"],
    sumColumns: ["sale_net_minor", "sale_tax_minor", "sale_gross_minor", "return_net_minor", "return_tax_minor", "return_gross_minor", "total_net_minor", "total_tax_minor", "total_gross_minor"], countColumn: "delivery_count",
  },
  {
    slug: "sales-by-customer", title: "Sales by customer", description: "Operational accepted-delivery totals by customer and currency. Later invoice corrections appear in Issued financial totals.", table: "deliveries",
    sourceColumns: ["service_date", "customer_account_id", "sale_net_minor", "sale_tax_minor", "sale_gross_minor", "return_net_minor", "return_tax_minor", "return_gross_minor", "total_net_minor", "total_tax_minor", "total_gross_minor", "currency_code"],
    outputColumns: ["customer_account_id", "currency_code", "delivery_count", "sale_net_minor", "sale_tax_minor", "sale_gross_minor", "return_net_minor", "return_tax_minor", "return_gross_minor", "total_net_minor", "total_tax_minor", "total_gross_minor"],
    dateColumn: "service_date", roles: both, filters: acceptedDeliveryFilters, groupColumns: ["customer_account_id", "currency_code"],
    sumColumns: ["sale_net_minor", "sale_tax_minor", "sale_gross_minor", "return_net_minor", "return_tax_minor", "return_gross_minor", "total_net_minor", "total_tax_minor", "total_gross_minor"], countColumn: "delivery_count",
  },
  {
    slug: "sales-by-shop", title: "Sales by shop", description: "Operational accepted-delivery totals by shop and currency. Later invoice corrections appear in Issued financial totals.", table: "deliveries",
    sourceColumns: ["service_date", "customer_account_id", "shop_location_id", "sale_net_minor", "sale_tax_minor", "sale_gross_minor", "return_net_minor", "return_tax_minor", "return_gross_minor", "total_net_minor", "total_tax_minor", "total_gross_minor", "currency_code"],
    outputColumns: ["customer_account_id", "shop_location_id", "currency_code", "delivery_count", "sale_net_minor", "sale_tax_minor", "sale_gross_minor", "return_net_minor", "return_tax_minor", "return_gross_minor", "total_net_minor", "total_tax_minor", "total_gross_minor"],
    dateColumn: "service_date", roles: both, filters: acceptedDeliveryFilters, groupColumns: ["customer_account_id", "shop_location_id", "currency_code"],
    sumColumns: ["sale_net_minor", "sale_tax_minor", "sale_gross_minor", "return_net_minor", "return_tax_minor", "return_gross_minor", "total_net_minor", "total_tax_minor", "total_gross_minor"], countColumn: "delivery_count",
  },
  {
    slug: "sales-by-product", title: "Sales and credits by product", description: "Issued sales, replacement sales, returns and adjustments by product and line kind. Invoice-level corrections stay in a separate unallocated row; quantities describe each line kind, not net stock.", table: "office_report_financial_lines",
    sourceColumns: ["financial_document_id", "kind", "product_id", "description_snapshot", "sku_snapshot", "quantity", "net_minor", "tax_minor", "gross_minor", "currency_code", "issue_date"],
    outputColumns: ["kind", "product_id", "sku_snapshot", "description_snapshot", "currency_code", "line_count", "quantity", "net_minor", "tax_minor", "gross_minor"],
    dateColumn: "issue_date", roles: both, groupColumns: ["kind", "product_id", "sku_snapshot", "description_snapshot", "currency_code"], sumColumns: ["quantity", "net_minor", "tax_minor", "gross_minor"], countColumn: "line_count",
  },
  {
    slug: "issued-financial-totals", title: "Issued financial totals", description: "Authoritative signed invoice and credit-note lines by issue date, customer, shop and kind. Includes later credits, voids and replacement reversals; unissued return reviews are excluded.", table: "office_report_financial_lines",
    sourceColumns: ["issue_date", "customer_account_id", "shop_location_id", "kind", "net_minor", "tax_minor", "gross_minor", "currency_code"],
    outputColumns: ["issue_date", "customer_account_id", "shop_location_id", "kind", "currency_code", "line_count", "net_minor", "tax_minor", "gross_minor"],
    dateColumn: "issue_date", roles: both, groupColumns: ["issue_date", "customer_account_id", "shop_location_id", "kind", "currency_code"], sumColumns: ["net_minor", "tax_minor", "gross_minor"], countColumn: "line_count",
  },
  {
    slug: "returns-by-customer", title: "Returns by customer", description: "Physical quantities and signed credit components by customer and financial state. Issued and pending credits are separate; visibility follows your account permissions.", table: "office_report_return_lines",
    sourceColumns: ["service_date", "customer_account_id", "financial_state", "quantity", "issued_credit_net_minor", "issued_credit_tax_minor", "issued_credit_gross_minor", "pending_credit_net_minor", "pending_credit_tax_minor", "pending_credit_gross_minor", "currency_code"],
    outputColumns: ["customer_account_id", "financial_state", "currency_code", "line_count", "quantity", "issued_credit_net_minor", "issued_credit_tax_minor", "issued_credit_gross_minor", "pending_credit_net_minor", "pending_credit_tax_minor", "pending_credit_gross_minor"],
    dateColumn: "service_date", roles: both, groupColumns: ["customer_account_id", "financial_state", "currency_code"], sumColumns: ["quantity", "issued_credit_net_minor", "issued_credit_tax_minor", "issued_credit_gross_minor", "pending_credit_net_minor", "pending_credit_tax_minor", "pending_credit_gross_minor"], countColumn: "line_count",
  },
  {
    slug: "returns-by-product", title: "Returns by product", description: "Physical quantities and signed credit components by product and financial state. A pending credit is never counted as issued. Invoice-level corrections appear in Issued financial totals.", table: "office_report_return_lines",
    sourceColumns: ["product_id", "product_name_snapshot", "product_sku_snapshot", "financial_state", "quantity", "issued_credit_net_minor", "issued_credit_tax_minor", "issued_credit_gross_minor", "pending_credit_net_minor", "pending_credit_tax_minor", "pending_credit_gross_minor", "currency_code", "service_date"],
    outputColumns: ["product_id", "product_sku_snapshot", "product_name_snapshot", "financial_state", "currency_code", "line_count", "quantity", "issued_credit_net_minor", "issued_credit_tax_minor", "issued_credit_gross_minor", "pending_credit_net_minor", "pending_credit_tax_minor", "pending_credit_gross_minor"],
    dateColumn: "service_date", roles: both, groupColumns: ["product_id", "product_sku_snapshot", "product_name_snapshot", "financial_state", "currency_code"], sumColumns: ["quantity", "issued_credit_net_minor", "issued_credit_tax_minor", "issued_credit_gross_minor", "pending_credit_net_minor", "pending_credit_tax_minor", "pending_credit_gross_minor"], countColumn: "line_count",
  },
  {
    slug: "driver-deliveries", title: "Driver delivery totals", description: "Accepted delivery count and exact values by assigned driver and currency.", table: "deliveries",
    sourceColumns: ["service_date", "driver_user_id", "total_net_minor", "total_tax_minor", "total_gross_minor", "currency_code"],
    outputColumns: ["driver_user_id", "currency_code", "delivery_count", "total_net_minor", "total_tax_minor", "total_gross_minor"],
    dateColumn: "service_date", roles: both, filters: acceptedDeliveryFilters, groupColumns: ["driver_user_id", "currency_code"], sumColumns: ["total_net_minor", "total_tax_minor", "total_gross_minor"], countColumn: "delivery_count",
  },
  {
    slug: "route-completion", title: "Route completion", description: "Current completed, skipped, failed, cancelled and open stop counts by route.", table: "route_stops",
    sourceColumns: ["route_id", "status", "updated_at"], outputColumns: ["route_id", "stop_count", "completed_stops", "skipped_stops", "failed_stops", "cancelled_stops", "open_stops"],
    dateColumn: "updated_at", roles: owner, groupColumns: ["route_id"], sumColumns: [], countColumn: "stop_count",
    conditionalCounts: [
      { outputColumn: "completed_stops", sourceColumn: "status", values: ["completed"] },
      { outputColumn: "skipped_stops", sourceColumn: "status", values: ["skipped"] },
      { outputColumn: "failed_stops", sourceColumn: "status", values: ["failed"] },
      { outputColumn: "cancelled_stops", sourceColumn: "status", values: ["cancelled"] },
      { outputColumn: "open_stops", sourceColumn: "status", values: ["planned", "ready", "en_route", "arrived", "in_progress"] },
    ],
  },
  {
    slug: "cash", title: "Cash expected, declared and discrepancy", description: "Latest shift declarations aggregated by driver and currency without double-counting prior revisions.", table: "cash_declarations",
    sourceColumns: ["shift_id", "driver_user_id", "declaration_revision", "expected_minor", "declared_minor", "discrepancy_minor", "currency_code", "recorded_at_server"],
    outputColumns: ["driver_user_id", "currency_code", "shift_count", "expected_minor", "declared_minor", "discrepancy_minor"],
    dateColumn: "recorded_at_server", roles: both, groupColumns: ["driver_user_id", "currency_code"], sumColumns: ["expected_minor", "declared_minor", "discrepancy_minor"], countColumn: "shift_count",
    latestPer: { keys: ["shift_id"], revisionColumn: "declaration_revision" },
  },
  {
    slug: "pending-external-payments", title: "Pending direct-debit / online", description: "Verified unsettled external payment count and exact value by method and currency.", table: "payments",
    sourceColumns: ["method", "current_status", "amount_minor", "currency_code", "recorded_at_server"], outputColumns: ["method", "currency_code", "payment_count", "amount_minor"],
    dateColumn: "recorded_at_server", roles: both, filters: [{ column: "acceptance_state", operator: "eq", value: "verified" }, { column: "current_status", operator: "eq", value: "pending" }, { column: "method", operator: "in", values: ["direct_debit", "online_payment"] }],
    groupColumns: ["method", "currency_code"], sumColumns: ["amount_minor"], countColumn: "payment_count",
  },
  {
    slug: "on-account", title: "On-account totals", description: "Original recorded amounts and current signed invoice totals, including office credits and replacements, grouped by settlement status. Separate collection credits remain unallocated customer credits.", table: "office_on_account_balances",
    sourceColumns: ["current_status", "amount_minor", "current_invoice_total_minor", "currency_code", "recorded_at_server"], outputColumns: ["current_status", "currency_code", "payment_count", "amount_minor", "current_invoice_total_minor"],
    dateColumn: "recorded_at_server", roles: both,
    groupColumns: ["current_status", "currency_code"], sumColumns: ["amount_minor", "current_invoice_total_minor"], countColumn: "payment_count",
  },
  {
    slug: "vat-summary-source", title: "VAT / tax summary", description: "Issued financial lines by recorded tax category, basis-point rate, kind and currency. Invoice-level corrections keep their separate correction category.", table: "office_report_financial_lines",
    sourceColumns: ["kind", "tax_rate_basis_points", "tax_category_snapshot", "net_minor", "tax_minor", "gross_minor", "currency_code", "issue_date"],
    outputColumns: ["tax_category_snapshot", "tax_rate_basis_points", "kind", "currency_code", "line_count", "net_minor", "tax_minor", "gross_minor"],
    dateColumn: "issue_date", roles: both, groupColumns: ["tax_category_snapshot", "tax_rate_basis_points", "kind", "currency_code"], sumColumns: ["net_minor", "tax_minor", "gross_minor"], countColumn: "line_count",
  },
  {
    slug: "load-discrepancy", title: "Load discrepancies", description: "Confirmed versus expected quantities with exact non-zero differences by shift and product.", table: "shift_load_lines",
    sourceColumns: ["shift_id", "product_id", "expected_quantity", "confirmed_quantity", "updated_at"], outputColumns: ["shift_id", "product_id", "expected_quantity", "confirmed_quantity", "discrepancy_quantity"],
    dateColumn: "updated_at", roles: owner, filters: [{ column: "confirmed_quantity", operator: "not_null" }], groupColumns: ["shift_id", "product_id"], sumColumns: ["expected_quantity", "confirmed_quantity"],
    differences: [{ outputColumn: "discrepancy_quantity", leftColumn: "confirmed_quantity", rightColumn: "expected_quantity", omitZero: true }],
  },
] as const;

export function reportForRole(slug: string, role: OfficeRole): ReportDefinition | undefined {
  return reportDefinitions.find((report) => report.slug === slug && report.roles.includes(role));
}
