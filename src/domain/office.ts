export type OfficeRole = "owner_admin" | "accountant";

export interface OfficeIdentity {
  readonly userID: string;
  readonly organizationID: string;
  readonly organizationName: string;
  readonly displayName: string;
  readonly employeeID: string;
  readonly role: OfficeRole;
  readonly timezoneName: string;
}

export interface OfficeOrganizationChoice {
  readonly id: string;
  readonly name: string;
  readonly role: OfficeRole;
}

export interface OfficeSection {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly table: string;
  readonly columns: readonly string[];
  readonly detailColumns?: readonly string[];
  readonly roles: readonly OfficeRole[];
  readonly orderBy: string;
  readonly ascending?: boolean;
  readonly documentType?: "invoice" | "credit_note";
}

const both: readonly OfficeRole[] = ["owner_admin", "accountant"];
const owner: readonly OfficeRole[] = ["owner_admin"];

export const officeSections: readonly OfficeSection[] = [
  { slug: "drivers", title: "Drivers / Users", description: "Organization-local employee identities and access state.", table: "profiles", columns: ["employee_id", "display_name", "is_active", "updated_at"], roles: owner, orderBy: "employee_id", ascending: true },
  { slug: "products", title: "Products", description: "Sellable catalogue items. Historic records are deactivated, never erased.", table: "products", columns: ["sku", "name", "category", "unit", "is_active", "updated_at"], roles: owner, orderBy: "display_order", ascending: true },
  { slug: "barcodes", title: "Barcodes", description: "Exact product barcode mappings and symbologies.", table: "product_barcodes", columns: ["barcode_value", "symbology", "product_id", "is_active", "updated_at"], roles: owner, orderBy: "updated_at" },
  { slug: "customers", title: "Customers", description: "Commercial customer accounts, separate from delivery locations.", table: "customer_accounts", columns: ["account_code", "legal_name", "trading_name", "payment_terms_days", "is_active", "updated_at"], roles: owner, orderBy: "legal_name", ascending: true },
  { slug: "shops", title: "Shop Locations", description: "Physical delivery destinations and POD requirements.", table: "shop_locations", columns: ["location_code", "display_name", "postal_code", "customer_account_id", "is_active", "updated_at"], roles: owner, orderBy: "display_name", ascending: true },
  { slug: "pricing", title: "Pricing", description: "Versioned organization, customer and shop price rules.", table: "price_rule_revisions", columns: ["price_rule_id", "revision_number", "unit_amount_minor", "currency_code", "tax_mode", "effective_from", "effective_until", "is_active"], roles: owner, orderBy: "updated_at" },
  { slug: "price-rules", title: "Price Rules", description: "Choose which product and customer a sale or return price applies to.", table: "price_rules", columns: ["product_id", "purpose", "scope", "customer_account_id", "shop_location_id", "is_active"], roles: owner, orderBy: "updated_at" },
  { slug: "tax", title: "Tax Settings", description: "Published tax revisions and deterministic basis-point rates.", table: "tax_rule_revisions", columns: ["tax_rule_id", "revision_number", "rate_basis_points", "effective_from", "effective_until", "is_active"], roles: owner, orderBy: "updated_at" },
  { slug: "tax-rules", title: "Tax Rules", description: "Tax categories used by products and published rates.", table: "tax_rules", columns: ["code", "name", "jurisdiction_code", "category_code", "is_active"], roles: owner, orderBy: "code", ascending: true },
  { slug: "standing-orders", title: "Standing Orders", description: "Recurring templates used to generate dated planned orders.", table: "standing_orders", columns: ["shop_location_id", "weekday", "revision", "status", "effective_from", "effective_until"], roles: owner, orderBy: "updated_at" },
  { slug: "daily-orders", title: "Daily Orders", description: "Dated planned orders; actual driver deliveries remain separate.", table: "planned_orders", columns: ["service_date", "shop_location_id", "status", "source_standing_order_id", "revision", "updated_at"], roles: owner, orderBy: "service_date" },
  { slug: "routes", title: "Routes", description: "Daily assigned routes and their publication state.", table: "routes", columns: ["service_date", "driver_user_id", "shift_id", "status", "publication_revision", "order_version", "updated_at"], roles: owner, orderBy: "service_date" },
  { slug: "loads", title: "Morning Loads", description: "Driver shifts and their expected and confirmed loads.", table: "shifts", columns: ["service_date", "driver_user_id", "status", "required_load_confirmation", "load_confirmed_at", "updated_at"], roles: owner, orderBy: "service_date" },
  { slug: "deliveries", title: "Deliveries", description: "Local-first delivery records and server acceptance state.", table: "deliveries", columns: ["service_date", "shop_location_id", "driver_user_id", "lifecycle_state", "acceptance_state", "finalization_state", "total_gross_minor", "currency_code", "updated_at"], roles: both, orderBy: "updated_at" },
  { slug: "returns", title: "Returns", description: "Physical returns and their immutable collection evidence.", table: "returns", columns: ["delivery_id", "reason", "client_event_time", "server_received_at", "updated_at"], roles: both, orderBy: "updated_at" },
  { slug: "invoices", title: "Invoices", description: "Immutable server-issued financial snapshots.", table: "financial_documents", columns: ["issued_number", "issue_date", "issued_at", "source_delivery_id", "customer_legal_name_snapshot", "payment_method_snapshot", "payment_status_snapshot", "net_minor", "tax_minor", "gross_minor", "currency_code"], roles: both, orderBy: "issued_at", documentType: "invoice" },
  { slug: "credit-notes", title: "Credit Notes", description: "Credits from returned goods and authorized invoice corrections.", table: "financial_documents", columns: ["issued_number", "issue_date", "issued_at", "source_delivery_id", "customer_legal_name_snapshot", "net_minor", "tax_minor", "gross_minor", "currency_code"], roles: both, orderBy: "issued_at", documentType: "credit_note" },
  { slug: "payments", title: "Payments", description: "Payment method and settlement state are tracked separately.", table: "payments", columns: ["method", "current_status", "acceptance_state", "verified_at_server", "amount_minor", "currency_code", "external_reference", "collected_at_client", "recorded_at_server"], roles: both, orderBy: "recorded_at_server" },
  { slug: "cash-reconciliation", title: "Cash Reconciliation", description: "Expected, declared and discrepant end-of-shift cash.", table: "cash_declarations", columns: ["shift_id", "driver_user_id", "declaration_revision", "expected_minor", "declared_minor", "discrepancy_minor", "currency_code", "reason", "declared_at_client", "recorded_at_server"], roles: both, orderBy: "recorded_at_server" },
  { slug: "pod", title: "Proof of Delivery", description: "Private proof metadata. Verified attachment bytes are available only through short-lived protected links.", table: "proof_of_delivery", columns: ["delivery_id", "mode_snapshot", "state", "customer_name", "signature_captured", "photo_captured", "captured_at_client"], roles: owner, orderBy: "updated_at" },
  { slug: "audit", title: "Audit Log", description: "Meaningful business changes and actor evidence.", table: "audit_events", columns: ["server_recorded_at", "entity_type", "entity_id", "action", "visibility", "actor_role_snapshot", "reason", "request_correlation_id"], roles: both, orderBy: "server_recorded_at" },
  { slug: "settings", title: "Organization Settings", description: "Business identity, contact details and document presentation.", table: "organizations", columns: ["legal_name", "trading_name", "currency_code", "timezone_name", "vat_registration_number", "is_active", "updated_at"], detailColumns: ["legal_name", "trading_name", "company_registration_number", "vat_registration_number", "registered_address_line_1", "registered_address_line_2", "registered_locality", "registered_region", "registered_postal_code", "registered_country_code", "contact_name", "contact_email", "contact_phone", "document_footer", "currency_code", "timezone_name", "updated_at"], roles: owner, orderBy: "updated_at" },
  { slug: "settings-revisions", title: "Operating Policies", description: "Dated settings for driver permissions, loads, scanning and proof of delivery.", table: "organization_settings_revisions", columns: ["revision_number", "effective_from", "effective_until", "pod_requirement_default", "is_active", "published_at"], roles: owner, orderBy: "revision_number" },
] as const;

export function sectionForRole(slug: string, role: OfficeRole): OfficeSection | undefined {
  return officeSections.find((section) => section.slug === slug && section.roles.includes(role));
}
