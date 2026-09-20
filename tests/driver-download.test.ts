import assert from "node:assert/strict";
import test from "node:test";
import { driverDownloadFailure, parseDriverDownload } from "../src/domain/driver-download.ts";

function preparation() {
  const form = new FormData();
  for (const [index, key] of ["request_id", "work_package_id", "route_id", "device_id"].entries()) {
    form.set(key, `96000000-0000-4000-8000-00000000000${index + 1}`);
  }
  form.set("expected_version", "2"); form.set("reason", "Checked fictional route and prices"); form.set("confirmed", "yes");
  return form;
}

test("driver download input requires one canonical identity, exact version and confirmation", () => {
  assert.equal(parseDriverDownload(preparation())?.expectedVersion, "2");
  for (const [key, value] of [["expected_version", "0"], ["expected_version", "2e1"], ["expected_version", "9223372036854775808"],
    ["expected_version", "02"], ["device_id", "wrong"], ["reason", " "], ["confirmed", "no"]]) {
    const form = preparation(); form.set(key!, value!); assert.equal(parseDriverDownload(form), undefined, key);
  }
  const duplicate = preparation(); duplicate.append("device_id", "96000000-0000-4000-8000-000000000005");
  assert.equal(parseDriverDownload(duplicate), undefined);
});

test("preparation failures explain a missing price without exposing unrecognized server details", () => {
  assert.match(driverDownloadFailure("23514", "publish sale and return prices for every catalogue product and assigned shop"), /Pricing is incomplete/);
  assert.match(driverDownloadFailure("40001"), /route changed/);
  assert.match(driverDownloadFailure("55000", "this shift already has a prepared download; review existing device work"), /pending work/);
  assert.doesNotMatch(driverDownloadFailure("XX000", "private schema internal details"), /private schema/);
});
