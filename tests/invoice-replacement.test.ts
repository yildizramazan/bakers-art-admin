import assert from "node:assert/strict";
import test from "node:test";
import { poundsToMinor, replacementTotals, parseInvoiceReplacement, type ReplacementLine } from "../src/domain/invoice-replacement.ts";
const line: ReplacementLine = { id: "10000000-0000-4000-8000-000000000001", description: "Fictional carton", quantity: "2", unitAmountMinor: "100", taxRateBasisPoints: 2000, priceMode: "tax_exclusive" };
test("replacement preview uses exact exclusive, inclusive and zero VAT totals", () => {
  assert.deepEqual(replacementTotals([line], ["0.90"]), { net_minor: "180", tax_minor: "36", gross_minor: "216" });
  assert.deepEqual(replacementTotals([{ ...line, priceMode: "tax_inclusive" }], ["1.19"]), { net_minor: "198", tax_minor: "40", gross_minor: "238" });
  assert.deepEqual(replacementTotals([{ ...line, taxRateBasisPoints: 0 }], ["1.69"]), { net_minor: "338", tax_minor: "0", gross_minor: "338" });
  assert.deepEqual(replacementTotals([{ ...line, quantity: "1", taxRateBasisPoints: 5000 }], ["0.01"]), { net_minor: "1", tax_minor: "1", gross_minor: "2" });
});
test("replacement money rejects ambiguity and overflow without floating point", () => {
  for (const input of ["1e2", "-1", " 1", "1 ", "01.50", "1.001", "1,000", "NaN", "Infinity", "92233720368547758.08"]) assert.equal(poundsToMinor(input), undefined);
  assert.equal(poundsToMinor("92233720368547758.07"), "9223372036854775807");
  assert.equal(replacementTotals([line], ["92233720368547758.07"]), undefined);
});
function form() {
  const result = new FormData();
  for (const key of ["request_id", "correction_id", "invoice_id", "original_line_id"]) result.set(key, line.id);
  result.set("unit_price", "0.90"); result.set("reason", "Fictional agreed price"); result.set("approval_reference", "");
  result.set("expected_net_minor", "180"); result.set("expected_tax_minor", "36"); result.set("expected_gross_minor", "216"); result.set("confirm_replacement", "issue");
  return result;
}
test("replacement command requires a complete exact preview and explicit confirmation", () => {
  assert.equal(parseInvoiceReplacement(form())?.unitPrices[0]?.unit_amount_minor, "90");
  for (const key of ["request_id", "correction_id", "invoice_id", "original_line_id", "unit_price", "reason", "approval_reference", "expected_net_minor", "expected_tax_minor", "expected_gross_minor", "confirm_replacement"]) {
    const missing = form(); missing.delete(key); assert.equal(parseInvoiceReplacement(missing), undefined, key);
  }
  const duplicate = form(); duplicate.append("request_id", line.id); assert.equal(parseInvoiceReplacement(duplicate), undefined);
  const duplicateLine = form(); duplicateLine.append("original_line_id", line.id); duplicateLine.append("unit_price", "1.00"); assert.equal(parseInvoiceReplacement(duplicateLine), undefined);
  const forgedTotals = form(); forgedTotals.set("expected_gross_minor", "215"); assert.equal(parseInvoiceReplacement(forgedTotals), undefined);
});
