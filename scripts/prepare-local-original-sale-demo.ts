/** Add an idempotent fictional second-driver collection route without resetting
 * or editing the first completed route. All business writes use owner RPCs. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { localISODate } from "../src/domain/dates.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const status = JSON.parse(readFileSync(`${root}artifacts/backend/local-status.json`, "utf8"));
const credentials = JSON.parse(readFileSync(`${root}artifacts/backend/development-credentials.json`, "utf8"));
const base = String(status.API_URL), org = "10000000-0000-4000-8000-000000000001";
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(base), "Only the isolated local backend is supported");
async function request(path: string, token: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  assert.ok(response.ok, `${path.split("?")[0]} failed (${response.status}): ${data.message ?? "unexpected response"}`);
  return data;
}
async function signIn(role: string) {
  const data = await request("/auth/v1/token?grant_type=password", status.ANON_KEY, credentials[role]);
  assert.equal(data.user.app_metadata.development_seed, true);
  assert.ok(String(data.user.email).endsWith("@pilot-wholesale.localhost"));
  return { token: String(data.access_token), userID: String(data.user.id) };
}
const owner = await signIn("OWNER"), driver = await signIn("DRIVER_TWO");
const [device] = await request(`/rest/v1/devices?organization_id=eq.${org}&user_id=eq.${driver.userID}&revoked_at=is.null&select=id,installation_id`, owner.token);
assert.ok(device, "The fictional second driver needs its seeded phone");
interface Plan {
  serviceDate: string; shiftID: string; routeID: string; stopIDs: string[]; packageID: string;
  driverID: string; deviceID: string; installationID: string;
  source: { id: string; customerID: string; shopID: string; quantity: number; net: number; tax: number; gross: number };
  loadLines: Array<{ id: string; product_id: string; expected_quantity: string }>;
  commands: Record<string, { rpc: string; body: Record<string, unknown> }>;
}
const planPath = `${root}artifacts/backend/original-sale-demo-plan.json`;
let plan: Plan;
if (existsSync(planPath)) {
  plan = JSON.parse(readFileSync(planPath, "utf8"));
  assert.equal(plan.driverID, driver.userID); assert.equal(plan.deviceID, device.id);
} else {
  const packages = await request(`/rest/v1/work_packages?organization_id=eq.${org}&driver_user_id=eq.${driver.userID}&select=id`, owner.token);
  assert.equal(packages.length, 0, "Existing second-driver work must be reviewed before creating this example");
  const sales = await request(`/rest/v1/delivery_lines?organization_id=eq.${org}&select=id,delivery_id,quantity,net_minor,tax_minor,gross_minor&order=id`, owner.token);
  const source = sales.find((line: { quantity: number; tax_minor: number }) => line.quantity >= 2 && line.quantity <= 10 && line.tax_minor > 0 && line.tax_minor % line.quantity !== 0);
  assert.ok(source, "The first demo needs an issued VAT-bearing line with cumulative rounding");
  for (const amount of [source.quantity, source.net_minor, source.tax_minor, source.gross_minor]) assert.ok(Number.isSafeInteger(amount) && amount >= 0);
  const [delivery] = await request(`/rest/v1/deliveries?organization_id=eq.${org}&id=eq.${source.delivery_id}&acceptance_state=eq.accepted&finalization_state=eq.issued&select=customer_account_id,shop_location_id`, owner.token);
  assert.ok(delivery, "The source must already have its issued invoice");
  const allocations = await request(`/rest/v1/return_credit_allocations?organization_id=eq.${org}&original_delivery_line_id=eq.${source.id}&select=id`, owner.token);
  assert.equal(allocations.length, 0, "Choose an untouched original sale for this finite demo");
  const products = await request(`/rest/v1/products?organization_id=eq.${org}&is_active=eq.true&select=id&order=id`, owner.token);
  assert.equal(products.length, 15);
  plan = { serviceDate: localISODate(new Date(), "Europe/London"), shiftID: randomUUID(), routeID: randomUUID(),
    stopIDs: [randomUUID(), randomUUID()], packageID: randomUUID(), driverID: driver.userID, deviceID: device.id, installationID: device.installation_id,
    source: { id: source.id, customerID: delivery.customer_account_id, shopID: delivery.shop_location_id,
      quantity: source.quantity, net: source.net_minor, tax: source.tax_minor, gross: source.gross_minor },
    loadLines: products.map((product: { id: string }) => ({ id: randomUUID(), product_id: product.id, expected_quantity: "0" })), commands: {} };
}
function save() { writeFileSync(planPath, JSON.stringify(plan, null, 2), { mode: 0o600 }); }
save();
async function command(name: string, rpc: string, proposed: Record<string, unknown>) {
  const existing = plan.commands[name];
  if (existing) assert.equal(existing.rpc, rpc);
  const body = existing?.body ?? { ...proposed, p_organization_id: org, p_request_id: randomUUID() };
  plan.commands[name] = { rpc, body }; save();
  const result = await request(`/rest/v1/rpc/${rpc}`, owner.token, body);
  assert.equal(result.request_id, body["p_request_id"]);
  console.log(`Verified fictional preparation: ${name}`);
  return result;
}
async function routeVersion() {
  const [route] = await request(`/rest/v1/routes?organization_id=eq.${org}&id=eq.${plan.routeID}&select=version`, owner.token);
  assert.ok(route && Number.isSafeInteger(route.version)); return String(route.version);
}
const reason = "Fictional original-invoice return acceptance; preserve the completed first route";
await command("shift", "admin_manage_shift_load", { p_shift_id: plan.shiftID, p_expected_version: "0", p_action: "create",
  p_payload: { active_device_id: plan.deviceID, driver_user_id: plan.driverID, lines: plan.loadLines,
    notes: "Collection-only example: confirm zero sellable load, then return one unit and the remaining original quantity.",
    reason, required_load_confirmation: true, service_date: plan.serviceDate } });
await command("route", "admin_manage_route", { p_route_id: plan.routeID, p_expected_version: "0", p_action: "create",
  p_payload: { driver_user_id: plan.driverID, notes: "Original invoice return demonstration: partial collection then remaining cartons at the same fictional shop.", reason, service_date: plan.serviceDate, shift_id: plan.shiftID } });
for (const [index, id] of plan.stopIDs.entries()) {
  await command(`stop-${index + 1}`, "admin_manage_route_stop", { p_route_id: plan.routeID,
    p_expected_route_version: await routeVersion(), p_action: "add", p_payload: {
      customer_account_id: plan.source.customerID, delivery_notes: index === 0 ? "Collect one carton against the original invoice." : "Collect the remaining original cartons on a second visit; verify final VAT rounding.",
      expected_payment_details: "Collection credit only; no cash received or refunded.", id, planned_order_id: null,
      reason, shop_location_id: plan.source.shopID, stop_sequence: String(index + 1) } });
}
await command("publish", "admin_manage_route", { p_route_id: plan.routeID, p_expected_version: await routeVersion(), p_action: "publish", p_payload: { reason } });
await command("download", "admin_prepare_driver_download", { p_route_id: plan.routeID, p_expected_route_version: await routeVersion(),
  p_device_id: plan.deviceID, p_work_package_id: plan.packageID, p_reason: reason });
const history = await request("/rest/v1/rpc/get_driver_return_history", driver.token, {
  p_organization_id: org, p_device_id: plan.deviceID, p_installation_id: plan.installationID, p_work_package_id: plan.packageID });
const archive = JSON.parse(history.canonical_payload);
assert.equal(archive.contract_version, 2);
assert.ok(archive.lines.some((line: { original_delivery_line_id: string }) => line.original_delivery_line_id === plan.source.id));
writeFileSync(`${root}artifacts/backend/original-sale-live-configuration.json`, JSON.stringify({
  backendURL: base, publicCredential: status.ANON_KEY, ...credentials.DRIVER_TWO,
  organizationID: org, deviceID: plan.deviceID, installationID: plan.installationID, workPackageID: plan.packageID,
  sourceLineID: plan.source.id, sourceQuantity: plan.source.quantity, sourceNetMinor: String(plan.source.net),
  sourceTaxMinor: String(plan.source.tax), sourceGrossMinor: String(plan.source.gross), routeID: plan.routeID,
}), { mode: 0o600 });
console.log(`Second fictional route ready: ${plan.routeID}; two collection stops; original invoice VAT rounding retained.`);
