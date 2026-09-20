/** Opt-in local integration: prepare the fictional route, verify REST evidence,
 * and create a private configuration for the real Swift acceptance test. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const status = JSON.parse(readFileSync(`${root}artifacts/backend/local-status.json`, "utf8"));
const credentials = JSON.parse(readFileSync(`${root}artifacts/backend/development-credentials.json`, "utf8"));
const base = status.API_URL as string;
assert.ok(new URL(base).protocol === "http:" && ["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const org = "10000000-0000-4000-8000-000000000001";
const routeID = "1c000000-0000-4000-8000-000000000001";
let checks = 0;
function pass(message: string) { console.log(`ok ${++checks} - ${message}`); }
async function request(path: string, token: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
async function signIn(role: string) {
  const result = await request("/auth/v1/token?grant_type=password", status.ANON_KEY, credentials[role]);
  assert.equal(result.status, 200, `${role} sign-in failed`);
  assert.equal(result.data.user.app_metadata.development_seed, true, "Only the synthetic seed may run live acceptance");
  return { token: result.data.access_token as string, userID: result.data.user.id as string };
}
const owner = await signIn("OWNER");
const driver = await signIn("DRIVER_ONE");
const accountant = await signIn("ACCOUNTANT");
const routeResult = await request(`/rest/v1/routes?organization_id=eq.${org}&id=eq.${routeID}&select=id,version,shift_id,status`, owner.token);
assert.equal(routeResult.status, 200);
const route = routeResult.data[0]; assert.ok(route && ["published", "ready"].includes(route.status), "Reset the fictional business before driver acceptance");
const shiftResult = await request(`/rest/v1/shifts?organization_id=eq.${org}&id=eq.${route.shift_id}&select=active_device_id,status`, owner.token);
const shift = shiftResult.data[0]; assert.ok(shift && ["planned", "load_pending"].includes(shift.status));
const deviceResult = await request(`/rest/v1/devices?organization_id=eq.${org}&id=eq.${shift.active_device_id}&user_id=eq.${driver.userID}&revoked_at=is.null&select=id,installation_id`, owner.token);
const device = deviceResult.data[0]; assert.ok(device, "Fictional assigned device must exist");
const packages = await request(`/rest/v1/work_packages?organization_id=eq.${org}&route_id=eq.${routeID}&select=id,status`, owner.token);
assert.equal(packages.status, 200); assert.ok(packages.data.length <= 1);
const packageID = packages.data[0]?.id ?? randomUUID();
let requestID = randomUUID();
let expectedVersion = String(route.version);
let reason = "Fictional driver integration: checked route, prices and load";
if (packages.data.length) {
  const audit = await request(`/rest/v1/audit_events?organization_id=eq.${org}&entity_id=eq.${packageID}&action=eq.admin_driver_download_prepare&select=request_correlation_id,reason,before_snapshot`, owner.token);
  assert.equal(audit.status, 200); assert.equal(audit.data.length, 1);
  requestID = audit.data[0].request_correlation_id; reason = audit.data[0].reason;
  expectedVersion = String(audit.data[0].before_snapshot.route.version);
}
const body = { p_organization_id: org, p_request_id: requestID, p_route_id: routeID,
  p_expected_route_version: expectedVersion, p_device_id: device.id, p_work_package_id: packageID, p_reason: reason };
const denied = await request("/rest/v1/rpc/admin_prepare_driver_download", accountant.token, body);
assert.equal(denied.status, 403); pass("accountant cannot prepare a driver download");
const first = await request("/rest/v1/rpc/admin_prepare_driver_download", owner.token, body);
assert.equal(first.status, 200, `Preparation failed: ${first.data.message ?? "unexpected response"}`);
assert.equal(first.data.entity_id, packageID); assert.equal(first.data.status, "issued");
const retry = await request("/rest/v1/rpc/admin_prepare_driver_download", owner.token, body);
assert.equal(retry.status, 200); assert.deepEqual(retry.data, first.data); pass("owner preparation and exact retry return one frozen package");
const identity = { p_organization_id: org, p_device_id: device.id, p_installation_id: device.installation_id };
const resolution = await request("/rest/v1/rpc/resolve_driver_sync_work_package", driver.token, identity);
assert.equal(resolution.status, 200); assert.equal(resolution.data.work_package.id, packageID); pass("driver discovers its assigned download");
const bootstrap = await request("/rest/v1/rpc/bootstrap_driver_sync_scope", driver.token, { ...identity, p_work_package_id: packageID });
assert.equal(bootstrap.status, 200);
const snapshot = bootstrap.data;
assert.equal(snapshot.manifest.length, snapshot.projections.length);
assert.equal(snapshot.work_package.manifest_item_count, snapshot.manifest.length);
assert.ok(snapshot.manifest.length > 100 && snapshot.manifest.length <= 5000);
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
for (const [index, item] of snapshot.manifest.entries()) {
  const projection = snapshot.projections[index];
  assert.equal(item.ordinal, index + 1); assert.equal(projection.ordinal, item.ordinal);
  assert.equal(item.content_sha256, projection.payload_sha256);
  assert.equal(sha(projection.payload), item.content_sha256);
}
pass("all download projections match exact SHA-256 bytes and contiguous manifest entries");
assert.equal(snapshot.manifest.filter((item: { item_type: string }) => item.item_type === "product").length, 15);
assert.equal(snapshot.manifest.filter((item: { item_type: string }) => item.item_type === "shop").length, 5);
pass("download contains the 15 fictional products and five assigned shops");
writeFileSync(`${root}artifacts/backend/driver-live-configuration.json`, JSON.stringify({
  backendURL: base, publicCredential: status.ANON_KEY, ...credentials.DRIVER_ONE,
  organizationID: org, deviceID: device.id, installationID: device.installation_id, workPackageID: packageID,
}), { mode: 0o600 });
writeFileSync(`${root}artifacts/backend/driver-download-acceptance.json`, JSON.stringify({ packageID, requestID, manifestCount: snapshot.manifest.length }), { mode: 0o600 });
pass("private Swift acceptance configuration saved without printing credentials");
console.log(`${checks} live driver-download checks passed.`);
