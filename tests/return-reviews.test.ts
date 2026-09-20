import assert from "node:assert/strict";
import test from "node:test";
import { isReturnReviewResult, parseReturnReviewDecision, parseReturnReviews, returnReviewFailure } from "../src/domain/return-reviews.ts";
const uuid = (value: number) => `97000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
function queue() {
  return { contract: "wholesale.office-return-reviews", contract_version: 1, total: "1", can_resolve: true, approval_reference_required: false,
    items: [{ id: uuid(1), version: "9007199254740993", state: "open", delivery_id: uuid(2), customer_name: "Example Market",
      created_at: "2026-09-15T09:00:00+00:00", currency_code: "GBP", net_minor: "300", tax_minor: "60", gross_minor: "360", credit_gross_minor: "240", cash_received_minor: "360",
      lines: [{ id: uuid(3), product_name: "Example cartons", quantity: "2", net_minor: "-200", tax_minor: "-40", gross_minor: "-240", invoice_number: "DEMO-INV-1", reason_code: "original_sale_capacity_changed", physical_reason: "Unopened" }], resolution: null, document: null }] };
}
function form() {
  const result = new FormData();
  for (const [key, value] of Object.entries({ request_id: uuid(4), exception_id: uuid(1), delivery_id: uuid(2), expected_version: "9007199254740993", decision: "authorized_manual_return", reason: "Owner accepts recorded collection credit", confirmed: "yes" })) result.set(key, value);
  return result;
}
test("review projection retains exact money, large versions and read-only authority", () => {
  assert.equal(parseReturnReviews(queue())?.items[0]?.version, "9007199254740993");
  const readonly = queue(); readonly.can_resolve = false; readonly.approval_reference_required = true;
  assert.equal(parseReturnReviews(readonly)?.canResolve, false);
  assert.equal(parseReturnReviews({ ...queue(), items: [], total: "0" })?.total, "0");
});
test("review rejects unsafe totals, duplicate lines and unrecognized conflict states", () => {
  for (const alter of [
    (q: ReturnType<typeof queue>) => { q.items[0]!.gross_minor = "361"; },
    (q: ReturnType<typeof queue>) => { q.items[0]!.credit_gross_minor = "241"; },
    (q: ReturnType<typeof queue>) => { q.items[0]!.lines.push(q.items[0]!.lines[0]!); },
    (q: ReturnType<typeof queue>) => { q.items[0]!.lines[0]!.reason_code = "unknown"; },
    (q: ReturnType<typeof queue>) => { q.items[0]!.lines[0]!.quantity = "0"; },
    (q: ReturnType<typeof queue>) => { q.items[0]!.state = "resolved"; },
    (q: ReturnType<typeof queue>) => { q.items[0]!.version = "9223372036854775808"; },
  ]) { const candidate = queue(); alter(candidate); assert.equal(parseReturnReviews(candidate), undefined); }
  const unsafe = queue() as unknown as { items: Array<Record<string, unknown>> };
  unsafe.items[0]!["net_minor"] = 300;
  assert.equal(parseReturnReviews(unsafe), undefined);
});
test("credit decision requires exact identities, explicit confirmation and accountant approval", () => {
  assert.equal(parseReturnReviewDecision(form(), false)?.version, "9007199254740993");
  assert.equal(parseReturnReviewDecision(form(), true), undefined);
  const accountant = form(); accountant.set("approval_reference", "Owner approval example");
  assert.equal(parseReturnReviewDecision(accountant, true)?.approval, "Owner approval example");
  for (const [key, value] of [["confirmed", "no"], ["reason", " "], ["decision", "accept"], ["expected_version", "01"], ["request_id", "wrong"]]) {
    const candidate = form(); candidate.set(key!, value!); assert.equal(parseReturnReviewDecision(candidate, false), undefined);
  }
  const repeated = form(); repeated.append("decision", "original_sale"); assert.equal(parseReturnReviewDecision(repeated, false), undefined);
});
test("approval success must match the exact submitted intent and issued document", () => {
  const input = parseReturnReviewDecision(form(), false)!;
  const result = { contract: "wholesale.office-command-result", contract_version: 1, command: "financial.return_review.resolve",
    request_id: input.requestID, resolution_id: input.requestID, exception_id: input.exceptionID, delivery_id: input.deliveryID,
    decision: input.decision, state: "resolved", finalization: { contract: "wholesale.financial-finalization-result", contract_version: 1,
      delivery_id: input.deliveryID, financial_document_id: uuid(5), document_kind: "invoice", issued_number: "DEMO-INV-2" } };
  assert.equal(isReturnReviewResult(result, input), true);
  for (const candidate of [{ ...result, decision: "original_sale" }, { ...result, request_id: uuid(6) }, { ...result, finalization: {} }]) assert.equal(isReturnReviewResult(candidate, input), false);
  assert.match(returnReviewFailure("40001"), /Reload/);
  assert.match(returnReviewFailure("42501"), /correction authority/);
  assert.match(returnReviewFailure("XX000"), /Retry the same details/);
});
