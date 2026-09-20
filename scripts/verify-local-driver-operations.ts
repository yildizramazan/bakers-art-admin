/** Read-only verification of the fictional Swift route's server and PDF facts. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const status = JSON.parse(readFileSync(`${root}artifacts/backend/local-status.json`, "utf8"));
const credentials = JSON.parse(readFileSync(`${root}artifacts/backend/development-credentials.json`, "utf8"));
const evidence = JSON.parse(readFileSync(`${root}artifacts/backend/driver-operational-acceptance.json`, "utf8"));
const base = new URL(status.API_URL);
assert.ok(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname));
const org = "10000000-0000-4000-8000-000000000001";
const shift = "1b000000-0000-4000-8000-000000000001";
const route = "1c000000-0000-4000-8000-000000000001";
assert.equal(evidence.organizationID, org);
assert.equal(evidence.expectedCashMinor, "162518");
assert.deepEqual(evidence.failures, []);
assert.equal(evidence.deliveryIDs.length, 5);
assert.ok(evidence.deliveryIDs.every((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)));
const originalDeliveryFilter = `in.(${evidence.deliveryIDs.join(",")})`;
const login = await fetch(new URL("/auth/v1/token?grant_type=password", base), {
  method: "POST", headers: { apikey: status.ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify(credentials.OWNER),
});
assert.equal(login.status, 200);
const session = await login.json();
assert.equal(session.user.app_metadata.development_seed, true);
const headers = { apikey: status.ANON_KEY, Authorization: `Bearer ${session.access_token}` };
let checks = 0;
function pass(message: string) { console.log(`ok ${++checks} - ${message}`); }
async function rows(table: string, filter: string, select: string) {
  const url = new URL(`/rest/v1/${table}`, base);
  url.search = `organization_id=eq.${org}&${filter}&select=${select}`;
  const response = await fetch(url, { headers });
  assert.equal(response.status, 200, `${table} owner read failed`);
  const values = await response.json();
  assert.ok(Array.isArray(values));
  return values;
}
const deliveries = await rows("deliveries", `work_package_id=eq.${evidence.packageID}`,
  "id,lifecycle_state,acceptance_state,finalization_state,total_gross_minor");
assert.equal(deliveries.length, 5);
assert.deepEqual(deliveries.map((row) => row.id).sort(), [...evidence.deliveryIDs].sort());
assert.ok(deliveries.every((row) => row.lifecycle_state === "completed" && row.acceptance_state === "accepted" && row.finalization_state === "issued"));
assert.equal(deliveries.reduce((sum, row) => sum + row.total_gross_minor, 0), 162518);
pass("five original deliveries are accepted and invoiced for the independently checked £1,625.18");
assert.equal((await rows("shifts", `id=eq.${shift}`, "status"))[0]?.status, "completed");
assert.equal((await rows("routes", `id=eq.${route}`, "status"))[0]?.status, "completed");
const stops = await rows("route_stops", `route_id=eq.${route}`, "status");
assert.equal(stops.length, 5); assert.ok(stops.every((row) => row.status === "completed"));
pass("the shift, route and all five stops are completed");
const payments = await rows("payments", `shift_id=eq.${shift}`, "method,current_status,amount_minor");
assert.equal(payments.length, 5);
assert.ok(payments.every((row) => row.method === "cash" && row.current_status === "paid"));
assert.equal(payments.reduce((sum, row) => sum + row.amount_minor, 0), 162518);
const cash = await rows("cash_declarations", `shift_id=eq.${shift}`, "expected_minor,declared_minor,discrepancy_minor");
assert.deepEqual(cash, [{ expected_minor: 162518, declared_minor: 162518, discrepancy_minor: 0 }]);
assert.equal((await rows("shift_reconciliations", `shift_id=eq.${shift}`, "state"))[0]?.state, "completed");
pass("five cash payments reconcile exactly, without a cash discrepancy");
const returned = await rows("inventory_movements", `shift_id=eq.${shift}&movement_kind=eq.return_collected`, "quantity,stock_bucket,direction");
assert.deepEqual(returned, [{ quantity: 1, stock_bucket: "returned_non_sellable", direction: 1 }]);
pass("the returned item is recorded separately from sellable stock");
const attachments = await rows("attachments", `delivery_id=${originalDeliveryFilter}`, "upload_state");
assert.equal(attachments.length, 6); assert.ok(attachments.every((row) => row.upload_state === "verified"));
pass("all six signature/photo files have verified remote bytes");
const documents = await rows("financial_documents", `source_delivery_id=${originalDeliveryFilter}`, "id,source_delivery_id,kind,issued_number,gross_minor");
assert.equal(documents.length, 5);
assert.ok(documents.every((row) => row.kind === "invoice"));
assert.equal(new Set(documents.map((row) => row.issued_number)).size, 5);
assert.deepEqual(documents.map((row) => row.source_delivery_id).sort(), [...evidence.deliveryIDs].sort());
assert.equal(documents.reduce((sum, row) => sum + row.gross_minor, 0), 162518);
pass("lost-response retries issued exactly five distinct official invoices");
const artifacts = await rows("financial_document_artifacts", `financial_document_id=in.(${documents.map((document) => document.id).join(",")})`, "financial_document_id,state,storage_path,content_sha256,byte_count");
assert.equal(artifacts.length, 5); assert.ok(artifacts.every((row) => row.state === "stored"));
mkdirSync(`${root}artifacts/pdf`, { recursive: true });
for (const [index, artifact] of artifacts.entries()) {
  assert.ok(artifact.storage_path.startsWith(`organizations/${org}/`) && !artifact.storage_path.includes(".."));
  const response = await fetch(new URL(`/storage/v1/object/wholesale-financial-private/${artifact.storage_path}`, base), { headers });
  assert.equal(response.status, 200, "Owner must be able to download the private invoice PDF");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "%PDF");
  assert.equal(bytes.length, artifact.byte_count);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.content_sha256);
  writeFileSync(`${root}artifacts/pdf/operational-issued-${index + 1}.pdf`, bytes, { mode: 0o600 });
}
pass("all five private invoice PDFs download through owner authorization and match their stored hashes");
writeFileSync(`${root}artifacts/backend/driver-server-acceptance.json`, JSON.stringify({ checks, documents, artifacts }), { mode: 0o600 });
console.log(`${checks} server/financial acceptance checks passed.`);
