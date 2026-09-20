import "server-only";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { decimalFromHundredths, editorActions, editorForKind, type Choice, type OfficeEditor } from "@/domain/office-editors";
import { canReviseOrder, copiedOrderLines, nextStandingOrderDate } from "@/domain/order-templates";
import { exactOfficeSelect, weekdayName } from "@/domain/presentation";
import { canonicalUUIDPattern } from "@/domain/office-commands";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EditorRow = Readonly<Record<string, unknown>>;
export interface RouteCopyData {
  readonly sourceRouteID: string; readonly version: string; readonly sourceDate: string;
  readonly notes: string | null; readonly shifts: readonly Choice[];
  readonly stops: readonly Readonly<{ id: string; sequence: string; label: string; deliveryNotes: string | null }>[];
}
export interface EditorLine { readonly id: string; readonly productID: string; readonly quantity: string; readonly sourceID: string }
export interface EditorData {
  readonly entityID: string; readonly requestID: string; readonly version: string;
  readonly values: Readonly<Record<string, string>>; readonly lines: readonly EditorLine[];
  readonly options: Readonly<Record<string, readonly Choice[]>>; readonly actions: readonly string[];
  readonly capabilities: readonly EditorRow[]; readonly returnPath: string; readonly organizationName: string;
  readonly notice?: Readonly<{ text: string; href: string; label: string }>;
}
type Database = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// Fetch all rows in bounded pages; never silently drop order lines or select options.
async function allRows(db: Database, organizationID: string, table: string, columns: string, filters: Readonly<Record<string, string>> = {}): Promise<readonly EditorRow[]> {
  const result: EditorRow[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    let query = db.from(table).select(exactOfficeSelect(columns.split(","))).eq("organization_id", organizationID).order("id").range(offset, offset + 499);
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    const { data, error } = await query;
    if (error) throw new Error("The editor's supporting records could not be loaded.");
    const rows = (data ?? []) as unknown as readonly EditorRow[];
    result.push(...rows);
    if (rows.length < 500) return result;
  }
  throw new Error("This selection exceeds 10,000 records. Narrow the catalogue before editing.");
}

const lookupDefinitions: Readonly<Record<string, Readonly<{ table: string; columns: string; label: readonly string[]; value?: string; parent?: string; filters?: Readonly<Record<string, string>> }>>> = {
  products: { table: "products", columns: "id,sku,name,is_active", label: ["sku", "name"] },
  customers: { table: "customer_accounts", columns: "id,account_code,legal_name,is_active", label: ["account_code", "legal_name"] },
  shops: { table: "shop_locations", columns: "id,location_code,display_name,customer_account_id,is_active", label: ["location_code", "display_name"], parent: "customer_account_id" },
  tax_rules: { table: "tax_rules", columns: "id,code,name,is_active", label: ["code", "name"] },
  tax_revisions: { table: "tax_rule_revisions", columns: "id,tax_rule_id,revision_number,rate_basis_points,published_at,is_active", label: ["tax_rule_id", "revision_number", "rate_basis_points"] },
  price_rules: { table: "price_rules", columns: "id,product_id,purpose,scope,customer_account_id,shop_location_id,is_active", label: ["product_id", "purpose", "scope", "customer_account_id", "shop_location_id"] },
  standing_orders: { table: "standing_orders", columns: "id,shop_location_id,weekday,revision,status", label: ["shop_location_id", "weekday", "revision", "status"] },
  drivers: { table: "profiles", columns: "id,user_id,employee_id,display_name,is_active", label: ["employee_id", "display_name"], value: "user_id" },
  shifts: { table: "shifts", columns: "id,driver_user_id,service_date,status", label: ["service_date", "status", "driver_user_id"], parent: "driver_user_id", filters: { status: "planned" } },
  devices: { table: "devices", columns: "id,user_id,display_name,installation_id,revoked_at", label: ["display_name", "installation_id"], parent: "user_id" },
};

export async function loadRouteCopyData(routeID: string): Promise<RouteCopyData> {
  if (!canonicalUUIDPattern.test(routeID)) notFound();
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") notFound();
  const db = await createSupabaseServerClient();
  const source = await db.from("routes").select("id,version:version::text,service_date,notes")
    .eq("organization_id", identity.organizationID).eq("id", routeID).maybeSingle();
  if (source.error) throw new Error("The source route could not be loaded.");
  if (!source.data) notFound();
  const [stops, shops, shifts, routes, profiles, memberships] = await Promise.all([
    allRows(db, identity.organizationID, "route_stops", "id,shop_location_id,stop_sequence:stop_sequence::text,delivery_notes", { route_id: routeID }),
    allRows(db, identity.organizationID, "shop_locations", "id,location_code,display_name,is_active"),
    allRows(db, identity.organizationID, "shifts", "id,driver_user_id,service_date", { status: "planned" }),
    allRows(db, identity.organizationID, "routes", "id,shift_id,status"),
    allRows(db, identity.organizationID, "profiles", "id,user_id,display_name,employee_id", { is_active: "true" }),
    allRows(db, identity.organizationID, "organization_memberships", "id,user_id", { role: "driver", status: "active" }),
  ]);
  if (stops.length > 500) throw new Error("This route exceeds the supported 500 stops.");
  const assigned = new Set(routes.filter((row) => row["status"] !== "cancelled").map((row) => row["shift_id"]));
  const drivers = new Set(memberships.map((row) => row["user_id"]));
  const driverNames = new Map(profiles.filter((row) => drivers.has(row["user_id"]))
    .map((row) => [row["user_id"], `${row["display_name"]} · ${row["employee_id"]}`]));
  const shopNames = new Map(shops.map((row) => [row["id"], `${row["location_code"]} · ${row["display_name"]}${row["is_active"] === false ? " (inactive)" : ""}`]));
  return {
    sourceRouteID: routeID, version: String(source.data.version), sourceDate: source.data.service_date, notes: source.data.notes,
    shifts: shifts.filter((row) => !assigned.has(row["id"]) && driverNames.has(row["driver_user_id"]))
      .map((row) => ({ value: String(row["id"]), label: `${row["service_date"]} · ${driverNames.get(row["driver_user_id"])} · ${String(row["id"]).slice(0, 8)}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    stops: [...stops].sort((a, b) => BigInt(String(a["stop_sequence"])) < BigInt(String(b["stop_sequence"])) ? -1 : 1)
      .map((row) => ({ id: String(row["id"]), sequence: String(row["stop_sequence"]),
        label: shopNames.get(row["shop_location_id"]) ?? "Unavailable shop", deliveryNotes: row["delivery_notes"] == null ? null : String(row["delivery_notes"]) })),
  };
}

export async function loadEditorData(editor: OfficeEditor, recordID: string, copyID?: string): Promise<EditorData> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") notFound();
  const isNew = recordID === "new";
  if ((!isNew && !canonicalUUIDPattern.test(recordID)) || (isNew && ["membership", "organization"].includes(editor.family))) notFound();
  if (copyID && (!isNew || !["policy", "order"].includes(editor.family) || !canonicalUUIDPattern.test(copyID))) notFound();
  const db = await createSupabaseServerClient();
  let record: EditorRow | null = null;
  let profile: EditorRow | null = null;
  if (!isNew || copyID) {
    if (editor.family === "membership") {
      const result = await db.from("profiles").select("id,user_id,display_name,employee_id,is_active").eq("organization_id", identity.organizationID).eq("id", recordID).maybeSingle();
      if (result.error) throw new Error("The user could not be loaded.");
      profile = result.data;
      if (!profile) notFound();
    }
    const extraColumns = editor.family === "policy" ? ["published_at"] : ["status"];
    const columns = [...new Set(["id", "version", ...editor.fields.filter((f) => f.name !== "revision_type" && !(editor.family === "membership" && ["profile_id", "display_name", "employee_id", "is_active"].includes(f.name))).map((f) => f.name), ...(["master", "organization"].includes(editor.family) ? [] : extraColumns)])];
    const result = await db.from(editor.table).select(exactOfficeSelect(columns)).eq(editor.table === "organizations" ? "id" : "organization_id", identity.organizationID).eq(profile ? "user_id" : "id", profile ? String(profile["user_id"]) : copyID ?? recordID).maybeSingle();
    if (result.error) throw new Error(`${editor.title} could not be loaded.`);
    record = result.data as unknown as EditorRow | null;
    if (!record) notFound();
  }
  if (copyID && editor.family === "order" && !canReviseOrder(editor.kind, record?.["status"])) notFound();
  const entityID = !isNew && record ? String(record["id"]) : randomUUID();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: identity.timezoneName, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const combined: EditorRow = { ...record, ...(profile ? { ...profile, profile_id: profile["id"] } : {}) };
  const values: Record<string, string> = {};
  for (const field of editor.fields) {
    const raw = combined[field.name];
    values[field.name] = raw === undefined ? (field.kind === "date" && field.required ? today : field.initial)
      : raw === null ? "" : field.kind === "money" || field.kind === "percent" ? decimalFromHundredths(raw)
        : Array.isArray(raw) ? raw.join(",") : String(raw);
  }
  if (copyID && (editor.family === "policy" || editor.kind === "standing_order")) {
    const tomorrow = new Date(`${today}T00:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    values["effective_from"] = values["effective_until"] && values["effective_until"] > today ? values["effective_until"] : tomorrow.toISOString().slice(0, 10);
    values["effective_until"] = "";
  }
  if (copyID && editor.kind === "planned_order") values["previous_revision_id"] = copyID;
  const lookupNames = new Set(editor.fields.flatMap((f) => f.lookup ? [f.lookup] : []));
  if (editor.lineTable) lookupNames.add("products");
  // Include readable labels for references used by the price/tax/shift choices.
  if (lookupNames.has("price_rules")) ["products", "customers", "shops"].forEach((name) => lookupNames.add(name));
  if (lookupNames.has("tax_revisions")) lookupNames.add("tax_rules");
  if (lookupNames.has("standing_orders")) lookupNames.add("shops");
  const optionRows = Object.fromEntries(await Promise.all([...lookupNames].map(async (name) => {
    const definition = lookupDefinitions[name];
    if (!definition) throw new Error("Unknown editor lookup.");
    return [name, await allRows(db, identity.organizationID, definition.table, definition.columns, definition.filters)] as const;
  })));
  let driverIDs: Set<string> | undefined;
  if (lookupNames.has("drivers")) driverIDs = new Set((await allRows(db, identity.organizationID, "organization_memberships", "id,user_id", { role: "driver", status: "active" })).map((row) => String(row["user_id"])));
  const names = new Map<string, string>();
  for (const [name, rows] of Object.entries(optionRows)) {
    const definition = lookupDefinitions[name];
    if (!definition) continue;
    for (const row of rows) names.set(String(row[definition.value ?? "id"]), definition.label.map((key) => row[key]).filter((value) => value != null).join(" · "));
  }
  const options: Record<string, readonly Choice[]> = {};
  for (const [name, rows] of Object.entries(optionRows)) {
    const definition = lookupDefinitions[name];
    if (!definition) continue;
    options[name] = rows.filter((row) => name !== "drivers" || driverIDs?.has(String(row["user_id"]))).filter((row) => name !== "tax_revisions" || row["published_at"] !== null).map((row) => ({
      value: String(row[definition.value ?? "id"]),
      label: definition.label.map((key) => key === "rate_basis_points" ? `${decimalFromHundredths(row[key])}%` : key === "weekday" ? weekdayName(row[key]) : key === "revision" ? `revision ${row[key]}` : names.get(String(row[key])) ?? row[key]).filter((value) => value != null && value !== "").join(" · ") + (row["is_active"] === false ? " (inactive)" : ""),
      ...(definition.parent ? { parentID: String(row[definition.parent]) } : {}),
    })).sort((a, b) => a.label.localeCompare(b.label, "en-GB"));
  }
  const rawLines = record && editor.lineTable && editor.lineParent ? await allRows(db, identity.organizationID, editor.lineTable, `id,product_id,${editor.family === "load" ? "expected_quantity" : "planned_quantity,display_order"}${editor.kind === "planned_order" ? ",source_standing_order_line_id" : ""}`, { [editor.lineParent]: copyID ?? entityID }) : [];
  if (rawLines.length > 500) throw new Error("This order exceeds the supported 500 lines and cannot be edited safely.");
  const lines = copyID && editor.family === "order" ? copiedOrderLines(rawLines, "revision", randomUUID) : [...rawLines].sort((a, b) => Number(a["display_order"] ?? 0) - Number(b["display_order"] ?? 0)).map((row) => ({ id: String(row["id"]), productID: String(row["product_id"]), quantity: String(row[editor.family === "load" ? "expected_quantity" : "planned_quantity"]), sourceID: String(row["source_standing_order_line_id"] ?? "") }));
  if (editor.lineTable && isNew && !copyID) lines.push({ id: randomUUID(), productID: "", quantity: "1", sourceID: "" });
  const capabilities = record && editor.family === "membership" ? await allRows(db, identity.organizationID, "membership_capabilities", "id,capability,enabled,limit_basis_points,limit_minor_units", { membership_id: entityID }) : [];
  return { entityID, requestID: randomUUID(), version: !isNew && record ? String(record["version"]) : "0", values, lines, options, actions: editorActions(editor, isNew ? null : record), capabilities, returnPath: isNew ? `/office/${editor.section}` : `/office/${editor.section}/${recordID}`, organizationName: identity.organizationName };
}

export async function loadDailyOrderFromTemplate(templateID: string): Promise<EditorData> {
  if (!canonicalUUIDPattern.test(templateID)) notFound();
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin") notFound();
  const db = await createSupabaseServerClient();
  const source = await db.from("standing_orders").select("id,customer_account_id,shop_location_id,weekday,effective_from,effective_until,status,notes").eq("organization_id", identity.organizationID).eq("id", templateID).maybeSingle();
  if (source.error) throw new Error("The standing order could not be loaded.");
  if (!source.data || source.data.status !== "published") notFound();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: identity.timezoneName, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const serviceDate = nextStandingOrderDate(today, source.data.effective_from, source.data.effective_until, source.data.weekday);
  if (!serviceDate) throw new Error("This template has no remaining delivery dates. Create and publish its next revision first.");
  const sourceLines = await allRows(db, identity.organizationID, "standing_order_lines", "id,product_id,planned_quantity,display_order", { standing_order_id: templateID });
  if (!sourceLines.length || sourceLines.length > 500) throw new Error("A standing order must contain between 1 and 500 product lines.");
  const data = await loadEditorData(editorForKind("planned_order")!, "new");
  const existing = await db.from("planned_orders").select("id").eq("organization_id", identity.organizationID).eq("source_standing_order_id", templateID).eq("service_date", serviceDate).order("revision", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw new Error("Existing dated orders could not be checked.");
  return { ...data, values: { ...data.values, customer_account_id: source.data.customer_account_id, shop_location_id: source.data.shop_location_id, service_date: serviceDate, source_standing_order_id: templateID, notes: source.data.notes ?? "" }, lines: copiedOrderLines(sourceLines, "template", randomUUID), returnPath: `/office/standing-orders/${templateID}`, ...(existing.data ? { notice: { text: `A daily order already exists for ${serviceDate}. Open it to review or revise it, or choose another delivery date below.`, href: `/office/daily-orders/${existing.data.id}`, label: "Open existing daily order" } } : {}) };
}

export interface RouteStopData {
  readonly routeID: string; readonly version: string; readonly status: string;
  readonly requestID: string; readonly newStopID: string; readonly changeID: string;
  readonly stops: readonly EditorRow[]; readonly customers: readonly Choice[];
  readonly shops: readonly Choice[]; readonly orders: readonly Choice[];
}

export async function loadRouteStopData(routeID: string): Promise<RouteStopData> {
  const identity = await requireOfficeIdentity();
  if (identity.role !== "owner_admin" || !canonicalUUIDPattern.test(routeID)) notFound();
  const db = await createSupabaseServerClient();
  const result = await db.from("routes").select("id,version:version::text,status,service_date").eq("organization_id", identity.organizationID).eq("id", routeID).maybeSingle();
  if (result.error) throw new Error("The route could not be loaded.");
  if (!result.data) notFound();
  const [stops, customers, shops, orders] = await Promise.all([
    allRows(db, identity.organizationID, "route_stops", "id,stop_sequence,status,customer_account_id,shop_location_id,planned_order_id,delivery_notes,expected_payment_details", { route_id: routeID }),
    allRows(db, identity.organizationID, "customer_accounts", "id,account_code,legal_name"),
    allRows(db, identity.organizationID, "shop_locations", "id,location_code,display_name,customer_account_id"),
    allRows(db, identity.organizationID, "planned_orders", "id,shop_location_id,service_date,revision,status", { service_date: result.data.service_date, status: "published" }),
  ]);
  if (stops.length > 500) throw new Error("This route exceeds the supported 500 stops.");
  const shopNames = new Map(shops.map((shop) => [String(shop["id"]), String(shop["display_name"])]));
  return {
    routeID, version: String(result.data.version), status: result.data.status, requestID: randomUUID(), newStopID: randomUUID(), changeID: randomUUID(),
    stops: [...stops].sort((a, b) => Number(a["stop_sequence"]) - Number(b["stop_sequence"])).map((stop) => ({ ...stop, label: shopNames.get(String(stop["shop_location_id"])) ?? "Shop" })),
    customers: customers.map((row) => ({ value: String(row["id"]), label: `${row["account_code"]} · ${row["legal_name"]}` })),
    shops: shops.map((row) => ({ value: String(row["id"]), label: `${row["location_code"]} · ${row["display_name"]}`, parentID: String(row["customer_account_id"]) })),
    orders: orders.map((row) => ({ value: String(row["id"]), label: `${shopNames.get(String(row["shop_location_id"])) ?? "Shop"} · ${row["service_date"]} · revision ${row["revision"]}`, parentID: String(row["shop_location_id"]) })),
  };
}
