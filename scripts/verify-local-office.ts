/** Real local Auth + REST acceptance. Writes only fictional acceptance records. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { officeEditors, hundredthsFromDecimal } from "../src/domain/office-editors.ts";
import { copiedOrderLines, nextStandingOrderDate } from "../src/domain/order-templates.ts";
import { parseMasterDataCommand, parsePolicyRevisionCommand, parseOrderRevisionCommand, parseOrganizationCommand, parseRouteCommand, parseRouteStopCommand, parseShiftLoadCommand, parseMembershipCommand, isExactManagementResult, type ManagementCommandInput, type TypedManagementCommandInput } from "../src/domain/admin-management.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const status = JSON.parse(readFileSync(`${root}artifacts/backend/local-status.json`, "utf8")) as Record<string, string>;
const credentials = JSON.parse(readFileSync(`${root}artifacts/backend/development-credentials.json`, "utf8")) as Record<string, { email: string; password: string }>;
const base = status["API_URL"]!;
const url = new URL(base);
assert.ok(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local acceptance must use loopback.");
const anonymousKey = status["ANON_KEY"]!;
const organizationID = "10000000-0000-4000-8000-000000000001";
const recordIDs: Record<string, string> = {};
let checks = 0;
function pass(label: string) { checks += 1; console.log(`ok ${checks} - ${label}`); }
async function request(path: string, token: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { apikey: anonymousKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { response, data: await response.json() };
}
async function login(role: string): Promise<{ token: string; id: string }> {
  const { response, data } = await request("/auth/v1/token?grant_type=password", anonymousKey, credentials[role]);
  assert.equal(response.status, 200, `Sign-in for ${role}: ${String(data.error_code ?? "")}`);
  assert.equal(typeof data.access_token, "string");
  assert.equal(data.user.app_metadata.development_seed, true, "Acceptance writes require explicitly seeded fictional accounts.");
  pass(`real email sign-in: ${role}`);
  return { token: data.access_token, id: data.user.id };
}
const owner = await login("OWNER"), accountant = await login("ACCOUNTANT"), driver = await login("DRIVER_ONE");
const shifts = await request(`/rest/v1/shifts?organization_id=eq.${organizationID}&driver_user_id=eq.${driver.id}&select=service_date&order=service_date.desc&limit=1`, owner.token);
assert.equal(shifts.response.status, 200);
const proposedDate = new Date(); proposedDate.setUTCDate(proposedDate.getUTCDate() + 35);
const lastDate = shifts.data[0]?.service_date as string | undefined;
const nextDate = lastDate && lastDate >= proposedDate.toISOString().slice(0, 10) ? new Date(`${lastDate}T00:00:00Z`) : proposedDate;
if (nextDate !== proposedDate) nextDate.setUTCDate(nextDate.getUTCDate() + 1);
const serviceDate = nextDate.toISOString().slice(0, 10);
const endDate = new Date(nextDate); endDate.setUTCDate(endDate.getUTCDate() + 1);
const retirementDate = endDate.toISOString().slice(0, 10);
const signup = await request("/auth/v1/signup", anonymousKey, { email: `uninvited-${randomUUID()}@pilot-wholesale.localhost`, password: randomUUID() });
assert.equal(signup.data.error_code, "signup_disabled"); pass("public signup remains disabled");

function formFor(kind: string, changes: Record<string, string> = {}): FormData {
  const editor = officeEditors.find((value) => value.kind === kind);
  assert.ok(editor);
  const form = new FormData();
  for (const field of editor.fields) {
    let value = field.required && field.kind === "date" ? serviceDate : field.initial;
    if ((field.kind === "money" || field.kind === "percent") && value !== "") value = hundredthsFromDecimal(value)!;
    form.set(field.name, value);
  }
  for (const [key, value] of Object.entries({ request_id: randomUUID(), entity_id: randomUUID(), expected_version: "0", command_action: "create", confirm_command: "create", reason: "Fictional local office acceptance", ...changes })) form.set(key, value);
  if (editor.family === "master") form.set("entity_type", kind);
  if (editor.family === "order") form.set("order_type", kind);
  return form;
}
type Parsed = ManagementCommandInput | TypedManagementCommandInput;
async function runCommand(label: string, name: string, input: Parsed | undefined, extra: Record<string, unknown>, commandName: string, entityType: string, token = owner.token) {
  assert.ok(input, `${label}: form must parse`);
  const body = { p_organization_id: organizationID, p_request_id: input.requestID, p_expected_version: input.expectedVersion, p_payload: input.payload, ...extra };
  if (name === "admin_manage_route_stop") { delete (body as Record<string, unknown>)["p_expected_version"]; (body as Record<string, unknown>)["p_expected_route_version"] = input.expectedVersion; }
  const first = await request(`/rest/v1/rpc/${name}`, token, body);
  assert.equal(first.response.status, 200, `${label}: ${JSON.stringify(first.data)}`);
  assert.ok(isExactManagementResult(first.data, { command: commandName, requestID: input.requestID, entityType, entityID: input.entityID, action: input.action }), `${label}: exact result`);
  const retry = await request(`/rest/v1/rpc/${name}`, token, body);
  assert.equal(retry.response.status, 200, `${label}: retry`); assert.deepEqual(retry.data, first.data, `${label}: one receipt`);
  pass(`${label}; exact retry returns the same receipt`);
  return first.data;
}
async function master(kind: string, changes: Record<string, string>) {
  const input = parseMasterDataCommand(formFor(kind, changes)); assert.ok(input);
  recordIDs[kind] = input.entityID;
  return runCommand(kind, "admin_save_master_data", input, { p_entity_type: kind, p_entity_id: input.entityID }, `admin.master_data.${kind}`, kind);
}
const unique = randomUUID().slice(0, 8);
const product = await master("product", { sku: `CHECK-${unique}`, name: "Acceptance Oat Loaf", category: "Bakery", unit: "each" });
await master("product_barcode", { product_id: recordIDs["product"]!, barcode_value: `TEST-${unique}`, symbology: "code128" });
await master("customer_account", { account_code: `CHECK-${unique}`, legal_name: "Acceptance Corner Shops Ltd" });
await master("shop_location", { customer_account_id: recordIDs["customer_account"]!, location_code: `CHECK-${unique}`, display_name: "Acceptance Corner Shop", address_line_1: "1 Example Road", locality: "London", postal_code: "SW1A 1AA" });
await master("tax_rule", { code: `CHECK-${unique}`, name: "Acceptance Standard VAT" });
await master("price_rule", { product_id: recordIDs["product"]! });

const stale = parseMasterDataCommand(formFor("product", { entity_id: recordIDs["product"]!, expected_version: "999", command_action: "update", confirm_command: "update", sku: `CHECK-${unique}`, name: "Stale name", category: "Bakery", unit: "each" })); assert.ok(stale);
const staleResult = await request("/rest/v1/rpc/admin_save_master_data", owner.token, { p_organization_id: organizationID, p_request_id: stale.requestID, p_entity_type: "product", p_entity_id: stale.entityID, p_expected_version: stale.expectedVersion, p_payload: stale.payload });
assert.equal(staleResult.data.code, "40001"); pass("stale edits are rejected");
const forbidden = await request("/rest/v1/rpc/admin_save_master_data", accountant.token, { p_organization_id: organizationID, p_request_id: randomUUID(), p_entity_type: "product", p_entity_id: recordIDs["product"], p_expected_version: String(product.version), p_payload: stale.payload });
assert.equal(forbidden.data.code, "42501"); pass("accountant cannot edit catalogue");

async function policy(kind: string, changes: Record<string, string>, publish = true) {
  const form = formFor(kind, changes); const input = parsePolicyRevisionCommand(form); assert.ok(input);
  recordIDs[kind] = input.entityID;
  const created = await runCommand(`${kind} draft`, "admin_manage_policy_revision", input, { p_revision_type: input.type, p_revision_id: input.entityID, p_action: input.action }, `admin.policy_revision.${input.type}`, `${input.type}_revision`);
  if (!publish) return created;
  for (const [key, value] of Object.entries({ request_id: randomUUID(), expected_version: String(created.version), command_action: "publish", confirm_command: "publish" })) form.set(key, value);
  const published = parsePolicyRevisionCommand(form); assert.ok(published);
  return runCommand(`${kind} publish`, "admin_manage_policy_revision", published, { p_revision_type: published.type, p_revision_id: published.entityID, p_action: published.action }, `admin.policy_revision.${published.type}`, `${published.type}_revision`);
}
await policy("tax_revision", { tax_rule_id: recordIDs["tax_rule"]!, rate_basis_points: "2000" });
const publishedPrice = await policy("price_revision", { price_rule_id: recordIDs["price_rule"]!, tax_rule_revision_id: recordIDs["tax_revision"]!, unit_amount_minor: "349" });
const retiringPrice = parsePolicyRevisionCommand(formFor("price_revision", { entity_id: recordIDs["price_revision"]!, expected_version: String(publishedPrice.version), command_action: "retire", confirm_command: "retire", effective_until: retirementDate })); assert.ok(retiringPrice);
await runCommand("retire published price prospectively", "admin_retire_policy_revision", retiringPrice, { p_revision_type: retiringPrice.type, p_revision_id: retiringPrice.entityID }, "admin.policy_revision.price_rule", "price_rule_revision");
await policy("price_revision", { price_rule_id: recordIDs["price_rule"]!, tax_rule_revision_id: recordIDs["tax_revision"]!, unit_amount_minor: "399", effective_from: retirementDate });
await policy("settings_revision", {}, false); // Existing published policy is open-ended; replacement is a separate lifecycle command.

for (const kind of ["standing_order", "planned_order"]) {
  const form = formFor(kind, { customer_account_id: recordIDs["customer_account"]!, shop_location_id: recordIDs["shop_location"]!, line_id: randomUUID(), line_product_id: recordIDs["product"]!, line_quantity: "3", line_display_order: "1", line_source_id: "" });
  const input = parseOrderRevisionCommand(form); assert.ok(input); recordIDs[kind] = input.entityID;
  const created = await runCommand(`${kind} draft`, "admin_manage_order_revision", input, { p_order_type: kind, p_order_id: input.entityID, p_action: input.action }, `admin.order_revision.${kind}`, `${kind}_revision`);
  form.set("request_id", randomUUID()); form.set("expected_version", String(created.version)); form.set("command_action", "publish"); form.set("confirm_command", "publish");
  const published = parseOrderRevisionCommand(form); assert.ok(published);
  await runCommand(`${kind} publish`, "admin_manage_order_revision", published, { p_order_type: kind, p_order_id: published.entityID, p_action: published.action }, `admin.order_revision.${kind}`, `${kind}_revision`);
}
const shift = parseShiftLoadCommand(formFor("shift", { driver_user_id: driver.id, line_id: randomUUID(), line_product_id: recordIDs["product"]!, line_quantity: "10" })); assert.ok(shift); recordIDs["shift"] = shift.entityID;
await runCommand("planned shift and load", "admin_manage_shift_load", shift, { p_shift_id: shift.entityID, p_action: shift.action }, "admin.shift_load", "shift");
const route = parseRouteCommand(formFor("route", { driver_user_id: driver.id, shift_id: shift.entityID })); assert.ok(route); recordIDs["route"] = route.entityID;
let routeResult = await runCommand("route draft", "admin_manage_route", route, { p_route_id: route.entityID, p_action: route.action }, "admin.route", "route");
const stop = new FormData();
for (const [key, value] of Object.entries({ request_id: randomUUID(), entity_id: route.entityID, expected_version: String(routeResult.version), command_action: "add", confirm_command: "add", reason: "Fictional stop acceptance", stop_id: randomUUID(), stop_sequence: "1", customer_account_id: recordIDs["customer_account"]!, shop_location_id: recordIDs["shop_location"]!, planned_order_id: recordIDs["planned_order"]!, delivery_notes: "Use side entrance", expected_payment_details: "Cash" })) stop.set(key, value);
const stopInput = parseRouteStopCommand(stop); assert.ok(stopInput);
routeResult = await runCommand("add route stop", "admin_manage_route_stop", stopInput, { p_route_id: route.entityID, p_action: stopInput.action }, "admin.route_stop", "route");
const publishRoute = parseRouteCommand(formFor("route", { entity_id: route.entityID, expected_version: String(routeResult.version), command_action: "publish", confirm_command: "publish" })); assert.ok(publishRoute);
await runCommand("publish route", "admin_manage_route", publishRoute, { p_route_id: route.entityID, p_action: "publish" }, "admin.route", "route");

const membership = await request(`/rest/v1/organization_memberships?organization_id=eq.${organizationID}&user_id=eq.${driver.id}&select=id,version,role,status`, owner.token);
const profile = await request(`/rest/v1/profiles?organization_id=eq.${organizationID}&user_id=eq.${driver.id}&select=id,display_name,employee_id,is_active`, owner.token);
assert.equal(membership.data.length, 1); assert.equal(profile.data.length, 1);
const member = membership.data[0], person = profile.data[0];
const membershipForm = formFor("membership", { entity_id: member.id, expected_version: String(member.version), command_action: "update", confirm_command: "update", profile_id: person.id, user_id: driver.id, display_name: person.display_name, employee_id: person.employee_id, role: member.role, status: member.status, is_active: String(person.is_active) });
// Preserve all existing capabilities in this non-disruptive update.
const caps = await request(`/rest/v1/membership_capabilities?organization_id=eq.${organizationID}&membership_id=eq.${member.id}&select=id,capability,enabled,limit_basis_points,limit_minor_units`, owner.token);
for (const cap of caps.data) { membershipForm.append("selected_capability", cap.capability); membershipForm.set(`capability_id_${cap.capability}`, cap.id); membershipForm.set(`capability_enabled_${cap.capability}`, String(cap.enabled)); membershipForm.set(`capability_basis_${cap.capability}`, String(cap.limit_basis_points ?? "")); membershipForm.set(`capability_minor_${cap.capability}`, String(cap.limit_minor_units ?? "")); }
const membershipInput = parseMembershipCommand(membershipForm); assert.ok(membershipInput);
await runCommand("manage existing user access", "admin_manage_membership", membershipInput, { p_membership_id: member.id, p_action: "update" }, "admin.membership", "organization_membership");
const organization = await request(`/rest/v1/organizations?id=eq.${organizationID}&select=*`, owner.token);
assert.equal(organization.data.length, 1);
const organizationEditor = officeEditors.find((editor) => editor.kind === "organization")!;
const businessFields = Object.fromEntries(organizationEditor.fields.map((field) => [field.name, String(organization.data[0][field.name] ?? "")]));
const organizationInput = parseOrganizationCommand(formFor("organization", { ...businessFields, entity_id: organizationID, expected_version: String(organization.data[0].version), command_action: "update", confirm_command: "update" })); assert.ok(organizationInput);
await runCommand("save existing fictional business details", "admin_update_organization", organizationInput, {}, "admin.organization", "organization");

const templateLines = await request(`/rest/v1/standing_order_lines?organization_id=eq.${organizationID}&standing_order_id=eq.${recordIDs["standing_order"]}&select=id,product_id,planned_quantity,display_order`, owner.token);
assert.equal(templateLines.response.status, 200);
const generatedDate = nextStandingOrderDate(serviceDate, serviceDate, null, 1); assert.ok(generatedDate);
const generatedLines = copiedOrderLines(templateLines.data, "template", randomUUID);
async function savePlanFromLines(label: string, lines: ReturnType<typeof copiedOrderLines>, previousID = "", orderKey = "") {
  const form = formFor("planned_order", { customer_account_id: recordIDs["customer_account"]!, shop_location_id: recordIDs["shop_location"]!, source_standing_order_id: recordIDs["standing_order"]!, service_date: generatedDate!, previous_revision_id: previousID, order_key: orderKey });
  for (const [index, line] of lines.entries()) {
    form.append("line_id", line.id); form.append("line_product_id", line.productID); form.append("line_quantity", line.quantity); form.append("line_display_order", String(index + 1)); form.append("line_source_id", line.sourceID);
  }
  const parsed = parseOrderRevisionCommand(form); assert.ok(parsed);
  const created = await runCommand(`${label} draft`, "admin_manage_order_revision", parsed, { p_order_type: "planned_order", p_order_id: parsed.entityID, p_action: "create" }, "admin.order_revision.planned_order", "planned_order_revision");
  form.set("request_id", randomUUID()); form.set("expected_version", String(created.version)); form.set("command_action", "publish"); form.set("confirm_command", "publish");
  const published = parseOrderRevisionCommand(form); assert.ok(published);
  await runCommand(`${label} publish`, "admin_manage_order_revision", published, { p_order_type: "planned_order", p_order_id: published.entityID, p_action: "publish" }, "admin.order_revision.planned_order", "planned_order_revision");
  return parsed.entityID;
}
const generatedID = await savePlanFromLines("dated plan from standing template", generatedLines);
recordIDs["generated_plan"] = generatedID;
const generatedPlan = await request(`/rest/v1/planned_orders?organization_id=eq.${organizationID}&id=eq.${generatedID}&select=order_key`, owner.token);
const savedLines = await request(`/rest/v1/planned_order_lines?organization_id=eq.${organizationID}&planned_order_id=eq.${generatedID}&select=id,product_id,planned_quantity,display_order,source_standing_order_line_id`, owner.token);
const revisedLines = copiedOrderLines(savedLines.data, "revision", randomUUID).map((line) => ({ ...line, quantity: "7" }));
recordIDs["revised_plan"] = await savePlanFromLines("next revision retaining template provenance", revisedLines, generatedID, generatedPlan.data[0].order_key);
const history = await request(`/rest/v1/planned_order_lines?organization_id=eq.${organizationID}&planned_order_id=eq.${generatedID}&select=planned_quantity`, owner.token);
const sourceAfter = await request(`/rest/v1/standing_order_lines?organization_id=eq.${organizationID}&standing_order_id=eq.${recordIDs["standing_order"]}&select=planned_quantity`, owner.token);
assert.equal(String(history.data[0].planned_quantity), "3"); assert.equal(String(sourceAfter.data[0].planned_quantity), "3");
pass("revision changes preserve original planned quantities and the standing template");
writeFileSync(`${root}artifacts/backend/office-acceptance-records.json`, JSON.stringify(recordIDs, null, 2), { mode: 0o600 });
console.log(`PASS: ${checks} local office acceptance checks, including real authorization and exact retries.`);
