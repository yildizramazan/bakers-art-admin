/** Prepare an isolated two-stop partial-recovery acceptance route with replayable owner commands. */
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
  driverID: string; deviceID: string; installationID: string; productID: string;
  customerID: string; shopID: string; firstRootName: string; recoveredRootName: string;
  loadLines: Array<{ id: string; product_id: string; expected_quantity: string }>;
  commands: Record<string, { rpc: string; body: Record<string, unknown> }>;
}
const planPath = `${root}artifacts/backend/partial-recovery-demo-plan.json`;
let plan: Plan;
if (existsSync(planPath)) {
  plan = JSON.parse(readFileSync(planPath, "utf8"));
  assert.equal(plan.driverID, driver.userID); assert.equal(plan.deviceID, device.id);
} else {
  const serviceDate = localISODate(new Date(), "Europe/London");
  const packages = await request(`/rest/v1/work_packages?organization_id=eq.${org}&device_id=eq.${device.id}&service_date_until=eq.${serviceDate}&select=id`, owner.token);
  assert.equal(packages.length, 0, "Preserve any existing phone work for this date");
  const products = await request(`/rest/v1/products?organization_id=eq.${org}&is_active=eq.true&select=id,sku&order=id`, owner.token);
  assert.equal(products.length, 15);
  const product = products.find((item: { sku: string }) => item.sku === "P001"); assert.ok(product);
  const [shop] = await request(`/rest/v1/shop_locations?organization_id=eq.${org}&is_active=eq.true&select=id,customer_account_id&order=id&limit=1`, owner.token); assert.ok(shop);
  plan = { serviceDate, shiftID: randomUUID(), routeID: randomUUID(), stopIDs: [randomUUID(),randomUUID()],
    packageID: randomUUID(), driverID: driver.userID, deviceID: device.id, installationID: device.installation_id,
    productID: product.id, customerID: shop.customer_account_id, shopID: shop.id,
    firstRootName: `PartialDriverAcceptance-${randomUUID()}`, recoveredRootName: `PartialDriverRecovered-${randomUUID()}`,
    loadLines: products.map((item: { id: string }) => ({ id: randomUUID(), product_id: item.id, expected_quantity: item.id === product.id ? "4" : "0" })), commands: {} };
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
const reason = "Fictional partial-route recovery acceptance; preserve all earlier completed routes";
await command("shift", "admin_manage_shift_load", { p_shift_id: plan.shiftID, p_expected_version: "0", p_action: "create",
  p_payload: { active_device_id: plan.deviceID, driver_user_id: plan.driverID, lines: plan.loadLines,
    notes: "Recovery example: four milk cartons loaded, one sold before recovery and one after recovery.",
    reason, required_load_confirmation: true, service_date: plan.serviceDate } });
await command("route", "admin_manage_route", { p_route_id: plan.routeID, p_expected_version: "0", p_action: "create",
  p_payload: { driver_user_id: plan.driverID, notes: "Fictional two-visit recovery acceptance.", reason, service_date: plan.serviceDate, shift_id: plan.shiftID } });
for (const [index, id] of plan.stopIDs.entries()) {
  await command(`stop-${index + 1}`, "admin_manage_route_stop", { p_route_id: plan.routeID,
    p_expected_route_version: await routeVersion(), p_action: "add", p_payload: {
      customer_account_id: plan.customerID, delivery_notes: index === 0 ? "Sell one milk carton before phone recovery." : "After recovery sell one milk carton and reconcile remaining stock and both cash receipts.",
      expected_payment_details: "Fictional cash payment for one milk carton.", id, planned_order_id: null,
      reason, shop_location_id: plan.shopID, stop_sequence: String(index + 1) } });
}
await command("publish", "admin_manage_route", { p_route_id: plan.routeID, p_expected_version: await routeVersion(), p_action: "publish", p_payload: { reason } });
await command("download", "admin_prepare_driver_download", { p_route_id: plan.routeID, p_expected_route_version: await routeVersion(),
  p_device_id: plan.deviceID, p_work_package_id: plan.packageID, p_reason: reason });
writeFileSync(`${root}artifacts/backend/partial-recovery-live-configuration.json`, JSON.stringify({
  backendURL: base, publicCredential: status.ANON_KEY, ...credentials.DRIVER_TWO,
  organizationID: org, deviceID: plan.deviceID, installationID: plan.installationID, workPackageID: plan.packageID,
  productID: plan.productID, firstRootName: plan.firstRootName, recoveredRootName: plan.recoveredRootName,
}), { mode: 0o600 });
console.log(`Partial recovery route prepared: ${plan.routeID}; two visits; original phones preserved.`);
