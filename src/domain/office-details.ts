import type { OfficeRole } from "@/domain/office";

export interface OfficeDetailRelation {
  readonly slug: string;
  readonly title: string;
  readonly table: string;
  readonly parentColumn: string;
  readonly foreignColumn: string;
  readonly columns: readonly string[];
  readonly orderBy: string;
  readonly ascending?: boolean;
  readonly roles: readonly OfficeRole[];
  readonly protectedFileKind?: "pod" | "financial";
  readonly detailSection?: string;
  readonly documentType?: "invoice" | "credit_note";
}

const both: readonly OfficeRole[] = ["owner_admin", "accountant"];
const owner: readonly OfficeRole[] = ["owner_admin"];

const relationsBySection: Readonly<Record<string, readonly OfficeDetailRelation[]>> = {
  loads: [
    { slug: "lines", title: "Load lines", table: "shift_load_lines", parentColumn: "id", foreignColumn: "shift_id", columns: ["product_id", "expected_quantity", "confirmed_quantity", "difference_reason", "confirmed_at"], orderBy: "created_at", ascending: true, roles: owner },
  ],
  drivers: [
    { slug: "membership", title: "Organization membership", table: "organization_memberships", parentColumn: "user_id", foreignColumn: "user_id", columns: ["role", "status", "permission_revision", "updated_at"], orderBy: "updated_at", roles: owner },
    { slug: "devices", title: "Driver devices", table: "devices", parentColumn: "user_id", foreignColumn: "user_id", columns: ["installation_id", "display_name", "registered_at", "revoked_at", "last_successful_sync_at", "version"], orderBy: "registered_at", roles: owner },
  ],
  products: [
    { slug: "barcodes", title: "Barcodes", table: "product_barcodes", parentColumn: "id", foreignColumn: "product_id", columns: ["barcode_value", "symbology", "is_active", "updated_at"], orderBy: "updated_at", roles: owner },
  ],
  customers: [
    { slug: "shops", title: "Shop locations", table: "shop_locations", parentColumn: "id", foreignColumn: "customer_account_id", columns: ["location_code", "display_name", "postal_code", "is_active", "updated_at"], orderBy: "display_name", ascending: true, roles: owner },
  ],
  "standing-orders": [
    { slug: "lines", title: "Template lines", table: "standing_order_lines", parentColumn: "id", foreignColumn: "standing_order_id", columns: ["product_id", "planned_quantity", "display_order", "updated_at"], orderBy: "display_order", ascending: true, roles: owner },
    { slug: "revisions", title: "Template revision history", table: "standing_orders", parentColumn: "template_key", foreignColumn: "template_key", columns: ["revision", "weekday", "status", "effective_from", "effective_until"], orderBy: "revision", roles: owner, detailSection: "standing-orders" },
    { slug: "generated", title: "Generated daily orders", table: "planned_orders", parentColumn: "id", foreignColumn: "source_standing_order_id", columns: ["service_date", "revision", "status"], orderBy: "service_date", roles: owner, detailSection: "daily-orders" },
  ],
  "daily-orders": [
    { slug: "lines", title: "Planned lines", table: "planned_order_lines", parentColumn: "id", foreignColumn: "planned_order_id", columns: ["product_id", "source_standing_order_line_id", "planned_quantity", "display_order", "updated_at"], orderBy: "display_order", ascending: true, roles: owner },
    { slug: "revisions", title: "Order revision history", table: "planned_orders", parentColumn: "order_key", foreignColumn: "order_key", columns: ["revision", "service_date", "status", "updated_at"], orderBy: "revision", roles: owner, detailSection: "daily-orders" },
  ],
  routes: [
    { slug: "downloads", title: "Driver download history", table: "work_packages", parentColumn: "id", foreignColumn: "route_id", columns: ["device_id", "status", "download_revision", "manifest_item_count", "issued_at", "expires_at", "downloaded_at", "acknowledged_at"], orderBy: "issued_at", roles: owner },
    { slug: "stops", title: "Ordered stops", table: "route_stops", parentColumn: "id", foreignColumn: "route_id", columns: ["stop_sequence", "shop_location_id", "planned_order_id", "status", "delivery_notes", "terminal_reason", "updated_at"], orderBy: "stop_sequence", ascending: true, roles: owner },
  ],
  deliveries: [
    { slug: "lines", title: "Delivered lines", table: "delivery_lines", parentColumn: "id", foreignColumn: "delivery_id", columns: ["product_sku_snapshot", "product_name_snapshot", "quantity", "unit_effective_amount_minor", "tax_rate_basis_points", "net_minor", "tax_minor", "gross_minor", "currency_code"], orderBy: "created_at", ascending: true, roles: both },
    { slug: "returns", title: "Returns", table: "returns", parentColumn: "id", foreignColumn: "delivery_id", columns: ["reason", "client_event_time", "server_received_at", "updated_at"], orderBy: "created_at", ascending: true, roles: both },
    { slug: "payment-allocations", title: "Payment allocations", table: "payment_allocations", parentColumn: "id", foreignColumn: "delivery_id", columns: ["payment_id", "amount_minor", "currency_code", "created_at"], orderBy: "created_at", ascending: true, roles: both },
    { slug: "pod", title: "Proof of delivery", table: "proof_of_delivery", parentColumn: "id", foreignColumn: "delivery_id", columns: ["mode_snapshot", "state", "customer_name", "signature_captured", "photo_captured", "captured_at_client"], orderBy: "recorded_at_server", roles: owner, detailSection: "pod" },
    { slug: "delivery-documents", title: "Driver delivery documents", table: "delivery_documents", parentColumn: "id", foreignColumn: "delivery_id", columns: ["kind", "document_label", "template_version", "content_sha256", "created_at_client", "recorded_at_server"], orderBy: "recorded_at_server", roles: both },
  ],
  returns: [
    { slug: "lines", title: "Return lines", table: "return_lines", parentColumn: "id", foreignColumn: "return_id", columns: ["product_sku_snapshot", "product_name_snapshot", "quantity", "valuation_source", "stock_bucket", "net_minor", "tax_minor", "gross_minor", "currency_code", "financial_exception"], orderBy: "created_at", ascending: true, roles: both },
  ],
  invoices: [
    { slug: "original-invoice", title: "Original invoice", table: "financial_documents", parentColumn: "original_invoice_id", foreignColumn: "id", columns: ["issued_number", "issue_date", "gross_minor", "currency_code"], orderBy: "created_at", roles: both, detailSection: "invoices", documentType: "invoice" },
    { slug: "replacement-invoices", title: "Replacement invoices", table: "financial_documents", parentColumn: "id", foreignColumn: "original_invoice_id", columns: ["issued_number", "issue_date", "gross_minor", "currency_code"], orderBy: "created_at", roles: both, detailSection: "invoices", documentType: "invoice" },
    { slug: "issued-credits", title: "Linked credit notes", table: "financial_documents", parentColumn: "id", foreignColumn: "original_invoice_id", columns: ["issued_number", "issue_date", "gross_minor", "currency_code"], orderBy: "created_at", roles: both, detailSection: "credit-notes", documentType: "credit_note" },
    { slug: "lines", title: "Invoice lines", table: "financial_document_lines", parentColumn: "id", foreignColumn: "financial_document_id", columns: ["line_number", "kind", "description_snapshot", "sku_snapshot", "quantity", "tax_rate_basis_points", "net_minor", "tax_minor", "gross_minor", "currency_code"], orderBy: "line_number", ascending: true, roles: both },
    { slug: "artifacts", title: "Official PDF", table: "financial_document_artifacts", parentColumn: "id", foreignColumn: "financial_document_id", columns: ["template_version", "state", "byte_count", "attempt_count", "last_error_category", "stored_at"], orderBy: "created_at", roles: both, protectedFileKind: "financial" },
    { slug: "corrections", title: "Issued corrections", table: "corrections", parentColumn: "id", foreignColumn: "original_financial_document_id", columns: ["kind", "net_delta_minor", "tax_delta_minor", "gross_delta_minor", "reason", "approval_reference", "actor_role_snapshot", "occurred_at"], orderBy: "occurred_at", roles: both },
  ],
  "credit-notes": [
    { slug: "original-invoice", title: "Original invoice", table: "financial_documents", parentColumn: "original_invoice_id", foreignColumn: "id", columns: ["issued_number", "issue_date", "gross_minor", "currency_code"], orderBy: "created_at", roles: both, detailSection: "invoices", documentType: "invoice" },
    { slug: "collection", title: "Source collection", table: "deliveries", parentColumn: "source_delivery_id", foreignColumn: "id", columns: ["service_date", "shop_location_id", "total_gross_minor", "currency_code", "finalization_state"], orderBy: "created_at", roles: both, detailSection: "deliveries" },
    { slug: "lines", title: "Credit-note lines", table: "financial_document_lines", parentColumn: "id", foreignColumn: "financial_document_id", columns: ["line_number", "kind", "description_snapshot", "sku_snapshot", "quantity", "tax_rate_basis_points", "net_minor", "tax_minor", "gross_minor", "currency_code"], orderBy: "line_number", ascending: true, roles: both },
    { slug: "artifacts", title: "Official PDF", table: "financial_document_artifacts", parentColumn: "id", foreignColumn: "financial_document_id", columns: ["template_version", "state", "byte_count", "attempt_count", "last_error_category", "stored_at"], orderBy: "created_at", roles: both, protectedFileKind: "financial" },
  ],
  payments: [
    { slug: "allocations", title: "Delivery allocations", table: "payment_allocations", parentColumn: "id", foreignColumn: "payment_id", columns: ["delivery_id", "amount_minor", "currency_code", "created_at"], orderBy: "created_at", ascending: true, roles: both },
    { slug: "status-history", title: "Status history", table: "payment_status_events", parentColumn: "id", foreignColumn: "payment_id", columns: ["previous_status", "new_status", "evidence_source", "evidence_reference", "reason", "occurred_at"], orderBy: "occurred_at", roles: both },
  ],
  pod: [
    { slug: "attachments", title: "Verified attachments", table: "attachments", parentColumn: "id", foreignColumn: "proof_of_delivery_id", columns: ["kind", "mime_type", "byte_count", "upload_state", "verified_at", "last_error_category"], orderBy: "created_at", ascending: true, roles: owner, protectedFileKind: "pod" },
  ],
  settings: [
    { slug: "published-settings", title: "Settings history", table: "organization_settings_revisions", parentColumn: "id", foreignColumn: "organization_id", columns: ["revision_number", "effective_from", "effective_until", "is_active", "published_at", "updated_at"], orderBy: "revision_number", roles: owner },
  ],
};

export function detailRelationsForRole(section: string, role: OfficeRole): readonly OfficeDetailRelation[] {
  return (relationsBySection[section] ?? []).filter((relation) => relation.roles.includes(role));
}
