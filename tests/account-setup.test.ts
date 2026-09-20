import test from "node:test";
import assert from "node:assert/strict";
import { setupToken, validProvisionResult } from "../src/domain/account-setup.ts";

const id = "94030000-0000-4000-8000-000000000001";
const fragment = `#token_hash=${"a".repeat(64)}&type=invite`;
test("account setup accepts only one invite or recovery token", () => {
  assert.equal(setupToken(fragment)?.type, "invite");
  for (const invalid of ["", fragment + "&type=recovery", fragment + "&redirect=https://other.test", fragment.replace("invite", "signup"), "#token_hash=short&type=invite"]) assert.equal(setupToken(invalid), undefined);
});
test("owner setup links must match the configured office origin and request", () => {
  const row = { contract_version: 1, request_id: id, profile_id: id, state: "invited", setup_url: `https://office.example.com/account/setup${fragment}` };
  assert.equal(validProvisionResult(row, id, "https://office.example.com"), true);
  assert.equal(validProvisionResult({ ...row, setup_url: `https://attacker.example.com/account/setup${fragment}` }, id, "https://office.example.com"), false);
  assert.equal(validProvisionResult({ ...row, state: "active" }, id, "https://office.example.com"), false);
  assert.equal(validProvisionResult({ ...row, state: "active", setup_url: null }, id, "https://office.example.com"), true);
});
