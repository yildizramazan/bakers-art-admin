/** Independently verify real financial review, role boundaries, immutable facts and stored PDFs. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseReturnReviews } from "../src/domain/return-reviews.ts";
const root = fileURLToPath(new URL("../../", import.meta.url));
const status = JSON.parse(readFileSync(`${root}artifacts/backend/local-status.json`, "utf8"));
const credentials = JSON.parse(readFileSync(`${root}artifacts/backend/development-credentials.json`, "utf8"));
const plan = JSON.parse(readFileSync(`${root}artifacts/backend/return-review-demo-plan.json`, "utf8"));
const source = JSON.parse(readFileSync(`${root}artifacts/backend/return-review-source-evidence.json`, "utf8"));
const collection = JSON.parse(readFileSync(`${root}artifacts/backend/return-review-collection-evidence.json`, "utf8"));
const correction = JSON.parse(readFileSync(`${root}artifacts/backend/return-review-correction-evidence.json`, "utf8"));
const stage = process.argv[2]; assert.ok(stage === "pending" || stage === "approved");
const base = String(status.API_URL), org = "10000000-0000-4000-8000-000000000001";
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):54321$/);
assert.equal(source.packageID, plan.source.packageID); assert.equal(collection.packageID, plan.collection.packageID);
assert.deepEqual(collection.failures, []); assert.ok(collection.lostV6Replies >= 1);
async function login(role: string) {
  const response = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: status.ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify(credentials[role]) });
  assert.equal(response.status, 200); const session = await response.json(); assert.equal(session.user.app_metadata.development_seed, true);
  return { apikey: status.ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
}
const owner = await login("OWNER"), accountant = await login("ACCOUNTANT");
async function rows(table: string, filter: string, select: string) {
  const response = await fetch(`${base}/rest/v1/${table}?organization_id=eq.${org}&${filter}&select=${select}`, { headers: owner });
  assert.equal(response.status, 200, `${table} authorized read`); const data = await response.json(); assert.ok(Array.isArray(data)); assert.ok(data.length < 1000); return data;
}
async function reviews(headers: typeof owner) {
  const response = await fetch(`${base}/rest/v1/rpc/get_office_return_reviews`, { method: "POST", headers,
    body: JSON.stringify({ p_organization_id: org, p_include_resolved: true, p_limit: 100, p_offset: 0 }) });
  assert.equal(response.status, 200); return assertParsed(await response.json());
}
function assertParsed(value: unknown) { const parsed = parseReturnReviews(value); assert.ok(parsed); return parsed; }
const ownerQueue = await reviews(owner), accountantQueue = await reviews(accountant);
assert.equal(ownerQueue.canResolve, true); assert.equal(accountantQueue.canResolve, false);
const review = ownerQueue.items.find((item) => item.deliveryID === collection.deliveryID); assert.ok(review);
assert.deepEqual(accountantQueue.items.find((item) => item.id === review.id), review);
assert.equal(review.net, collection.netMinor); assert.equal(review.tax, collection.taxMinor); assert.equal(review.gross, collection.grossMinor);
assert.equal(review.cash, "0"); assert.equal(review.lines.length, 1); assert.equal(review.lines[0]?.quantity, "1");
assert.equal(review.lines[0]?.reasonCode, "original_sale_corrected");
const denied = await fetch(`${base}/rest/v1/rpc/admin_resolve_original_sale_review`, { method: "POST", headers: accountant,
  body: JSON.stringify({ p_organization_id: org, p_request_id: randomUUID(), p_exception_id: review.id,
    p_expected_version: review.version, p_decision: "authorized_manual_return", p_reason: "Fictional denied unauthorized approval", p_approval_reference: "No correction permission" }) });
assert.equal(denied.status, 403); assert.equal((await denied.json()).code, "42501");
const [delivery] = await rows("deliveries", `id=eq.${collection.deliveryID}`, "id,lifecycle_state,acceptance_state,finalization_state,total_net_minor:total_net_minor::text,total_tax_minor:total_tax_minor::text,total_gross_minor:total_gross_minor::text");
assert.equal(delivery.lifecycle_state, "completed");
assert.equal(delivery.total_net_minor, collection.netMinor); assert.equal(delivery.total_tax_minor, collection.taxMinor); assert.equal(delivery.total_gross_minor, collection.grossMinor);
const movements = await rows("inventory_movements", `shift_id=eq.${plan.collection.shiftID}&movement_kind=eq.return_collected`, "product_id,quantity:quantity::text,stock_bucket,direction");
assert.deepEqual(movements, [{ product_id: plan.productID, quantity: "1", stock_bucket: "returned_non_sellable", direction: 1 }]);
const cash = await rows("payments", `shift_id=eq.${plan.collection.shiftID}`, "amount_minor:amount_minor::text");
assert.ok(cash.every((row) => row.amount_minor === "0"));
const proofs = await rows("attachments", `delivery_id=eq.${collection.deliveryID}`, "id,upload_state");
assert.ok(proofs.length >= 1 && proofs.every((row) => row.upload_state === "verified"));
const originalDocuments = await rows("financial_documents", `source_delivery_id=eq.${source.deliveryID}`, "id,kind,gross_minor:gross_minor::text");
assert.equal(originalDocuments.length, 1);
assert.equal(originalDocuments[0]?.kind, "invoice"); assert.equal(originalDocuments[0]?.gross_minor, source.grossMinor);
const [correctionDocument] = await rows("financial_documents", `id=eq.${correction.financial_document_id}`, "id,kind,gross_minor:gross_minor::text,source_correction_id");
assert.equal(correctionDocument?.kind, "credit_note"); assert.equal(correctionDocument.gross_minor, "-1");
const [correctionRecord] = await rows("corrections", `id=eq.${correctionDocument.source_correction_id}`, "original_delivery_id,original_financial_document_id");
assert.equal(correctionRecord?.original_delivery_id, source.deliveryID);
assert.equal(correctionRecord.original_financial_document_id, originalDocuments[0]?.id);
const issued = await rows("financial_documents", `source_delivery_id=eq.${collection.deliveryID}`, "id,kind,issued_number,net_minor:net_minor::text,tax_minor:tax_minor::text,gross_minor:gross_minor::text");
if (stage === "pending") {
  assert.equal(collection.pendingReviewVerified, true); assert.equal(collection.acceptance, "needs_review");
  assert.equal(delivery.acceptance_state, "needs_review"); assert.notEqual(delivery.finalization_state, "issued");
  assert.equal(issued.length, 0); assert.equal(review.resolution, null); assert.equal(review.document, null);
} else {
  assert.equal(collection.pendingReviewVerified, true); assert.equal(collection.approvedOnSamePhone, true);
  assert.equal(delivery.acceptance_state, "accepted"); assert.equal(delivery.finalization_state, "issued");
  assert.equal(review.state, "resolved"); assert.equal(review.resolution?.decision, "authorized_manual_return");
  assert.equal(issued.length, 1); const credit = issued[0]; assert.equal(credit.kind, "credit_note");
  assert.equal(credit.net_minor, collection.netMinor); assert.equal(credit.tax_minor, collection.taxMinor); assert.equal(credit.gross_minor, collection.grossMinor);
  assert.equal(review.document?.id, credit.id);
  assert.equal((await rows("routes", `id=eq.${plan.collection.routeID}`, "status"))[0]?.status, "completed");
  assert.equal((await rows("shift_reconciliations", `shift_id=eq.${plan.collection.shiftID}`, "state"))[0]?.state, "completed");
  let artifacts: Array<{ state: string; storage_path: string; byte_count: number; content_sha256: string }> = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    artifacts = await rows("financial_document_artifacts", `financial_document_id=eq.${credit.id}`, "state,storage_path,byte_count,content_sha256");
    if (artifacts.length === 1 && artifacts[0]?.state === "stored") break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.equal(artifacts.length, 1); const artifact = artifacts[0]!; assert.equal(artifact.state, "stored");
  assert.ok(artifact.storage_path.startsWith(`organizations/${org}/`) && !artifact.storage_path.includes(".."));
  const response = await fetch(`${base}/storage/v1/object/wholesale-financial-private/${artifact.storage_path}`, { headers: owner });
  assert.equal(response.status, 200); const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF"); assert.equal(bytes.length, artifact.byte_count);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.content_sha256);
  writeFileSync(`${root}artifacts/pdf/return-review-approved-credit.pdf`, bytes, { mode: 0o600 });
}
writeFileSync(`${root}artifacts/backend/return-review-${stage}-server-evidence.json`, JSON.stringify({ checkedAt: new Date().toISOString(), stage,
  exceptionID: review.id, version: review.version, deliveryID: collection.deliveryID, sourceDeliveryID: source.deliveryID,
  creditMinor: review.credit, taxMinor: review.tax, review, verifiedProofs: proofs.length,
  accountantCanInspect: true, unauthorizedApprovalRejected: true, immutableCollectionTotalsPreserved: true }, null, 2), { mode: 0o600 });
console.log(`Verified ${stage} return review: one physical carton, exact credit/VAT, verified POD, role restrictions and ${issued.length} issued collection documents.`);
