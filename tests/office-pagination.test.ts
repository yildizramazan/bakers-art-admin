import assert from "node:assert/strict";
import test from "node:test";
import { officePage } from "../src/domain/office-pagination.ts";

test("office lists open without a page parameter and retain canonical pagination", () => {
  assert.equal(officePage(undefined), 1);
  assert.equal(officePage("1"), 1);
  assert.equal(officePage("2"), 2);
  assert.equal(officePage("10000"), 10_000);
  for (const value of ["", "0", "01", "-1", "1.0", "1e2", " 1", "10001", ["1"], ["1", "2"]]) {
    assert.equal(officePage(value), undefined);
  }
});
