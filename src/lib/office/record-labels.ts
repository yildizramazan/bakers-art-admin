import "server-only";
import type { OfficeIdentity } from "@/domain/office";
import type { DisplayRow } from "@/domain/presentation";
import { weekdayName } from "@/domain/presentation";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type Database = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const references: Readonly<Record<string, Readonly<{ table: string; key?: string; labels: readonly string[] }>>> = {
  product_id: { table: "products", labels: ["sku", "name"] },
  customer_account_id: { table: "customer_accounts", labels: ["account_code", "legal_name"] },
  shop_location_id: { table: "shop_locations", labels: ["location_code", "display_name"] },
  driver_user_id: { table: "profiles", key: "user_id", labels: ["employee_id", "display_name"] },
  device_id: { table: "devices", labels: ["display_name"] },
  tax_rule_id: { table: "tax_rules", labels: ["code", "name"] },
  price_rule_id: { table: "price_rules", labels: ["product_id", "purpose", "scope"] },
  shift_id: { table: "shifts", labels: ["service_date", "status"] },
  planned_order_id: { table: "planned_orders", labels: ["service_date", "revision", "status"] },
  source_standing_order_id: { table: "standing_orders", labels: ["weekday", "revision", "status"] },
};

/** Preserve original IDs for commands while attaching role-authorized labels. */
export async function withRecordLabels(db: Database, identity: OfficeIdentity, rows: readonly DisplayRow[], columns: readonly string[]): Promise<readonly DisplayRow[]> {
  const labels = await Promise.all(columns.flatMap((column) => {
    const target = references[column];
    const ids = [...new Set(rows.flatMap((row) => typeof row[column] === "string" ? [row[column] as string] : []))];
    if (!target || !ids.length) return [];
    return [(async () => {
      const key = target.key ?? "id";
      const result = await db.from(target.table).select([key, ...target.labels].join(",")).eq("organization_id", identity.organizationID).in(key, ids);
      if (result.error) throw new Error("Related record names could not be loaded.");
      const related = (result.data ?? []) as unknown as readonly DisplayRow[];
      let products = new Map<string, string>();
      if (column === "price_rule_id" && related.length) {
        const productIDs = [...new Set(related.map((row) => String(row["product_id"])) )];
        const productsResult = await db.from("products").select("id,sku,name").eq("organization_id", identity.organizationID).in("id", productIDs);
        if (productsResult.error) throw new Error("Product names could not be loaded.");
        products = new Map((productsResult.data ?? []).map((row) => [row.id, `${row.sku} · ${row.name}`]));
      }
      return { column, names: new Map(related.map((row) => [String(row[key]), target.labels.map((label) => label === "weekday" ? weekdayName(row[label]) : label === "revision" ? `revision ${row[label]}` : products.get(String(row[label])) ?? row[label]).filter((value) => value != null).join(" · ").replaceAll("_", " ")])) };
    })()];
  }));
  return rows.map((row) => ({ ...row, __timezone: identity.timezoneName, ...Object.fromEntries(labels.flatMap(({ column, names }) => {
    const name = names.get(String(row[column]));
    return name ? [[`${column}__label`, name]] : [];
  })) }));
}
