/** Prepare one fictional planned shift, then verify a copy made in the office UI.
 * Existing completed routes are never reset or updated. Command identities are
 * saved before transmission so rerunning after a lost reply is safe. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { localISODate } from "../src/domain/dates.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const status = JSON.parse(readFileSync(`${root}artifacts/backend/local-status.json`, "utf8"));
const credentials = JSON.parse(readFileSync(`${root}artifacts/backend/development-credentials.json`, "utf8"));
const base = String(status.API_URL), org = "10000000-0000-4000-8000-000000000001";
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(base));
async function request(path: string, token: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  assert.ok(response.ok, `${path.split("?")[0]} failed (${response.status}): ${data.message ?? "unexpected response"}`);
  return data;
}
const auth = await request("/auth/v1/token?grant_type=password", status.ANON_KEY, credentials.OWNER);
assert.equal(auth.user.app_metadata.development_seed, true);
assert.ok(String(auth.user.email).endsWith("@pilot-wholesale.localhost"));
const token = String(auth.access_token);
const planPath = `${root}artifacts/backend/route-copy-demo-plan.json`;
interface Plan {
  shiftID: string; serviceDate: string; source: Record<string, unknown>; stops: Record<string, unknown>[];
  shiftCommand: Record<string, unknown>;
}
let plan: Plan;
if (existsSync(planPath)) plan = JSON.parse(readFileSync(planPath, "utf8"));
else {
  assert.notEqual(process.argv[2], "verify", "Prepare the example before verifying it");
  const [source] = await request(`/rest/v1/routes?organization_id=eq.${org}&id=eq.1c000000-0000-4000-8000-000000000001&select=*`, token);
  assert.equal(source.status, "completed");
  const stops = await request(`/rest/v1/route_stops?organization_id=eq.${org}&route_id=eq.${source.id}&select=*&order=stop_sequence`, token);
  assert.equal(stops.length, 5);
  const products = await request(`/rest/v1/products?organization_id=eq.${org}&is_active=eq.true&select=id&order=id`, token);
  assert.equal(products.length, 15);
  const shiftID = randomUUID(), serviceDate = localISODate(new Date(), "Europe/London");
  plan = { shiftID, serviceDate, source, stops, shiftCommand: {
    p_organization_id: org, p_request_id: randomUUID(), p_shift_id: shiftID, p_expected_version: "0", p_action: "create",
    p_payload: { active_device_id: null, driver_user_id: source.driver_user_id,
      lines: products.map((product: { id: string }) => ({ id: randomUUID(), product_id: product.id, expected_quantity: "20" })),
      notes: "Fictional route-copy example. Review expected quantities and attach this day's orders before dispatch.",
      reason: "Prepare a fictional planned shift for route-copy UI acceptance", required_load_confirmation: true, service_date: serviceDate },
  } };
  writeFileSync(planPath, JSON.stringify(plan, null, 2), { mode: 0o600 });
}
if (process.argv[2] !== "verify") {
  const result = await request("/rest/v1/rpc/admin_manage_shift_load", token, plan.shiftCommand);
  assert.equal(result.entity_id, plan.shiftID); assert.equal(result.request_id, plan.shiftCommand["p_request_id"]);
  console.log(JSON.stringify({ prepared: true, shiftID: plan.shiftID, serviceDate: plan.serviceDate,
    sourceRouteID: plan.source["id"], sourceStopCount: plan.stops.length }));
} else {
  const [source] = await request(`/rest/v1/routes?organization_id=eq.${org}&id=eq.${plan.source["id"]}&select=*`, token);
  const sourceStops = await request(`/rest/v1/route_stops?organization_id=eq.${org}&route_id=eq.${plan.source["id"]}&select=*&order=stop_sequence`, token);
  assert.deepEqual(source, plan.source); assert.deepEqual(sourceStops, plan.stops);
  const routes = await request(`/rest/v1/routes?organization_id=eq.${org}&shift_id=eq.${plan.shiftID}&select=*`, token);
  assert.equal(routes.length, 1); const route = routes[0];
  assert.equal(route.status, "draft"); assert.equal(route.service_date, plan.serviceDate);
  assert.equal(route.driver_user_id, plan.source["driver_user_id"]); assert.equal(route.notes, plan.source["notes"]);
  assert.equal(route.published_at, null); assert.equal(route.started_at, null); assert.equal(route.completed_at, null);
  const stops = await request(`/rest/v1/route_stops?organization_id=eq.${org}&route_id=eq.${route.id}&select=*&order=stop_sequence`, token);
  assert.equal(stops.length, plan.stops.length);
  for (const [index, stop] of stops.entries()) {
    const original = plan.stops[index]!;
    assert.notEqual(stop.id, original["id"]); assert.equal(stop.status, "planned");
    for (const key of ["customer_account_id", "shop_location_id", "stop_sequence", "delivery_notes"]) assert.equal(stop[key], original[key]);
    for (const key of ["planned_order_id", "expected_payment_details", "arrived_at", "started_at", "completed_at"]) assert.equal(stop[key], null);
  }
  const audit = await request(`/rest/v1/audit_events?organization_id=eq.${org}&entity_id=eq.${route.id}&action=eq.admin_route_copy&select=id,request_correlation_id,after_snapshot`, token);
  assert.equal(audit.length, 1); assert.equal(audit[0].after_snapshot.copied_from_route_id, plan.source["id"]);
  const downloads = await request(`/rest/v1/work_packages?organization_id=eq.${org}&route_id=eq.${route.id}&select=id`, token);
  assert.equal(downloads.length, 0);
  const evidence = { checkedAt: new Date().toISOString(), routeID: route.id, sourceRouteID: plan.source["id"],
    shiftID: plan.shiftID, stops: stops.length, status: route.status, sourceUnchanged: true,
    newOrdersAndPaymentExpectationsEmpty: true, auditCount: audit.length, downloadCount: downloads.length };
  writeFileSync(`${root}artifacts/backend/route-copy-server-acceptance.json`, JSON.stringify(evidence, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(evidence));
}
