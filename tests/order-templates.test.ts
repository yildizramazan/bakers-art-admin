import test from "node:test";
import assert from "node:assert/strict";
import { canReviseOrder, copiedOrderLines, nextStandingOrderDate } from "../src/domain/order-templates.ts";

test("standing dates use the organization's date with an exclusive effective end", () => {
  assert.equal(nextStandingOrderDate("2026-09-15", "2026-09-01", null, 2), "2026-09-15");
  assert.equal(nextStandingOrderDate("2026-09-15", "2026-09-01", null, 1), "2026-09-21");
  assert.equal(nextStandingOrderDate("2026-09-15", "2026-10-01", null, 1), "2026-10-05");
  assert.equal(nextStandingOrderDate("2026-09-15", "2026-09-01", "2026-09-21", 1), undefined);
  assert.equal(nextStandingOrderDate("2026-09-15", "2026-09-01", "2026-09-22", 1), "2026-09-21");
  assert.equal(nextStandingOrderDate("2026-02-30", "2026-09-01", null, 1), undefined);
  assert.equal(nextStandingOrderDate("2026-09-15", "2026-09-01", null, 8), undefined);
});
test("generated and revised lines preserve quantities and provenance without reusing identities", () => {
  const rows = [{ id: "source-b", product_id: "b", planned_quantity: "9000000000000000", display_order: 2, source_standing_order_line_id: "original-b" }, { id: "source-a", product_id: "a", planned_quantity: "12", display_order: 1, source_standing_order_line_id: "original-a" }];
  const before = structuredClone(rows);
  let n = 0;
  const generated = copiedOrderLines(rows, "template", () => `new-${++n}`);
  assert.deepEqual(generated, [{ id: "new-1", productID: "a", quantity: "12", sourceID: "source-a" }, { id: "new-2", productID: "b", quantity: "9000000000000000", sourceID: "source-b" }]);
  const revised = copiedOrderLines(rows, "revision", () => `new-${++n}`);
  assert.equal(revised[0]?.sourceID, "original-a");
  assert.equal(revised[1]?.quantity, "9000000000000000");
  assert.deepEqual(rows, before);
});
test("only published daily plans and issued standing templates can be revised", () => {
  assert.equal(canReviseOrder("planned_order", "published"), true);
  for (const state of ["draft", "cancelled", "superseded", undefined]) assert.equal(canReviseOrder("planned_order", state), false);
  assert.equal(canReviseOrder("standing_order", "published"), true);
  assert.equal(canReviseOrder("standing_order", "retired"), true);
  assert.equal(canReviseOrder("standing_order", "draft"), false);
});
