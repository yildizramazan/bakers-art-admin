/** Read-only verification of the real two-store recovery acceptance. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const status = JSON.parse(readFileSync(`${root}artifacts/backend/local-status.json`, "utf8"));
const credentials = JSON.parse(readFileSync(`${root}artifacts/backend/development-credentials.json`, "utf8"));
const plan = JSON.parse(readFileSync(`${root}artifacts/backend/partial-recovery-demo-plan.json`, "utf8"));
const evidence = JSON.parse(readFileSync(`${root}artifacts/backend/partial-recovery-operational-acceptance.json`, "utf8"));
const base = String(status.API_URL), org = "10000000-0000-4000-8000-000000000001";
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):54321$/);
assert.equal(evidence.packageID, plan.packageID); assert.deepEqual(evidence.failures, []);
assert.equal(evidence.firstFactsAndEventBytesUnchanged, true);
assert.ok(BigInt(evidence.recoveredMinimumSequence) > BigInt(evidence.firstMaximumSequence));
const login = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST",
  headers: { apikey: status.ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify(credentials.OWNER) });
assert.equal(login.status, 200);
const session = await login.json(); assert.equal(session.user.app_metadata.development_seed, true);
const headers = { apikey: status.ANON_KEY, Authorization: `Bearer ${session.access_token}` };
async function rows(table: string, filter: string, select: string) {
  const response = await fetch(`${base}/rest/v1/${table}?organization_id=eq.${org}&${filter}&select=${select}`, { headers });
  assert.equal(response.status, 200, `${table} owner read`);
  const data = await response.json(); assert.ok(Array.isArray(data)); assert.ok(data.length < 1000); return data;
}
const deliveries = await rows("deliveries", `work_package_id=eq.${plan.packageID}`, "id,acceptance_state,lifecycle_state,finalization_state,total_gross_minor:total_gross_minor::text");
assert.equal(deliveries.length, 2); assert.deepEqual(deliveries.map((row) => row.id).sort(), [...evidence.deliveryIDs].sort());
assert.ok(deliveries.every((row) => row.acceptance_state === "accepted" && row.lifecycle_state === "completed" && row.finalization_state === "issued"));
const ids = `in.(${deliveries.map((row) => row.id).join(",")})`;
const lines = await rows("delivery_lines", `delivery_id=${ids}`, "product_id,quantity:quantity::text,gross_minor:gross_minor::text");
assert.equal(lines.length, 2); assert.ok(lines.every((line) => line.product_id === plan.productID && line.quantity === "1"));
const total = lines.reduce((sum, line) => sum + BigInt(line.gross_minor), 0n);
assert.equal(total.toString(), evidence.expectedCashMinor);
const payments = await rows("payments", `shift_id=eq.${plan.shiftID}`, "method,current_status,amount_minor:amount_minor::text");
assert.equal(payments.length, 2); assert.ok(payments.every((row) => row.method === "cash" && row.current_status === "paid"));
assert.equal(payments.reduce((sum, row) => sum + BigInt(row.amount_minor), 0n), total);
assert.deepEqual(await rows("cash_declarations", `shift_id=eq.${plan.shiftID}`, "expected_minor:expected_minor::text,declared_minor:declared_minor::text,discrepancy_minor:discrepancy_minor::text"),
  [{ expected_minor: total.toString(), declared_minor: total.toString(), discrepancy_minor: "0" }]);
assert.equal((await rows("routes", `id=eq.${plan.routeID}`, "status"))[0]?.status, "completed");
assert.equal((await rows("shifts", `id=eq.${plan.shiftID}`, "status"))[0]?.status, "completed");
const stops = await rows("route_stops", `route_id=eq.${plan.routeID}`, "id,status");
assert.equal(stops.length, 2); assert.ok(stops.every((stop) => stop.status === "completed"));
const movements = await rows("inventory_movements", `shift_id=eq.${plan.shiftID}&product_id=eq.${plan.productID}`, "stock_bucket,quantity:quantity::text,direction");
assert.equal(movements.filter((row) => row.stock_bucket === "sellable").reduce((sum, row) => sum + BigInt(row.quantity) * BigInt(row.direction), 0n), 2n);
assert.equal(movements.filter((row) => row.stock_bucket === "returned_non_sellable").length, 0);
const [reconciliation] = await rows("shift_reconciliations", `shift_id=eq.${plan.shiftID}`, "id,state");
assert.equal(reconciliation?.state, "completed");
const counted = await rows("shift_reconciliation_lines", `reconciliation_id=eq.${reconciliation.id}&product_id=eq.${plan.productID}`, "expected_sellable_quantity:expected_sellable_quantity::text,counted_sellable_quantity:counted_sellable_quantity::text");
assert.deepEqual(counted, [{ expected_sellable_quantity: "2", counted_sellable_quantity: "2" }]);
const attachments = await rows("attachments", `delivery_id=${ids}`, "id,upload_state");
assert.ok(attachments.length >= 2 && attachments.every((row) => row.upload_state === "verified"));
const documents = await rows("financial_documents", `source_delivery_id=${ids}`, "id,kind,issued_number,gross_minor:gross_minor::text");
assert.equal(documents.length, 2); assert.ok(documents.every((document) => document.kind === "invoice"));
assert.equal(new Set(documents.map((document) => document.issued_number)).size, 2);
assert.equal(documents.reduce((sum, document) => sum + BigInt(document.gross_minor), 0n), total);
const artifacts = await rows("financial_document_artifacts", `financial_document_id=in.(${documents.map((document) => document.id).join(",")})`, "state,storage_path,content_sha256,byte_count");
assert.equal(artifacts.length, 2); assert.ok(artifacts.every((artifact) => artifact.state === "stored"));
for (const [index, artifact] of artifacts.entries()) {
  assert.ok(artifact.storage_path.startsWith(`organizations/${org}/`) && !artifact.storage_path.includes(".."));
  const response = await fetch(`${base}/storage/v1/object/wholesale-financial-private/${artifact.storage_path}`, { headers });
  assert.equal(response.status, 200); const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF"); assert.equal(bytes.length, artifact.byte_count);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.content_sha256);
  writeFileSync(`${root}artifacts/pdf/partial-recovery-issued-${index + 1}.pdf`, bytes, { mode: 0o600 });
}
writeFileSync(`${root}artifacts/backend/partial-recovery-server-acceptance.json`, JSON.stringify({ checkedAt: new Date().toISOString(),
  routeID: plan.routeID, packageID: plan.packageID, deliveries: 2, invoices: 2, verifiedAttachments: attachments.length,
  cashMinor: total.toString(), remainingSellableQuantity: "2", declaredSellableQuantity: "2", storedPDFs: 2,
  firstMaximumSequence: evidence.firstMaximumSequence, recoveredMinimumSequence: evidence.recoveredMinimumSequence }, null, 2), { mode: 0o600 });
console.log("Verified recovered route: two accepted sales, exact combined cash, two remaining cartons, verified proofs and two original invoice PDFs.");
