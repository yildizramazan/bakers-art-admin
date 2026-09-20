/** Prepare separate fictional source-sale and return-review routes using replayable owner commands. */
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
const owner = await signIn("OWNER"), driver = await signIn("DRIVER_ONE");
const [device] = await request(`/rest/v1/devices?organization_id=eq.${org}&user_id=eq.${driver.userID}&revoked_at=is.null&select=id,installation_id&order=registered_at,id`, owner.token);
assert.ok(device, "The fictional first driver needs its seeded phone");
interface RoutePlan {
  shiftID: string; routeID: string; stopID: string; packageID: string; rootName: string; isolatedInstallationID?: string; isolatedDeviceID?: string;
  loadLines: Array<{ id: string; product_id: string; expected_quantity: string }>;
}
interface Plan {
  serviceDate: string; driverID: string; deviceID: string; installationID: string;
  productID: string; customerID: string; shopID: string;
  source: RoutePlan; collection: RoutePlan;
  commands: Record<string, { rpc: string; body: Record<string, unknown> }>;
}
const stage = process.argv[2] ?? "source";
assert.ok(["source", "collection", "correct"].includes(stage), "Choose source, collection or correct");
const planPath = `${root}artifacts/backend/return-review-demo-plan.json`;
let plan: Plan;
if (existsSync(planPath)) {
  plan = JSON.parse(readFileSync(planPath, "utf8"));
  assert.equal(plan.driverID, driver.userID); assert.equal(plan.deviceID, device.id);
} else {
  assert.equal(stage, "source");
  const products = await request(`/rest/v1/products?organization_id=eq.${org}&is_active=eq.true&select=id,sku&order=id`, owner.token);
  assert.equal(products.length, 15);
  const product = products.find((item: { sku: string }) => item.sku === "P013"); assert.ok(product);
  const [shop] = await request(`/rest/v1/shop_locations?organization_id=eq.${org}&is_active=eq.true&select=id,customer_account_id&order=id&limit=1`, owner.token); assert.ok(shop);
  const route = (sale: boolean): RoutePlan => ({ shiftID: randomUUID(), routeID: randomUUID(), stopID: randomUUID(), packageID: randomUUID(),
    rootName: `ReturnReview${sale ? "Source" : "Collection"}-${randomUUID()}`,
    loadLines: products.map((item: { id: string }) => ({ id: randomUUID(), product_id: item.id, expected_quantity: sale && item.id === product.id ? "2" : "0" })) });
  plan = { serviceDate: localISODate(new Date(), "Europe/London"), driverID: driver.userID, deviceID: device.id, installationID: device.installation_id,
    productID: product.id, customerID: shop.customer_account_id, shopID: shop.id, source: route(true), collection: route(false), commands: {} };
}
function save() { writeFileSync(planPath, JSON.stringify(plan, null, 2), { mode: 0o600 }); }
save();
async function command(name: string, rpc: string, proposed: Record<string, unknown>) {
  const previous = plan.commands[name];
  if (previous) assert.equal(previous.rpc, rpc);
  const body = previous?.body ?? { ...proposed, p_organization_id: org, p_request_id: randomUUID() };
  plan.commands[name] = { rpc, body }; save();
  const result = await request(`/rest/v1/rpc/${rpc}`, owner.token, body);
  console.log(`Verified fictional preparation: ${name}`);
  return result;
}
const sourceEvidence = stage === "source" ? null : JSON.parse(readFileSync(`${root}artifacts/backend/return-review-source-evidence.json`, "utf8"));
if (sourceEvidence) assert.equal(sourceEvidence.packageID, plan.source.packageID);
if (stage === "correct") {
  const collection = JSON.parse(readFileSync(`${root}artifacts/backend/return-review-collection-evidence.json`, "utf8"));
  assert.equal(collection.packageID, plan.collection.packageID); assert.ok(collection.offlineEventBytes.length >= 3);
  const pending = await request(`/rest/v1/deliveries?organization_id=eq.${org}&id=eq.${collection.deliveryID}&select=id`, owner.token);
  assert.ok(plan.commands["correction"] || pending.length === 0, "The collection must still be offline before its first correction");
  const [invoice] = await request(`/rest/v1/financial_documents?organization_id=eq.${org}&source_delivery_id=eq.${sourceEvidence.deliveryID}&kind=eq.invoice&select=id`, owner.token);
  assert.ok(invoice);
  // A new audited one-penny credit changes this new invoice's original-sale basis.
  // Existing completed demo routes and all original issued snapshots are preserved.
  const result = await command("correction", "admin_issue_financial_correction", {
    p_correction_id: randomUUID(), p_original_delivery_id: sourceEvidence.deliveryID,
    p_original_financial_document_id: invoice.id, p_replacement_delivery_id: null, p_kind: "credit",
    p_net_delta_minor: "-1", p_tax_delta_minor: "0", p_gross_delta_minor: "-1",
    p_reason: "Fictional one-penny invoice adjustment after the collection phone downloaded its original-sale evidence.", p_approval_reference: null,
  });
  assert.equal(result.contract, "wholesale.financial-finalization-result");
  writeFileSync(`${root}artifacts/backend/return-review-correction-evidence.json`, JSON.stringify(result), { mode: 0o600 });
} else {
  const selected = plan[stage as "source" | "collection"], sale = stage === "source";
  async function version() {
    const [route] = await request(`/rest/v1/routes?organization_id=eq.${org}&id=eq.${selected.routeID}&select=version`, owner.token);
    assert.ok(route && Number.isSafeInteger(route.version)); return String(route.version);
  }
  const reason = `Fictional return-review ${stage} acceptance; preserve earlier completed routes`;
  await command(`${stage}-shift`, "admin_manage_shift_load", { p_shift_id: selected.shiftID, p_expected_version: "0", p_action: "create",
    p_payload: { active_device_id: plan.deviceID, driver_user_id: plan.driverID, lines: selected.loadLines,
      notes: sale ? "Sell two washing-up liquid cartons as the new original invoice for review acceptance." : "Collect one carton with original invoice evidence; later office approval is recorded separately.",
      reason, required_load_confirmation: true, service_date: plan.serviceDate } });
  await command(`${stage}-route`, "admin_manage_route", { p_route_id: selected.routeID, p_expected_version: "0", p_action: "create",
    p_payload: { driver_user_id: plan.driverID, notes: reason, reason, service_date: plan.serviceDate, shift_id: selected.shiftID } });
  await command(`${stage}-stop`, "admin_manage_route_stop", { p_route_id: selected.routeID,
    p_expected_route_version: await version(), p_action: "add", p_payload: {
      customer_account_id: plan.customerID, delivery_notes: sale ? "Sell two cartons and record the cash." : "Collect one carton using the downloaded original invoice.",
      expected_payment_details: sale ? "Fictional cash payment." : "Original credit only; no cash received.", id: selected.stopID, planned_order_id: null,
      reason, shop_location_id: plan.shopID, stop_sequence: "1" } });
  await command(`${stage}-publish`, "admin_manage_route", { p_route_id: selected.routeID, p_expected_version: await version(), p_action: "publish", p_payload: { reason } });
  let downloadDevice = plan.deviceID, downloadInstallation = plan.installationID;
  if (!sale) {
    if (!selected.isolatedInstallationID) { selected.isolatedInstallationID = randomUUID(); save(); }
    const [registered] = await request("/rest/v1/rpc/provision_driver_device", owner.token, {
      p_organization_id: org, p_user_id: plan.driverID, p_installation_id: selected.isolatedInstallationID,
      p_display_name: "Fictional return-review acceptance phone",
    });
    assert.ok(registered && registered.revoked_at === null);
    if (selected.isolatedDeviceID) assert.equal(selected.isolatedDeviceID, registered.device_id);
    selected.isolatedDeviceID = String(registered.device_id); save();
    downloadDevice = selected.isolatedDeviceID; downloadInstallation = selected.isolatedInstallationID;
    const [shift] = await request(`/rest/v1/shifts?organization_id=eq.${org}&id=eq.${selected.shiftID}&select=version`, owner.token);
    assert.ok(shift && Number.isSafeInteger(shift.version));
    await command("collection-isolated-phone", "admin_manage_shift_load", { p_shift_id: selected.shiftID,
      p_expected_version: String(shift.version), p_action: "update", p_payload: {
        active_device_id: downloadDevice, driver_user_id: plan.driverID, lines: selected.loadLines,
        notes: "Separate fictional phone for the collection review; preserve the source phone and its daily download.",
        reason, required_load_confirmation: true, service_date: plan.serviceDate,
      } });
  }
  await command(sale ? "source-download" : "collection-isolated-download", "admin_prepare_driver_download", { p_route_id: selected.routeID, p_expected_route_version: await version(),
    p_device_id: downloadDevice, p_work_package_id: selected.packageID, p_reason: reason });
  writeFileSync(`${root}artifacts/backend/return-review-${stage}-configuration.json`, JSON.stringify({
    backendURL: base, publicCredential: status.ANON_KEY, ...credentials.DRIVER_ONE, organizationID: org,
    deviceID: downloadDevice, installationID: downloadInstallation, workPackageID: selected.packageID,
    productID: plan.productID, rootName: selected.rootName, sourceLineID: sourceEvidence?.lineID ?? null,
  }), { mode: 0o600 });
  console.log(`Fictional ${stage} route ready: ${selected.routeID}`);
}
