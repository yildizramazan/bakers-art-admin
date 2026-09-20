import assert from "node:assert/strict";
import test from "node:test";
import { decimalFromHundredths, editorActions, editorForKind, hundredthsFromDecimal, signedHundredthsFromDecimal } from "../src/domain/office-editors.ts";
import { exactOfficeSelect } from "../src/domain/presentation.ts";

test("credit amounts typed in pounds preserve sign and exact pennies", () => {
  assert.equal(signedHundredthsFromDecimal("-1.69"), "-169");
  assert.equal(signedHundredthsFromDecimal("-0.01"), "-1");
  assert.equal(signedHundredthsFromDecimal("-0.00"), "0");
  assert.equal(signedHundredthsFromDecimal("-90071992547409.93"), "-9007199254740993");
  assert.equal(signedHundredthsFromDecimal("-92233720368547758.07"), "-9223372036854775807");
  for (const invalid of ["-92233720368547758.08", "--1", "1.001", "-1e3", "-01.00", "1,20", "", "-", "NaN"]) assert.equal(signedHundredthsFromDecimal(invalid), undefined);
});

test("editor queries retain exact database money, limits, quantities and versions", () => {
  assert.equal(exactOfficeSelect(["id", "unit_amount_minor", "limit_minor_units", "planned_quantity", "version", "is_active", "stop_sequence:stop_sequence::text"]),
    "id,unit_amount_minor:unit_amount_minor::text,limit_minor_units:limit_minor_units::text,planned_quantity:planned_quantity::text,version:version::text,is_active,stop_sequence:stop_sequence::text");
});

test("money input stays exact through the signed 64-bit limit", () => {
  assert.equal(hundredthsFromDecimal("92233720368547758.07"), "9223372036854775807");
  assert.equal(decimalFromHundredths("9223372036854775807"), "92233720368547758.07");
  assert.equal(hundredthsFromDecimal("1.2"), "120");
  assert.equal(hundredthsFromDecimal("0"), "0");
  for (const invalid of ["92233720368547758.08", "1.001", "-1", "1e3", "01.00", "1,20", "", "NaN"]) assert.equal(hundredthsFromDecimal(invalid), undefined);
  assert.equal(decimalFromHundredths(9007199254740992), "");
});

test("published policy and terminal routes cannot be edited", () => {
  const policy = editorForKind("price_revision")!;
  assert.deepEqual(editorActions(policy, null), ["create"]);
  assert.deepEqual(editorActions(policy, { published_at: null }), ["update", "publish"]);
  assert.deepEqual(editorActions(policy, { published_at: "2026-09-15T00:00:00Z" }), ["retire"]);
  for (const status of ["completed", "cancelled"]) assert.deepEqual(editorActions(editorForKind("route")!, { status }), []);
  assert.deepEqual(editorActions(editorForKind("standing_order")!, { status: "published" }), ["retire"]);
  assert.deepEqual(editorActions(editorForKind("shift")!, { status: "planned" }), ["update", "cancel"]);
});
