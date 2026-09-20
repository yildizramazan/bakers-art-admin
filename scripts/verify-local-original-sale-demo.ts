/** Read-only verification of the second driver's real original-invoice credits. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const status = JSON.parse(readFileSync(`${root}artifacts/backend/local-status.json`, "utf8"));
const credentials = JSON.parse(readFileSync(`${root}artifacts/backend/development-credentials.json`, "utf8"));
const plan = JSON.parse(readFileSync(`${root}artifacts/backend/original-sale-demo-plan.json`, "utf8"));
const evidence = JSON.parse(readFileSync(`${root}artifacts/backend/original-sale-operational-acceptance.json`, "utf8"));
const base = String(status.API_URL), org = "10000000-0000-4000-8000-000000000001";
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(base));
assert.equal(evidence.packageID, plan.packageID); assert.equal(evidence.deliveryIDs.length, 2); assert.deepEqual(evidence.failures, []);
const login = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: status.ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify(credentials.OWNER) });
assert.equal(login.status, 200);
const session = await login.json(); assert.equal(session.user.app_metadata.development_seed, true);
const headers = { apikey: status.ANON_KEY, Authorization: `Bearer ${session.access_token}` };
async function rows(table: string, filter: string, select: string) {
  const response = await fetch(`${base}/rest/v1/${table}?organization_id=eq.${org}&${filter}&select=${select}`, { headers });
  assert.equal(response.status, 200, `${table} read failed`); const data = await response.json(); assert.ok(Array.isArray(data)); return data;
}
const ids = evidence.deliveryIDs as string[];
assert.ok(ids.every((id) => /^[0-9a-f-]{36}$/.test(id)));
const deliveries = await rows("deliveries", `work_package_id=eq.${plan.packageID}`, "id,lifecycle_state,acceptance_state,finalization_state,total_net_minor,total_tax_minor,total_gross_minor");
assert.deepEqual(deliveries.map((row) => row.id).sort(), [...ids].sort());
assert.ok(deliveries.every((row) => row.lifecycle_state === "completed" && row.acceptance_state === "accepted" && row.finalization_state === "issued"));
for (const [field, source] of [["total_net_minor", "net"], ["total_tax_minor", "tax"], ["total_gross_minor", "gross"]] as const) assert.equal(deliveries.reduce((sum, row) => sum + row[field], 0), -plan.source[source]);
console.log("ok 1 - two accepted collections exactly reverse the original sold net, VAT and gross, including the final rounding penny");
const allocations = await rows("return_credit_allocations", `original_delivery_line_id=eq.${plan.source.id}&kind=eq.reserve`, "id,delivery_id,allocated_quantity,allocated_net_minor,allocated_tax_minor,allocated_gross_minor");
assert.equal(allocations.length, 2); assert.deepEqual(allocations.map((row) => row.delivery_id).sort(), [...ids].sort());
assert.equal(allocations.reduce((sum, row) => sum + row.allocated_quantity, 0), plan.source.quantity);
for (const [field, source] of [["allocated_net_minor", "net"], ["allocated_tax_minor", "tax"], ["allocated_gross_minor", "gross"]] as const) assert.equal(allocations.reduce((sum, row) => sum + row[field], 0), plan.source[source]);
console.log("ok 2 - two unique original reservations use exactly the sold quantity and financial components");
const returned = await rows("inventory_movements", `shift_id=eq.${plan.shiftID}&movement_kind=eq.return_collected`, "quantity,stock_bucket,direction");
assert.equal(returned.reduce((sum, row) => sum + row.quantity, 0), plan.source.quantity);
assert.ok(returned.every((row) => row.stock_bucket === "returned_non_sellable" && row.direction === 1));
const payments = await rows("payments", `shift_id=eq.${plan.shiftID}`, "amount_minor,method,current_status");
assert.equal(payments.length, 2); assert.ok(payments.every((row) => row.amount_minor === 0 && row.method === "cash" && row.current_status === "paid"));
assert.equal((await rows("payment_allocations", `delivery_id=in.(${ids.join(",")})`, "id")).length, 0);
assert.deepEqual(await rows("cash_declarations", `shift_id=eq.${plan.shiftID}`, "expected_minor,declared_minor,discrepancy_minor"), [{ expected_minor: 0, declared_minor: 0, discrepancy_minor: 0 }]);
assert.equal((await rows("routes", `id=eq.${plan.routeID}`, "status"))[0]?.status, "completed");
assert.equal((await rows("shifts", `id=eq.${plan.shiftID}`, "status"))[0]?.status, "completed");
console.log("ok 3 - physical returns and the completed collection shift reconcile with zero cash receipt or refund");
const documents = await rows("financial_documents", `source_delivery_id=in.(${ids.join(",")})`, "id,kind,issued_number,gross_minor,document_snapshot");
assert.equal(documents.length, 2); assert.equal(new Set(documents.map((row) => row.issued_number)).size, 2);
assert.ok(documents.every((row) => row.kind === "credit_note" && row.document_snapshot.return_lines.length === 1 && row.document_snapshot.return_lines[0].original_sale_reference.invoice_number && row.document_snapshot.payment.cash_refunded_minor === "0"));
assert.equal(documents.reduce((sum, row) => sum + row.gross_minor, 0), -plan.source.gross);
const attachmentRows = await rows("attachments", `delivery_id=in.(${ids.join(",")})`, "upload_state");
assert.equal(attachmentRows.length, evidence.attachmentCount); assert.ok(attachmentRows.every((row) => row.upload_state === "verified"));
console.log("ok 4 - exactly two official credit notes preserve the original invoice references and verified collection proof");
let artifacts = await rows("financial_document_artifacts", `financial_document_id=in.(${documents.map((row) => row.id).join(",")})`, "financial_document_id,state,storage_path,content_sha256,byte_count");
for (let attempt = 0; attempt < 15 && artifacts.some((artifact) => artifact.state !== "stored"); attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  artifacts = await rows("financial_document_artifacts", `financial_document_id=in.(${documents.map((row) => row.id).join(",")})`, "financial_document_id,state,storage_path,content_sha256,byte_count");
}
assert.equal(artifacts.length, 2); assert.ok(artifacts.every((artifact) => artifact.state === "stored"));
for (const [index, artifact] of artifacts.entries()) {
  assert.ok(artifact.storage_path.startsWith(`organizations/${org}/`) && !artifact.storage_path.includes(".."));
  const response = await fetch(`${base}/storage/v1/object/wholesale-financial-private/${artifact.storage_path}`, { headers }); assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  assert.equal(bytes.length, artifact.byte_count); assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.content_sha256);
  writeFileSync(`${root}artifacts/pdf/original-sale-issued-${index + 1}.pdf`, bytes, { mode: 0o600 });
}
console.log("ok 5 - both private original-invoice credit PDFs are stored and match their independently checked hashes");
writeFileSync(`${root}artifacts/backend/original-sale-server-acceptance.json`, JSON.stringify({ checks: 5, routeID: plan.routeID, documentIDs: documents.map((row) => row.id), totalCreditMinor: String(plan.source.gross) }), { mode: 0o600 });
