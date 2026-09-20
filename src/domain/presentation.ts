export type DisplayRow = Readonly<Record<string, unknown>>;

/** Preserve database Int64 values before JSON parsing can round them. */
export function exactOfficeSelect(columns: readonly string[]): string {
  return columns.map((column) => column.endsWith("_minor") || column.endsWith("_minor_units") || column === "quantity"
    || column.endsWith("_quantity") || column === "version" ? `${column}:${column}::text` : column).join(",");
}

export function weekdayName(value: unknown): string {
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][Number(value) - 1] ?? "—";
}

const humanizedValueColumns = new Set([
  "acceptance_state",
  "actor_role_snapshot",
  "evidence_source",
  "finalization_state",
  "initial_evidence_source",
  "kind",
  "lifecycle_state",
  "method",
  "mode_snapshot",
  "payment_method_snapshot",
  "payment_status_snapshot",
  "price_mode",
  "role",
  "rounding_contract",
  "state",
  "status",
  "stock_bucket",
  "tax_mode",
  "upload_state",
  "valuation_source",
  "visibility",
]);

export function titleForColumn(column: string): string {
  const names: Readonly<Record<string, string>> = { product_id: "Product", customer_account_id: "Customer", shop_location_id: "Shop", driver_user_id: "Driver", shift_id: "Shift", price_rule_id: "Price rule", tax_rule_id: "Tax rule", planned_order_id: "Daily order", source_standing_order_id: "Standing order", is_active: "Active", rate_basis_points: "VAT rate", tax_rate_basis_points: "VAT rate", issued_number: "Document number", unit_amount_minor: "Unit price", unit_effective_amount_minor: "Unit price", total_gross_minor: "Total", currency_code: "Currency", customer_legal_name_snapshot: "Customer", payment_method_snapshot: "Payment method", payment_status_snapshot: "Payment status", product_sku_snapshot: "SKU", product_name_snapshot: "Product", description_snapshot: "Description", sku_snapshot: "SKU" };
  return names[column] ?? column.replace(/_minor$/, "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function exactMinorUnits(value: unknown, currency: unknown): string {
  if ((typeof value !== "string" && typeof value !== "number") || !/^-?\d+$/.test(String(value))) return "—";
  if (typeof value === "number" && !Number.isSafeInteger(value)) return "—";
  const raw = BigInt(String(value));
  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  const whole = absolute / 100n;
  const minor = (absolute % 100n).toString().padStart(2, "0");
  const code = typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : "GBP";
  const prefix = code === "GBP" ? "£" : `${code} `;
  return `${negative ? "−" : ""}${prefix}${whole.toLocaleString("en-GB")}.${minor}`;
}

export function displayValue(column: string, value: unknown, row: DisplayRow): string {
  if (value === null || value === undefined || value === "") return "—";
  const label = row[`${column}__label`];
  if (typeof label === "string" && label) return label;
  if (column === "weekday") return weekdayName(value);
  if (column.endsWith("_minor")) return exactMinorUnits(value, row["currency_code"]);
  if (column.endsWith("_basis_points") && (typeof value === "string" || typeof value === "number")) {
    const points = Number(value);
    return Number.isFinite(points) ? `${(points / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}%` : "—";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value))) {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: typeof row["__timezone"] === "string" ? row["__timezone"] : "Europe/London" }).format(new Date(value));
  }
  if (typeof value === "string") return humanizedValueColumns.has(column) ? value.replaceAll("_", " ") : value;
  if (typeof value === "number" || typeof value === "bigint") return value.toLocaleString("en-GB");
  const encoded = JSON.stringify(value);
  return encoded ?? "—";
}
