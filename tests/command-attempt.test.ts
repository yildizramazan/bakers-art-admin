import assert from "node:assert/strict";
import test from "node:test";
import { prepareCommandAttempt } from "../src/domain/command-attempt.ts";

function correction(amount = "-100") {
  const form = new FormData();
  form.set("original_delivery_id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  form.set("gross_delta_minor", amount);
  form.set("reason", "Damaged item");
  form.set("confirm_correction", "issue");
  return form;
}

test("a committed command with a lost response reuses request and correction identities", async () => {
  const receipts = new Map<string, string>();
  let effects = 0;
  let generated = 0;
  const newID = () => `generated-${++generated}`;
  async function server(form: FormData, loseResponse: boolean) {
    const key = String(form.get("request_id"));
    const result = receipts.get(key) ?? String(form.get("correction_id"));
    if (!receipts.has(key)) { receipts.set(key, result); effects++; }
    if (loseResponse) throw new Error("Connection ended after commit");
    return result;
  }

  const first = correction();
  const attempt = prepareCommandAttempt(first, undefined, ["request_id", "correction_id"], newID);
  await assert.rejects(server(first, true), /after commit/);
  const retry = correction();
  retry.set("reason", " Damaged item ");
  retry.set("request_id", "untrusted-browser-field");
  const retriedAttempt = prepareCommandAttempt(retry, attempt, ["request_id", "correction_id"], newID);
  assert.equal(retriedAttempt, attempt);
  assert.equal(await server(retry, false), first.get("correction_id"));
  assert.equal(retry.get("request_id"), first.get("request_id"));
  assert.equal(effects, 1);
  assert.equal(generated, 2);

  const changed = correction("-200");
  const changedAttempt = prepareCommandAttempt(changed, attempt, ["request_id", "correction_id"], newID);
  assert.notEqual(changedAttempt.identifiers["request_id"], attempt.identifiers["request_id"]);
  assert.notEqual(changedAttempt.identifiers["correction_id"], attempt.identifiers["correction_id"]);
});

test("form serialization order and framework fields do not create a second intent", () => {
  const first = correction();
  const attempt = prepareCommandAttempt(first, undefined, ["request_id"], () => "stable-request");
  const retry = new FormData();
  for (const [name, value] of [...first.entries()].reverse()) retry.append(name, value);
  retry.set("$ACTION_ID_framework", "irrelevant");
  const repeated = prepareCommandAttempt(retry, attempt, ["request_id"], () => { throw new Error("must reuse"); });
  assert.equal(repeated, attempt);
  retry.set("original_delivery_id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  assert.equal(prepareCommandAttempt(retry, attempt, ["request_id"], () => "other-delivery").identifiers["request_id"], "other-delivery");
});

test("financial forms reject file input before assigning command identities", () => {
  const form = correction();
  form.set("reason", new Blob(["content"]));
  assert.throws(() => prepareCommandAttempt(form, undefined, ["request_id"], () => "unused"), /does not accept files/);
  assert.equal(form.has("request_id"), false);
});
