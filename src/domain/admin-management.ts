import { isCalendarDate } from "./dates.ts";
import { canonicalUUIDPattern } from "./office-commands.ts";

export type JsonObject = Readonly<Record<string, unknown>>;

export interface ManagementCommandInput {
  readonly requestID: string;
  readonly entityID: string;
  readonly expectedVersion: string;
  readonly action: string;
  readonly payload: JsonObject;
}

export interface TypedManagementCommandInput extends ManagementCommandInput {
  readonly type: string;
}

const canonicalUnsigned = /^(0|[1-9]\d*)$/;
const canonicalQuantity = /^(0|[1-9]\d{0,15})$/;
const maximumInt64 = 9_223_372_036_854_775_807n;

function single(formData: FormData, name: string): string | undefined {
  const values = formData.getAll(name);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : undefined;
}

function many(formData: FormData, name: string): readonly string[] | undefined {
  const values = formData.getAll(name);
  return values.every((value) => typeof value === "string") ? values as readonly string[] : undefined;
}

function required(formData: FormData, name: string, maximum: number): string | undefined {
  const value = single(formData, name)?.trim();
  return value && value.length <= maximum ? value : undefined;
}

function optional(formData: FormData, name: string, maximum: number): string | null | undefined {
  const value = single(formData, name);
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.length <= maximum ? trimmed : undefined;
}

function uuidText(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && canonicalUUIDPattern.test(normalized) ? normalized : undefined;
}

function uuid(formData: FormData, name: string): string | undefined {
  return uuidText(single(formData, name));
}

function optionalUUID(formData: FormData, name: string): string | null | undefined {
  const raw = single(formData, name);
  if (raw === undefined) return undefined;
  return raw.trim() === "" ? null : uuidText(raw);
}

function booleanValue(formData: FormData, name: string): boolean | undefined {
  const raw = single(formData, name);
  return raw === "true" ? true : raw === "false" ? false : undefined;
}

function optionalBoolean(formData: FormData, name: string): boolean | null | undefined {
  const raw = single(formData, name);
  return raw === "" ? null : raw === "true" ? true : raw === "false" ? false : undefined;
}

function integer(formData: FormData, name: string, maximum: number, minimum = 0): number | undefined {
  const raw = single(formData, name);
  if (!raw || !canonicalUnsigned.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : undefined;
}

function optionalInteger(formData: FormData, name: string, maximum: number): number | null | undefined {
  const raw = single(formData, name);
  if (raw === undefined) return undefined;
  return raw === "" ? null : integer(formData, name, maximum);
}

function exactNonnegative(formData: FormData, name: string, maximum = maximumInt64): string | undefined {
  const raw = single(formData, name);
  if (!raw || !canonicalUnsigned.test(raw)) return undefined;
  const value = BigInt(raw);
  return value <= maximum ? value.toString() : undefined;
}

function optionalExactNonnegative(formData: FormData, name: string): string | null | undefined {
  const raw = single(formData, name);
  if (raw === undefined) return undefined;
  return raw === "" ? null : exactNonnegative(formData, name);
}

function date(formData: FormData, name: string): string | undefined {
  const value = single(formData, name);
  return value && isCalendarDate(value) ? value : undefined;
}

function optionalDate(formData: FormData, name: string): string | null | undefined {
  const value = single(formData, name);
  if (value === undefined) return undefined;
  return value === "" ? null : isCalendarDate(value) ? value : undefined;
}

function base(formData: FormData, allowedActions: readonly string[]): ManagementCommandInput | undefined {
  const requestID = uuid(formData, "request_id");
  const entityID = uuid(formData, "entity_id");
  const expectedVersion = exactNonnegative(formData, "expected_version");
  const action = required(formData, "command_action", 30);
  if (!requestID || !entityID || expectedVersion === undefined || !action || !allowedActions.includes(action) || single(formData, "confirm_command") !== action) return undefined;
  return { requestID, entityID, expectedVersion, action, payload: {} };
}

function reason(formData: FormData): string | undefined {
  return required(formData, "reason", 1000);
}

function enumValue<T extends string>(formData: FormData, name: string, values: readonly T[]): T | undefined {
  const raw = single(formData, name);
  return values.find((value) => value === raw);
}

export const masterEntityTypes = ["product", "product_barcode", "customer_account", "shop_location", "tax_rule", "price_rule"] as const;
export type MasterEntityType = (typeof masterEntityTypes)[number];

export function parseMasterDataCommand(formData: FormData): TypedManagementCommandInput | undefined {
  const command = base(formData, ["create", "update"]);
  const type = enumValue(formData, "entity_type", masterEntityTypes);
  const changeReason = reason(formData);
  if (!command || !type || !changeReason || (command.action === "create") !== (command.expectedVersion === "0")) return undefined;
  let payload: Record<string, unknown> | undefined;
  if (type === "product") {
    const name = required(formData, "name", 300), sku = required(formData, "sku", 120), category = required(formData, "category", 200), unit = required(formData, "unit", 80);
    const description = optional(formData, "description", 4000), defaultTaxRuleID = optionalUUID(formData, "default_tax_rule_id"), displayOrder = integer(formData, "display_order", 100_000_000), imagePath = optional(formData, "image_storage_path", 1000), isActive = booleanValue(formData, "is_active");
    if (!name || !sku || !category || !unit || description === undefined || defaultTaxRuleID === undefined || displayOrder === undefined || imagePath === undefined || imagePath?.split("/").includes("..") || isActive === undefined) return undefined;
    payload = { category, default_tax_rule_id: defaultTaxRuleID, description, display_order: displayOrder, image_storage_path: imagePath, is_active: isActive, name, reason: changeReason, sku, unit };
  } else if (type === "product_barcode") {
    const productID = uuid(formData, "product_id"), barcode = required(formData, "barcode_value", 256), symbology = required(formData, "symbology", 64), isActive = booleanValue(formData, "is_active");
    if (!productID || !barcode || !symbology || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(symbology) || isActive === undefined) return undefined;
    payload = { barcode_value: barcode, is_active: isActive, product_id: productID, reason: changeReason, symbology };
  } else if (type === "customer_account") {
    const accountCode = required(formData, "account_code", 120), legalName = required(formData, "legal_name", 300), country = required(formData, "billing_country_code", 2), terms = integer(formData, "payment_terms_days", 3650), isActive = booleanValue(formData, "is_active");
    const customerName = booleanValue(formData, "default_require_customer_name"), signature = booleanValue(formData, "default_require_signature"), photo = booleanValue(formData, "default_require_photo");
    const optionalNames = ["trading_name", "billing_address_line_1", "billing_address_line_2", "billing_locality", "billing_region", "billing_postal_code", "contact_email", "contact_name", "contact_phone", "payment_instructions"] as const;
    const optionalValues = optionalNames.map((name) => optional(formData, name, 2000));
    if (!accountCode || !legalName || !country || !/^[A-Z]{2}$/.test(country) || terms === undefined || isActive === undefined || customerName === undefined || signature === undefined || photo === undefined || optionalValues.includes(undefined)) return undefined;
    payload = Object.fromEntries(optionalNames.map((name, index) => [name, optionalValues[index] ?? null]));
    Object.assign(payload, { account_code: accountCode, billing_country_code: country, default_require_customer_name: customerName, default_require_photo: photo, default_require_signature: signature, is_active: isActive, legal_name: legalName, payment_terms_days: terms, reason: changeReason });
  } else if (type === "shop_location") {
    const customerID = uuid(formData, "customer_account_id"), locationCode = required(formData, "location_code", 300), displayName = required(formData, "display_name", 300), address1 = required(formData, "address_line_1", 1000), locality = required(formData, "locality", 500), postalCode = required(formData, "postal_code", 100), country = required(formData, "country_code", 2), isActive = booleanValue(formData, "is_active");
    const optionalNames = ["address_line_2", "region", "contact_name", "contact_phone", "delivery_notes", "access_notes", "route_notes", "payment_instructions_override"] as const;
    const optionalValues = optionalNames.map((name) => optional(formData, name, 4000));
    const rawLatitude = single(formData, "latitude"), rawLongitude = single(formData, "longitude");
    const latitude = rawLatitude === "" ? null : rawLatitude === undefined ? undefined : Number(rawLatitude);
    const longitude = rawLongitude === "" ? null : rawLongitude === undefined ? undefined : Number(rawLongitude);
    const terms = optionalInteger(formData, "payment_terms_days_override", 3650), customerName = optionalBoolean(formData, "require_customer_name_override"), signature = optionalBoolean(formData, "require_signature_override"), photo = optionalBoolean(formData, "require_photo_override");
    if (!customerID || !locationCode || !displayName || !address1 || !locality || !postalCode || !country || !/^[A-Z]{2}$/.test(country) || isActive === undefined || optionalValues.includes(undefined) || terms === undefined || customerName === undefined || signature === undefined || photo === undefined || latitude === undefined || longitude === undefined || (latitude === null) !== (longitude === null) || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) return undefined;
    payload = Object.fromEntries(optionalNames.map((name, index) => [name, optionalValues[index] ?? null]));
    Object.assign(payload, { address_line_1: address1, country_code: country, customer_account_id: customerID, display_name: displayName, is_active: isActive, latitude, locality, location_code: locationCode, longitude, payment_terms_days_override: terms, postal_code: postalCode, reason: changeReason, require_customer_name_override: customerName, require_photo_override: photo, require_signature_override: signature });
  } else if (type === "tax_rule") {
    const code = required(formData, "code", 80), name = required(formData, "name", 300), jurisdiction = required(formData, "jurisdiction_code", 2), category = required(formData, "category_code", 80), isActive = booleanValue(formData, "is_active");
    if (!code || !name || !jurisdiction || !/^[A-Z]{2}$/.test(jurisdiction) || !category || isActive === undefined) return undefined;
    payload = { category_code: category, code, is_active: isActive, jurisdiction_code: jurisdiction, name, reason: changeReason };
  } else {
    const productID = uuid(formData, "product_id"), purpose = enumValue(formData, "purpose", ["sale", "return_credit"] as const), scope = enumValue(formData, "scope", ["organization", "customer_account", "shop_location"] as const), customerID = optionalUUID(formData, "customer_account_id"), shopID = optionalUUID(formData, "shop_location_id"), isActive = booleanValue(formData, "is_active");
    if (!productID || !purpose || !scope || customerID === undefined || shopID === undefined || isActive === undefined || (scope === "organization" && (customerID !== null || shopID !== null)) || (scope === "customer_account" && (!customerID || shopID !== null)) || (scope === "shop_location" && (customerID !== null || !shopID))) return undefined;
    payload = { customer_account_id: customerID, is_active: isActive, product_id: productID, purpose, reason: changeReason, scope, shop_location_id: shopID };
  }
  return { ...command, type, payload };
}

export const policyRevisionTypes = ["organization_settings", "tax_rule", "price_rule"] as const;

export function parsePolicyRevisionCommand(formData: FormData): TypedManagementCommandInput | undefined {
  const command = base(formData, ["create", "update", "publish", "retire"]), type = enumValue(formData, "revision_type", policyRevisionTypes), changeReason = reason(formData);
  if (!command || !type || !changeReason || (command.action === "create") !== (command.expectedVersion === "0")) return undefined;
  if (command.action === "retire") {
    const effectiveUntil = date(formData, "effective_until");
    return effectiveUntil ? { ...command, type, payload: { effective_until: effectiveUntil, reason: changeReason } } : undefined;
  }
  const effectiveFrom = date(formData, "effective_from"), effectiveUntil = optionalDate(formData, "effective_until"), isActive = booleanValue(formData, "is_active");
  if (!effectiveFrom || effectiveUntil === undefined || (effectiveUntil !== null && effectiveUntil <= effectiveFrom) || isActive === undefined) return undefined;
  let payload: Record<string, unknown>;
  if (type === "organization_settings") {
    const currency = required(formData, "currency_code", 3), timezone = required(formData, "timezone_name", 100), threshold = optionalExactNonnegative(formData, "manager_approval_threshold_minor"), discount = integer(formData, "driver_max_discount_basis_points", 10_000), pod = enumValue(formData, "pod_requirement_default", ["none", "customer_name", "signature", "photo", "customer_name_and_signature", "customer_name_and_photo", "signature_and_photo", "all"] as const);
    const scannerRaw = single(formData, "scanner_symbologies");
    const scanner = scannerRaw?.split(",").map((value) => value.trim()).filter(Boolean);
    const flagNames = ["automatic_route_optimization_enabled", "card_payments_enabled", "driver_price_override_enabled", "driver_stop_reordering_enabled", "load_confirmation_required", "waste_tracking_enabled"] as const;
    const flags = flagNames.map((name) => booleanValue(formData, name));
    if (!currency || !/^[A-Z]{3}$/.test(currency) || !timezone || threshold === undefined || discount === undefined || !pod || !scanner || scanner.length < 1 || scanner.length > 20 || new Set(scanner).size !== scanner.length || scanner.some((value) => !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)) || flags.includes(undefined)) return undefined;
    try { new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(); } catch { return undefined; }
    payload = Object.fromEntries(flagNames.map((name, index) => [name, flags[index]]));
    Object.assign(payload, { currency_code: currency, direct_m832_printing_enabled: false, driver_max_discount_basis_points: discount, effective_from: effectiveFrom, effective_until: effectiveUntil, is_active: isActive, manager_approval_threshold_minor: threshold, pod_requirement_default: pod, reason: changeReason, scanner_symbologies: scanner, tax_rounding_contract: "half_up_per_line_v1", timezone_name: timezone });
  } else if (type === "tax_rule") {
    const ruleID = uuid(formData, "tax_rule_id"), rate = integer(formData, "rate_basis_points", 10_000);
    if (!ruleID || rate === undefined) return undefined;
    payload = { effective_from: effectiveFrom, effective_until: effectiveUntil, is_active: isActive, rate_basis_points: rate, reason: changeReason, tax_rule_id: ruleID };
  } else {
    const ruleID = uuid(formData, "price_rule_id"), amount = exactNonnegative(formData, "unit_amount_minor"), currency = required(formData, "currency_code", 3), mode = enumValue(formData, "tax_mode", ["tax_inclusive", "tax_exclusive"] as const), taxRevisionID = uuid(formData, "tax_rule_revision_id");
    if (!ruleID || amount === undefined || !currency || !/^[A-Z]{3}$/.test(currency) || !mode || !taxRevisionID) return undefined;
    payload = { currency_code: currency, effective_from: effectiveFrom, effective_until: effectiveUntil, is_active: isActive, price_rule_id: ruleID, reason: changeReason, tax_mode: mode, tax_rule_revision_id: taxRevisionID, unit_amount_minor: amount };
  }
  return { ...command, type, payload };
}

function orderLines(formData: FormData, planned: boolean): readonly JsonObject[] | undefined {
  const ids = many(formData, "line_id"), products = many(formData, "line_product_id"), quantities = many(formData, "line_quantity"), orders = many(formData, "line_display_order"), sources = planned ? many(formData, "line_source_id") : undefined;
  if (!ids || !products || !quantities || !orders || ids.length < 1 || ids.length > 500 || products.length !== ids.length || quantities.length !== ids.length || orders.length !== ids.length || (planned && (!sources || sources.length !== ids.length))) return undefined;
  const result: JsonObject[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = uuidText(ids[index]), productID = uuidText(products[index]), quantity = quantities[index], displayOrder = orders[index];
    const source = planned ? (sources?.[index]?.trim() === "" ? null : uuidText(sources?.[index])) : undefined;
    if (!id || !productID || !quantity || !canonicalQuantity.test(quantity) || quantity === "0" || BigInt(quantity) > 9_000_000_000_000_000n || !displayOrder || !canonicalUnsigned.test(displayOrder) || Number(displayOrder) > 100_000_000 || (planned && source === undefined)) return undefined;
    result.push(planned ? { display_order: Number(displayOrder), id, planned_quantity: BigInt(quantity).toString(), product_id: productID, source_standing_order_line_id: source } : { display_order: Number(displayOrder), id, planned_quantity: BigInt(quantity).toString(), product_id: productID });
  }
  if (new Set(result.map((line) => line["id"])).size !== result.length || new Set(result.map((line) => line["product_id"])).size !== result.length) return undefined;
  return result;
}

export function parseOrderRevisionCommand(formData: FormData): TypedManagementCommandInput | undefined {
  const command = base(formData, ["create", "update", "publish", "retire", "cancel"]), type = enumValue(formData, "order_type", ["standing_order", "planned_order"] as const), changeReason = reason(formData);
  if (!command || !type || !changeReason || (command.action === "create") !== (command.expectedVersion === "0") || (type === "standing_order" && command.action === "cancel") || (type === "planned_order" && command.action === "retire")) return undefined;
  if (command.action === "publish" || command.action === "cancel") return { ...command, type, payload: { reason: changeReason } };
  if (command.action === "retire") {
    const effectiveUntil = date(formData, "effective_until");
    return effectiveUntil ? { ...command, type, payload: { effective_until: effectiveUntil, reason: changeReason } } : undefined;
  }
  const customerID = uuid(formData, "customer_account_id"), shopID = uuid(formData, "shop_location_id"), notes = optional(formData, "notes", 4000), lines = orderLines(formData, type === "planned_order");
  if (!customerID || !shopID || notes === undefined || !lines) return undefined;
  let payload: JsonObject;
  if (type === "standing_order") {
    const templateKey = optionalUUID(formData, "template_key"), weekday = integer(formData, "weekday", 7, 1), effectiveFrom = date(formData, "effective_from"), effectiveUntil = optionalDate(formData, "effective_until");
    if (templateKey === undefined || (command.action === "update" && templateKey === null) || weekday === undefined || !effectiveFrom || effectiveUntil === undefined || (effectiveUntil !== null && effectiveUntil <= effectiveFrom)) return undefined;
    payload = { customer_account_id: customerID, effective_from: effectiveFrom, effective_until: effectiveUntil, lines, notes, reason: changeReason, shop_location_id: shopID, template_key: templateKey, weekday };
  } else {
    const orderKey = optionalUUID(formData, "order_key"), previousID = optionalUUID(formData, "previous_revision_id"), serviceDate = date(formData, "service_date"), sourceStandingID = optionalUUID(formData, "source_standing_order_id");
    if (orderKey === undefined || previousID === undefined || !serviceDate || sourceStandingID === undefined || (command.action === "create" && ((orderKey === null) !== (previousID === null))) || (command.action === "update" && orderKey === null)) return undefined;
    payload = { customer_account_id: customerID, lines, notes, order_key: orderKey, previous_revision_id: previousID, reason: changeReason, service_date: serviceDate, shop_location_id: shopID, source_standing_order_id: sourceStandingID };
  }
  return { ...command, type, payload };
}

export function parseRouteCommand(formData: FormData): ManagementCommandInput | undefined {
  const command = base(formData, ["create", "update", "publish", "cancel"]), changeReason = reason(formData);
  if (!command || !changeReason || (command.action === "create") !== (command.expectedVersion === "0")) return undefined;
  if (command.action === "publish" || command.action === "cancel") return { ...command, payload: { reason: changeReason } };
  const driverID = uuid(formData, "driver_user_id"), shiftID = uuid(formData, "shift_id"), serviceDate = date(formData, "service_date"), notes = optional(formData, "notes", 4000);
  return driverID && shiftID && serviceDate && notes !== undefined ? { ...command, payload: { driver_user_id: driverID, notes, reason: changeReason, service_date: serviceDate, shift_id: shiftID } } : undefined;
}

export interface RouteCopyInput {
  readonly requestID: string; readonly sourceRouteID: string; readonly expectedSourceVersion: string;
  readonly routeID: string; readonly shiftID: string; readonly reason: string;
}

export function parseRouteCopy(formData: FormData): RouteCopyInput | undefined {
  const requestID = uuid(formData, "request_id"), sourceRouteID = uuid(formData, "source_route_id");
  const routeID = uuid(formData, "route_id"), shiftID = uuid(formData, "shift_id");
  const expectedSourceVersion = exactNonnegative(formData, "expected_source_version"), changeReason = reason(formData);
  return requestID && sourceRouteID && routeID && routeID !== sourceRouteID && shiftID && expectedSourceVersion && expectedSourceVersion !== "0" && changeReason
    ? { requestID, sourceRouteID, routeID, shiftID, expectedSourceVersion, reason: changeReason } : undefined;
}

export function parseRouteStopCommand(formData: FormData): ManagementCommandInput | undefined {
  const command = base(formData, ["add", "update", "remove", "reorder"]), changeReason = reason(formData);
  if (!command || !changeReason || command.expectedVersion === "0") return undefined;
  if (command.action === "remove") {
    const stopID = uuid(formData, "stop_id");
    return stopID ? { ...command, payload: { reason: changeReason, stop_id: stopID } } : undefined;
  }
  if (command.action === "reorder") {
    const changeID = uuid(formData, "change_id"), raw = single(formData, "ordered_stop_ids");
    const ids = raw?.split(/[\s,]+/).filter(Boolean).map((value) => uuidText(value));
    if (!changeID || !ids || ids.length < 1 || ids.length > 500 || ids.some((id) => !id) || new Set(ids).size !== ids.length) return undefined;
    return { ...command, payload: { change_id: changeID, ordered_stop_ids: ids as readonly string[], reason: changeReason } };
  }
  const customerID = uuid(formData, "customer_account_id"), shopID = uuid(formData, "shop_location_id"), plannedID = optionalUUID(formData, "planned_order_id"), deliveryNotes = optional(formData, "delivery_notes", 4000), payment = optional(formData, "expected_payment_details", 4000);
  if (!customerID || !shopID || plannedID === undefined || deliveryNotes === undefined || payment === undefined) return undefined;
  if (command.action === "add") {
    const id = uuid(formData, "stop_id"), sequence = exactNonnegative(formData, "stop_sequence", 9_000_000_000_000_000n);
    if (!id || !sequence || sequence === "0") return undefined;
    return { ...command, payload: { customer_account_id: customerID, delivery_notes: deliveryNotes, expected_payment_details: payment, id, planned_order_id: plannedID, reason: changeReason, shop_location_id: shopID, stop_sequence: sequence } };
  }
  const stopID = uuid(formData, "stop_id");
  return stopID ? { ...command, payload: { customer_account_id: customerID, delivery_notes: deliveryNotes, expected_payment_details: payment, planned_order_id: plannedID, reason: changeReason, shop_location_id: shopID, stop_id: stopID } } : undefined;
}

function shiftLines(formData: FormData): readonly JsonObject[] | undefined {
  const ids = many(formData, "line_id"), products = many(formData, "line_product_id"), quantities = many(formData, "line_quantity");
  if (!ids || !products || !quantities || ids.length > 500 || products.length !== ids.length || quantities.length !== ids.length) return undefined;
  const lines: JsonObject[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = uuidText(ids[index]), productID = uuidText(products[index]), quantity = quantities[index];
    if (!id || !productID || !quantity || !canonicalQuantity.test(quantity) || BigInt(quantity) > 9_000_000_000_000_000n) return undefined;
    lines.push({ expected_quantity: BigInt(quantity).toString(), id, product_id: productID });
  }
  return new Set(lines.map((line) => line["id"])).size === lines.length && new Set(lines.map((line) => line["product_id"])).size === lines.length ? lines : undefined;
}

export function parseShiftLoadCommand(formData: FormData): ManagementCommandInput | undefined {
  const command = base(formData, ["create", "update", "cancel"]), changeReason = reason(formData);
  if (!command || !changeReason || (command.action === "create") !== (command.expectedVersion === "0")) return undefined;
  if (command.action === "cancel") return { ...command, payload: { reason: changeReason } };
  const deviceID = optionalUUID(formData, "active_device_id"), driverID = uuid(formData, "driver_user_id"), lines = shiftLines(formData), notes = optional(formData, "notes", 4000), requiredConfirmation = booleanValue(formData, "required_load_confirmation"), serviceDate = date(formData, "service_date");
  if (deviceID === undefined || !driverID || !lines || notes === undefined || requiredConfirmation === undefined || !serviceDate || (requiredConfirmation && lines.length === 0)) return undefined;
  return { ...command, payload: { active_device_id: deviceID, driver_user_id: driverID, lines, notes, reason: changeReason, required_load_confirmation: requiredConfirmation, service_date: serviceDate } };
}

export const membershipRoles = ["owner_admin", "accountant", "driver"] as const;
export const membershipStatuses = ["invited", "active", "suspended", "revoked"] as const;
export const membershipCapabilities = ["transaction_unit_price_override", "transaction_discount", "transaction_return_credit_override", "reorder_remaining_stops", "financial_correction"] as const;

export function parseMembershipCommand(formData: FormData): ManagementCommandInput | undefined {
  const command = base(formData, ["create", "update"]), changeReason = reason(formData), profileID = uuid(formData, "profile_id"), userID = uuid(formData, "user_id"), displayName = required(formData, "display_name", 200), employeeID = required(formData, "employee_id", 100), role = enumValue(formData, "role", membershipRoles), status = enumValue(formData, "status", membershipStatuses), isActive = booleanValue(formData, "is_active");
  if (!command || !changeReason || !profileID || !userID || !displayName || !employeeID || !role || !status || isActive === undefined || isActive !== (status === "active") || (command.action === "create") !== (command.expectedVersion === "0")) return undefined;
  const selected = many(formData, "selected_capability") ?? [];
  if (selected.length > 5 || new Set(selected).size !== selected.length || selected.some((item) => !membershipCapabilities.some((value) => value === item)) || (role === "owner_admin" && selected.length > 0) || (role === "accountant" && selected.some((item) => item !== "financial_correction")) || (role === "driver" && selected.includes("financial_correction"))) return undefined;
  const capabilities: JsonObject[] = [];
  for (const capability of selected) {
    const id = uuid(formData, `capability_id_${capability}`), enabled = booleanValue(formData, `capability_enabled_${capability}`), basis = optionalInteger(formData, `capability_basis_${capability}`, 10_000), minor = optionalExactNonnegative(formData, `capability_minor_${capability}`);
    if (!id || enabled === undefined || basis === undefined || minor === undefined || (capability === "transaction_discount" ? minor !== null : basis !== null) || (capability === "reorder_remaining_stops" && minor !== null)) return undefined;
    capabilities.push({ capability, enabled, id, limit_basis_points: basis, limit_minor_units: minor });
  }
  return { ...command, payload: { capabilities, display_name: displayName, employee_id: employeeID, is_active: isActive, profile_id: profileID, reason: changeReason, role, status, user_id: userID } };
}

export function parseOrganizationCommand(formData: FormData): ManagementCommandInput | undefined {
  const command = base(formData, ["update"]), changeReason = reason(formData);
  const name = required(formData, "legal_name", 300), country = required(formData, "registered_country_code", 2), timezone = required(formData, "timezone_name", 100);
  if (!command || command.expectedVersion === "0" || !changeReason || !name || !country || !/^[A-Z]{2}$/.test(country) || !timezone || single(formData, "currency_code") !== "GBP") return undefined;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(); } catch { return undefined; }
  const names = ["trading_name", "company_registration_number", "vat_registration_number", "registered_address_line_1", "registered_address_line_2", "registered_locality", "registered_region", "registered_postal_code", "contact_name", "contact_email", "contact_phone", "document_footer"] as const;
  const values = names.map((key) => optional(formData, key, 4000));
  if (values.includes(undefined)) return undefined;
  return { ...command, payload: { ...Object.fromEntries(names.map((key, index) => [key, values[index] ?? null])), legal_name: name, registered_country_code: country, timezone_name: timezone, currency_code: "GBP", reason: changeReason } };
}

export function isExactManagementResult(value: unknown, expected: Readonly<{ command: string; requestID: string; entityType: string; entityID: string; action: string }>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(result).sort();
  const exactKeys = ["action", "command", "contract", "contract_version", "entity", "entity_id", "entity_type", "request_id", "status", "version"].sort();
  const version = result["version"];
  return keys.length === exactKeys.length
    && keys.every((key, index) => key === exactKeys[index])
    && result["contract"] === "wholesale.office-command-result"
    && result["contract_version"] === 1
    && result["command"] === expected.command
    && result["request_id"] === expected.requestID
    && result["entity_type"] === expected.entityType
    && result["entity_id"] === expected.entityID
    && result["action"] === expected.action
    && (typeof version === "number" ? Number.isSafeInteger(version) && version > 0 : typeof version === "string" && /^[1-9]\d*$/.test(version))
    && typeof result["status"] === "string"
    && !!result["entity"] && typeof result["entity"] === "object" && !Array.isArray(result["entity"]);
}
