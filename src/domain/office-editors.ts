/** Explicit field and table allowlists for the owner workspace. */
export type EditorFamily = "master" | "policy" | "order" | "route" | "load" | "membership" | "organization";
export type FieldKind = "text" | "textarea" | "email" | "date" | "integer" | "decimal" | "money" | "percent" | "select" | "hidden";
export interface Choice { readonly value: string; readonly label: string; readonly parentID?: string }
export interface EditorField {
  readonly name: string; readonly label: string; readonly kind: FieldKind;
  readonly required: boolean; readonly initial: string; readonly maximum: number;
  readonly choices?: readonly Choice[]; readonly lookup?: string; readonly parentField?: string;
  readonly help?: string;
}
export interface OfficeEditor {
  readonly kind: string; readonly title: string; readonly section: string;
  readonly table: string; readonly family: EditorFamily; readonly fields: readonly EditorField[];
  readonly lineTable?: string; readonly lineParent?: string;
}

const field = (name: string, label: string, options: Partial<Omit<EditorField, "name" | "label">> = {}): EditorField => ({ name, label, kind: "text", required: true, initial: "", maximum: 300, ...options });
const optional = (name: string, label: string, options: Partial<Omit<EditorField, "name" | "label">> = {}) => field(name, label, { required: false, ...options });
const hidden = (name: string, initial = "") => optional(name, name, { kind: "hidden", initial });
const choices = (...values: readonly string[]): readonly Choice[] => values.map((value) => ({ value, label: value.replaceAll("_", " ") }));
const yesNo = [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];
const flag = (name: string, label: string, initial = "false", inherit = false) => field(name, label, { kind: "select", initial, required: !inherit, choices: inherit ? [{ value: "", label: "Use customer default" }, ...yesNo] : yesNo });
const ref = (name: string, label: string, lookup: string, required = true, parentField?: string) => field(name, label, { kind: "select", lookup, required, ...(parentField ? { parentField } : {}) });
const notes = (name = "notes", label = "Notes") => optional(name, label, { kind: "textarea", maximum: 4000 });
const active = flag("is_active", "Active", "true");
const dates = [field("effective_from", "Effective from", { kind: "date" }), optional("effective_until", "Effective until (exclusive)", { kind: "date", help: "Leave blank for no end date. This date itself is excluded." })];
const customerShop = [ref("customer_account_id", "Customer", "customers"), ref("shop_location_id", "Shop location", "shops", true, "customer_account_id")];
const currency = hidden("currency_code", "GBP");

export const officeEditors: readonly OfficeEditor[] = [
  { kind: "organization", title: "Business details", section: "settings", table: "organizations", family: "organization", fields: [field("legal_name", "Legal business name"), optional("trading_name", "Trading name"), optional("company_registration_number", "Company number"), optional("vat_registration_number", "VAT number"), optional("registered_address_line_1", "Business address line 1"), optional("registered_address_line_2", "Business address line 2"), optional("registered_locality", "Town / city"), optional("registered_region", "Region"), optional("registered_postal_code", "Postcode"), field("registered_country_code", "Country code", { initial: "GB", maximum: 2 }), optional("contact_name", "Contact name"), optional("contact_email", "Contact email", { kind: "email" }), optional("contact_phone", "Contact phone"), notes("document_footer", "Invoice and credit-note footer"), currency, field("timezone_name", "Business time zone", { initial: "Europe/London", maximum: 100 })] },
  { kind: "product", title: "Product", section: "products", table: "products", family: "master", fields: [
    field("name", "Product name"), field("sku", "SKU", { maximum: 120 }), field("category", "Category", { maximum: 200 }), field("unit", "Unit", { initial: "each", maximum: 80 }),
    notes("description", "Description"), ref("default_tax_rule_id", "Default tax rule", "tax_rules", false), field("display_order", "Display order", { kind: "integer", initial: "0", maximum: 100000000 }), optional("image_storage_path", "Product image path", { maximum: 1000 }), active,
  ] },
  { kind: "product_barcode", title: "Barcode", section: "barcodes", table: "product_barcodes", family: "master", fields: [
    ref("product_id", "Product", "products"), field("barcode_value", "Barcode", { maximum: 256, help: "Keep leading zeroes. Enter the exact value printed on the product." }), field("symbology", "Barcode type", { kind: "select", initial: "ean13", choices: choices("ean13", "ean8", "upce", "code128", "code39", "qr") }), active,
  ] },
  { kind: "customer_account", title: "Customer", section: "customers", table: "customer_accounts", family: "master", fields: [
    field("account_code", "Account code", { maximum: 120 }), field("legal_name", "Legal name"), optional("trading_name", "Trading name"),
    ...["billing_address_line_1", "billing_address_line_2", "billing_locality", "billing_region", "billing_postal_code"].map((name) => optional(name, name.replaceAll("_", " "))), field("billing_country_code", "Billing country code", { initial: "GB", maximum: 2 }),
    optional("contact_name", "Contact name"), optional("contact_email", "Contact email", { kind: "email" }), optional("contact_phone", "Contact phone"), field("payment_terms_days", "Payment terms (days)", { kind: "integer", initial: "0", maximum: 3650 }), notes("payment_instructions", "Payment instructions"),
    flag("default_require_customer_name", "Require recipient name"), flag("default_require_signature", "Require signature"), flag("default_require_photo", "Require photo"), active,
  ] },
  { kind: "shop_location", title: "Shop location", section: "shops", table: "shop_locations", family: "master", fields: [
    ref("customer_account_id", "Customer", "customers"), field("location_code", "Location code"), field("display_name", "Shop name"), field("address_line_1", "Address line 1", { maximum: 1000 }), optional("address_line_2", "Address line 2"), field("locality", "Town / city", { maximum: 500 }), optional("region", "Region"), field("postal_code", "Postcode", { maximum: 100 }), field("country_code", "Country code", { initial: "GB", maximum: 2 }),
    optional("latitude", "Latitude", { kind: "decimal" }), optional("longitude", "Longitude", { kind: "decimal" }), optional("contact_name", "Contact name"), optional("contact_phone", "Contact phone"), notes("delivery_notes", "Delivery notes"), notes("access_notes", "Access notes"), notes("route_notes", "Route notes"), notes("payment_instructions_override", "Payment instructions override"), optional("payment_terms_days_override", "Payment terms override (days)", { kind: "integer", maximum: 3650 }),
    flag("require_customer_name_override", "Require recipient name", "", true), flag("require_signature_override", "Require signature", "", true), flag("require_photo_override", "Require photo", "", true), active,
  ] },
  { kind: "tax_rule", title: "Tax rule", section: "tax-rules", table: "tax_rules", family: "master", fields: [field("code", "Code", { maximum: 80 }), field("name", "Name"), field("jurisdiction_code", "Country code", { maximum: 2, initial: "GB" }), field("category_code", "Tax category", { maximum: 80, initial: "standard" }), active] },
  { kind: "price_rule", title: "Price rule", section: "price-rules", table: "price_rules", family: "master", fields: [ref("product_id", "Product", "products"), field("purpose", "Purpose", { kind: "select", initial: "sale", choices: [{ value: "sale", label: "Sale" }, { value: "return_credit", label: "Return credit" }] }), field("scope", "Applies to", { kind: "select", initial: "organization", choices: [{ value: "organization", label: "All customers" }, { value: "customer_account", label: "One customer" }, { value: "shop_location", label: "One shop" }] }), ref("customer_account_id", "Customer", "customers", false), ref("shop_location_id", "Shop", "shops", false), active] },
  { kind: "tax_revision", title: "Tax rate revision", section: "tax", table: "tax_rule_revisions", family: "policy", fields: [hidden("revision_type", "tax_rule"), ref("tax_rule_id", "Tax rule", "tax_rules"), field("rate_basis_points", "Tax rate (%)", { kind: "percent", initial: "0.00" }), ...dates, active] },
  { kind: "price_revision", title: "Price revision", section: "pricing", table: "price_rule_revisions", family: "policy", fields: [hidden("revision_type", "price_rule"), ref("price_rule_id", "Price rule", "price_rules"), field("unit_amount_minor", "Unit price (£)", { kind: "money", initial: "0.00" }), currency, field("tax_mode", "Price includes tax", { kind: "select", initial: "tax_inclusive", choices: [{ value: "tax_inclusive", label: "Yes — tax inclusive" }, { value: "tax_exclusive", label: "No — tax added" }] }), ref("tax_rule_revision_id", "Published tax rate", "tax_revisions"), ...dates, active] },
  { kind: "settings_revision", title: "Organization settings revision", section: "settings-revisions", table: "organization_settings_revisions", family: "policy", fields: [hidden("revision_type", "organization_settings"), currency, field("timezone_name", "Time zone", { initial: "Europe/London", maximum: 100 }), ...dates, flag("load_confirmation_required", "Require morning load confirmation", "true"), flag("driver_stop_reordering_enabled", "Allow remaining stop reorder"), flag("driver_price_override_enabled", "Allow authorized price overrides"), field("driver_max_discount_basis_points", "Maximum driver discount (%)", { kind: "percent", initial: "0.00" }), optional("manager_approval_threshold_minor", "Manager approval threshold (£)", { kind: "money" }), field("pod_requirement_default", "Default proof of delivery", { kind: "select", initial: "customer_name", choices: choices("none", "customer_name", "signature", "photo", "customer_name_and_signature", "customer_name_and_photo", "signature_and_photo", "all") }), field("scanner_symbologies", "Enabled barcode types", { initial: "ean13,ean8,code128,qr", maximum: 1300, help: "Comma-separated barcode types, such as ean13, ean8, code128, qr." }), hidden("automatic_route_optimization_enabled", "false"), hidden("card_payments_enabled", "false"), hidden("waste_tracking_enabled", "false"), active] },
  { kind: "standing_order", title: "Standing order", section: "standing-orders", table: "standing_orders", family: "order", lineTable: "standing_order_lines", lineParent: "standing_order_id", fields: [hidden("template_key"), ...customerShop, field("weekday", "Delivery day", { kind: "select", initial: "1", choices: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((label, index) => ({ value: String(index + 1), label })) }), ...dates, notes()] },
  { kind: "planned_order", title: "Daily order", section: "daily-orders", table: "planned_orders", family: "order", lineTable: "planned_order_lines", lineParent: "planned_order_id", fields: [hidden("order_key"), hidden("previous_revision_id"), ...customerShop, field("service_date", "Delivery date", { kind: "date" }), ref("source_standing_order_id", "Source standing order", "standing_orders", false), notes()] },
  { kind: "route", title: "Route", section: "routes", table: "routes", family: "route", fields: [ref("driver_user_id", "Driver", "drivers"), ref("shift_id", "Shift", "shifts", true, "driver_user_id"), field("service_date", "Delivery date", { kind: "date" }), notes()] },
  { kind: "shift", title: "Shift and morning load", section: "loads", table: "shifts", family: "load", lineTable: "shift_load_lines", lineParent: "shift_id", fields: [ref("driver_user_id", "Driver", "drivers"), ref("active_device_id", "Assigned device", "devices", false, "driver_user_id"), field("service_date", "Shift date", { kind: "date" }), flag("required_load_confirmation", "Require load confirmation", "true"), notes()] },
  { kind: "membership", title: "User access", section: "drivers", table: "organization_memberships", family: "membership", fields: [hidden("profile_id"), hidden("user_id"), field("display_name", "Name", { maximum: 200 }), field("employee_id", "Employee ID", { maximum: 100 }), field("role", "Role", { kind: "select", initial: "driver", choices: [{ value: "owner_admin", label: "Owner / Admin" }, { value: "accountant", label: "Accountant" }, { value: "driver", label: "Driver" }] }), field("status", "Access status", { kind: "select", initial: "active", choices: choices("invited", "active", "suspended", "revoked") }), hidden("is_active", "true")] },
];

export function editorForKind(kind: string): OfficeEditor | undefined { return officeEditors.find((editor) => editor.kind === kind); }
export function editorForSection(section: string): OfficeEditor | undefined { return officeEditors.find((editor) => editor.section === section); }

/** Exact decimal conversion: money and percentages never pass through floats. */
export function hundredthsFromDecimal(value: string): string | undefined {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) return undefined;
  const [whole = "", fraction = ""] = value.split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return result <= 9_223_372_036_854_775_807n ? result.toString() : undefined;
}
export function signedHundredthsFromDecimal(value: string): string | undefined {
  const negative = value.startsWith("-");
  const magnitude = hundredthsFromDecimal(negative ? value.slice(1) : value);
  if (magnitude === undefined) return undefined;
  return negative && magnitude !== "0" ? `-${magnitude}` : magnitude;
}
export function decimalFromHundredths(value: unknown): string {
  const raw = String(value ?? "");
  if (!/^(0|[1-9]\d*)$/.test(raw) || (typeof value === "number" && !Number.isSafeInteger(value))) return "";
  const amount = BigInt(raw);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}

export function editorActions(editor: OfficeEditor, record: Readonly<Record<string, unknown>> | null): readonly string[] {
  if (!record) return editor.family === "membership" || editor.family === "organization" ? [] : ["create"];
  if (editor.family === "master" || editor.family === "membership" || editor.family === "organization") return ["update"];
  if (editor.family === "policy") return record["published_at"] === null ? ["update", "publish"] : ["retire"];
  const status = record["status"];
  if (status === "draft") return editor.kind === "standing_order" ? ["update", "publish"] : ["update", "publish", "cancel"];
  if (editor.family === "load" && status === "planned") return ["update", "cancel"];
  if (editor.kind === "standing_order") return status === "published" ? ["retire"] : [];
  if (editor.kind === "planned_order") return status === "published" ? ["cancel"] : [];
  return status === "completed" || status === "cancelled" ? [] : ["cancel"];
}
