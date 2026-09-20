import assert from "node:assert/strict";
import test from "node:test";
import {
  isExactManagementResult, parseMasterDataCommand, parseMembershipCommand,
  parseOrderRevisionCommand, parseOrganizationCommand, parsePolicyRevisionCommand, parseRouteCommand,
  parseRouteStopCommand, parseShiftLoadCommand, parseRouteCopy,
} from "../src/domain/admin-management.ts";

const ids = Array.from({ length: 8 }, (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const requestID = ids[0]!, entityID = ids[1]!, productID = ids[2]!;

test("route copies preserve exact source versions and reject ambiguous identities", () => {
  const fields = { request_id: ids[0]!, source_route_id: ids[1]!, route_id: ids[2]!, shift_id: ids[3]!,
    expected_source_version: "9007199254740993", reason: " Repeat next week " };
  const input = new FormData();
  for (const [key, value] of Object.entries(fields)) input.set(key, value);
  assert.deepEqual(parseRouteCopy(input), { requestID: ids[0], sourceRouteID: ids[1], routeID: ids[2], shiftID: ids[3],
    expectedSourceVersion: "9007199254740993", reason: "Repeat next week" });
  for (const version of ["0", "01", "1.5", "1e3", "-1", "9223372036854775808"]) {
    input.set("expected_source_version", version); assert.equal(parseRouteCopy(input), undefined);
  }
  input.set("expected_source_version", "1");
  input.set("route_id", ids[1]!); assert.equal(parseRouteCopy(input), undefined);
  input.set("route_id", ids[2]!);
  input.append("shift_id", ids[4]!); assert.equal(parseRouteCopy(input), undefined);
  input.set("shift_id", ids[3]!);
  input.set("reason", " "); assert.equal(parseRouteCopy(input), undefined);
  input.set("reason", "Repeat"); input.set("source_route_id", "foreign"); assert.equal(parseRouteCopy(input), undefined);
});
function form(values: Record<string, string | readonly string[]> = {}, action = "create"): FormData {
  const result = new FormData();
  const fields = {
    request_id: requestID, entity_id: entityID, expected_version: action === "create" ? "0" : "1",
    command_action: action, confirm_command: action, reason: "Scheduled business update", ...values,
  };
  for (const [name, value] of Object.entries(fields)) {
    for (const entry of typeof value === "string" ? [value] : value) result.append(name, entry);
  }
  return result;
}

test("business details require an existing record and exact GBP configuration", () => {
  const optional = ["trading_name", "company_registration_number", "vat_registration_number", "registered_address_line_1", "registered_address_line_2", "registered_locality", "registered_region", "registered_postal_code", "contact_name", "contact_email", "contact_phone", "document_footer"];
  const fields = { ...Object.fromEntries(optional.map((name) => [name, ""])), legal_name: " Example Wholesale Ltd ", registered_country_code: "GB", timezone_name: "Europe/London", currency_code: "GBP" };
  const input = form(fields, "update");
  assert.equal(parseOrganizationCommand(input)?.payload["legal_name"], "Example Wholesale Ltd");
  assert.equal(parseOrganizationCommand(input)?.payload["document_footer"], null);
  assert.equal(parseOrganizationCommand(form(fields)), undefined);
  input.set("currency_code", "USD"); assert.equal(parseOrganizationCommand(input), undefined);
  input.set("currency_code", "GBP"); input.set("timezone_name", "Not/AZone"); assert.equal(parseOrganizationCommand(input), undefined);
});

test("retiring a policy parses only its end date and reason", () => {
  const input = form({ revision_type: "price_rule", effective_until: "2026-10-21" }, "retire");
  assert.deepEqual(parsePolicyRevisionCommand(input)?.payload, { effective_until: "2026-10-21", reason: "Scheduled business update" });
  input.set("effective_until", "2026-02-30"); assert.equal(parsePolicyRevisionCommand(input), undefined);
});

test("product commands retain catalogue identity and reject ambiguous or unconfirmed input", () => {
  const fields = { entity_type: "product", name: "Wholemeal loaf", sku: "LOAF-001", category: "Bakery",
    unit: "each", description: "", default_tax_rule_id: "", display_order: "1", image_storage_path: "", is_active: "true" };
  const input = form(fields);
  assert.deepEqual(parseMasterDataCommand(input), {
    requestID, entityID, expectedVersion: "0", action: "create", type: "product",
    payload: { category: "Bakery", default_tax_rule_id: null, description: null, display_order: 1,
      image_storage_path: null, is_active: true, name: "Wholemeal loaf", reason: "Scheduled business update", sku: "LOAF-001", unit: "each" },
  });
  input.append("name", "Conflicting name");
  assert.equal(parseMasterDataCommand(input), undefined);
  assert.equal(parseMasterDataCommand(form({ ...fields, confirm_command: "update" })), undefined);
  assert.equal(parseMasterDataCommand(form({ ...fields, expected_version: "1" })), undefined);
  assert.equal(parseMasterDataCommand(form({ ...fields, image_storage_path: "images/../private" })), undefined);
});

test("barcodes preserve leading zeroes and special prices have one explicit scope", () => {
  assert.equal(parseMasterDataCommand(form({ entity_type: "product_barcode", product_id: productID,
    barcode_value: "0012345678905", symbology: "ean13", is_active: "true" }))?.payload["barcode_value"], "0012345678905");
  const fields = { entity_type: "price_rule", product_id: productID, purpose: "sale", scope: "customer_account",
    customer_account_id: ids[3]!, shop_location_id: "", is_active: "true" };
  assert.equal(parseMasterDataCommand(form(fields))?.payload["customer_account_id"], ids[3]);
  assert.equal(parseMasterDataCommand(form({ ...fields, shop_location_id: ids[4]! })), undefined);
  assert.equal(parseMasterDataCommand(form({ ...fields, scope: "organization" })), undefined);
});

test("price revisions preserve int64 money and reject overflow, floats and invalid dates", () => {
  const fields = { revision_type: "price_rule", price_rule_id: ids[3]!, unit_amount_minor: "9007199254740993",
    currency_code: "GBP", tax_mode: "tax_inclusive", tax_rule_revision_id: ids[4]!,
    effective_from: "2026-09-15", effective_until: "", is_active: "true" };
  assert.equal(parsePolicyRevisionCommand(form(fields))?.payload["unit_amount_minor"], "9007199254740993");
  for (const amount of ["9223372036854775808", "1.2", "1e3", "-1", "01"]) {
    assert.equal(parsePolicyRevisionCommand(form({ ...fields, unit_amount_minor: amount })), undefined);
  }
  assert.equal(parsePolicyRevisionCommand(form({ ...fields, effective_from: "2026-02-30" })), undefined);
  assert.equal(parsePolicyRevisionCommand(form({ ...fields, effective_until: "2026-09-15" })), undefined);
});

test("standing and dated orders preserve planned quantities and reject duplicated products", () => {
  const fields = { order_type: "standing_order", customer_account_id: ids[3]!, shop_location_id: ids[4]!,
    notes: "", template_key: "", weekday: "1", effective_from: "2026-09-15", effective_until: "",
    line_id: ids[5]!, line_product_id: productID, line_quantity: "20", line_display_order: "1" };
  const parsed = parseOrderRevisionCommand(form(fields));
  assert.deepEqual(parsed?.payload["lines"], [{ display_order: 1, id: ids[5], planned_quantity: "20", product_id: productID }]);
  assert.equal(parseOrderRevisionCommand(form({ ...fields, weekday: "8" })), undefined);
  assert.equal(parseOrderRevisionCommand(form({ ...fields, line_quantity: "0" })), undefined);
  assert.equal(parseOrderRevisionCommand(form({ ...fields, line_id: [ids[5]!, ids[6]!],
    line_product_id: [productID, productID], line_quantity: ["20", "10"], line_display_order: ["1", "2"] })), undefined);
  assert.deepEqual(parseOrderRevisionCommand(form({ order_type: "planned_order" }, "publish"))?.payload,
    { reason: "Scheduled business update" });
  assert.equal(parseOrderRevisionCommand(form({ order_type: "standing_order" }, "cancel")), undefined);
});

test("routes require a dated driver and shift assignment before publication", () => {
  const fields = { driver_user_id: ids[3]!, shift_id: ids[4]!, service_date: "2026-09-15", notes: "" };
  assert.deepEqual(parseRouteCommand(form(fields))?.payload, { driver_user_id: ids[3], shift_id: ids[4],
    service_date: "2026-09-15", notes: null, reason: "Scheduled business update" });
  assert.equal(parseRouteCommand(form({ ...fields, driver_user_id: "driver" })), undefined);
  assert.equal(parseRouteCommand(form({ ...fields, service_date: "2026-13-01" })), undefined);
  assert.equal(parseRouteCommand(form({}, "publish"))?.action, "publish");
});

test("route stop ordering rejects duplicates and preserves the optimistic parent version", () => {
  const fields = { change_id: ids[5]!, ordered_stop_ids: `${ids[3]}, ${ids[4]}` };
  const parsed = parseRouteStopCommand(form(fields, "reorder"));
  assert.equal(parsed?.expectedVersion, "1");
  assert.deepEqual(parsed?.payload["ordered_stop_ids"], [ids[3], ids[4]]);
  assert.equal(parseRouteStopCommand(form({ ...fields, ordered_stop_ids: `${ids[3]},${ids[3]}` }, "reorder")), undefined);
  assert.equal(parseRouteStopCommand(form({ ...fields, expected_version: "0" }, "reorder")), undefined);
  assert.equal(parseRouteStopCommand(form({ ...fields, ordered_stop_ids: "" }, "reorder")), undefined);
});

test("shift loads retain expected quantities separately from driver confirmation", () => {
  const fields = { active_device_id: ids[3]!, driver_user_id: ids[4]!, notes: "",
    required_load_confirmation: "true", service_date: "2026-09-15", line_id: ids[5]!,
    line_product_id: productID, line_quantity: "120" };
  assert.deepEqual(parseShiftLoadCommand(form(fields))?.payload["lines"],
    [{ expected_quantity: "120", id: ids[5], product_id: productID }]);
  assert.equal(parseShiftLoadCommand(form({ ...fields, line_id: [], line_product_id: [], line_quantity: [] })), undefined);
  assert.equal(parseShiftLoadCommand(form({ ...fields, line_quantity: "9000000000000001" })), undefined);
});

test("employee roles accept only applicable explicit capabilities and coherent active state", () => {
  const fields = { profile_id: ids[3]!, user_id: ids[4]!, display_name: "Example Driver", employee_id: "DRV001",
    role: "driver", status: "active", is_active: "true", selected_capability: "transaction_discount",
    capability_id_transaction_discount: ids[5]!, capability_enabled_transaction_discount: "true",
    capability_basis_transaction_discount: "500", capability_minor_transaction_discount: "" };
  assert.deepEqual(parseMembershipCommand(form(fields))?.payload["capabilities"], [
    { capability: "transaction_discount", enabled: true, id: ids[5], limit_basis_points: 500, limit_minor_units: null },
  ]);
  for (const invalid of [{ role: "accountant" }, { role: "owner_admin" }, { status: "suspended" },
    { selected_capability: "financial_correction" }, { capability_basis_transaction_discount: "10001" }]) {
    assert.equal(parseMembershipCommand(form({ ...fields, ...invalid })), undefined);
  }
});

test("management receipts must match every request identity and the exact response shape", () => {
  const expected = { command: "admin.route", requestID, entityType: "route", entityID, action: "create" };
  const result = { contract: "wholesale.office-command-result", contract_version: 1, command: expected.command,
    request_id: requestID, entity_type: "route", entity_id: entityID, action: "create", version: 1,
    status: "draft", entity: { id: entityID, version: 1 } };
  assert.equal(isExactManagementResult(result, expected), true);
  for (const invalid of [{ request_id: ids[7] }, { entity_id: ids[7] }, { entity_type: "shift" },
    { command: "admin.membership" }, { contract_version: 2 }, { action: "cancel" },
    { version: 0 }, { version: 9007199254740992 }, { entity: [] }, { extra: "field" }]) {
    assert.equal(isExactManagementResult({ ...result, ...invalid }, expected), false);
  }
});
