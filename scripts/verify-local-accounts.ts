/** Fictional local-only Auth provisioning and activation acceptance. Never logs setup links. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { setupToken, validProvisionResult } from "../src/domain/account-setup.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const status = JSON.parse(readFileSync(`${root}artifacts/backend/local-status.json`, "utf8"));
const credentials = JSON.parse(readFileSync(`${root}artifacts/backend/development-credentials.json`, "utf8"));
const base = new URL(status.API_URL);
assert.ok(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname));
const org = "10000000-0000-4000-8000-000000000001";
let checks = 0;
function pass(message: string) { console.log(`ok ${++checks} - ${message}`); }
async function call(path: string, token: string, body?: unknown, method = "POST") {
  const response = await fetch(new URL(path, base), { method, headers: { apikey: status.ANON_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45000) });
  return { status: response.status, data: await response.json() };
}
async function login(role: string) {
  const result = await call("/auth/v1/token?grant_type=password", status.ANON_KEY, credentials[role]);
  assert.equal(result.status, 200, `Seeded ${role} sign in`);
  assert.equal(result.data.user.app_metadata.development_seed, true, "Only fictional seeded identities may run acceptance writes");
  return result.data.access_token as string;
}
const owner = await login("OWNER"), accountant = await login("ACCOUNTANT"), driver = await login("DRIVER_ONE");
const requestID = randomUUID(), suffix = requestID.slice(0, 8);
const email = `account-acceptance-${suffix}@pilot-wholesale.localhost`;
const payload = { email, display_name: "Fictional New Driver", employee_id: `NEW-${suffix}`, role: "driver", reason: "Synthetic account setup acceptance" };
const body = { action: "create", organization_id: org, request_id: requestID, payload };
const edge = "/functions/v1/admin-provision-user";
for (const [name, token] of [["anonymous", status.ANON_KEY], ["accountant", accountant], ["driver", driver]]) {
  const denied = await call(edge, token!, body);
  assert.ok([401, 403].includes(denied.status), `${name} provisioning denied (HTTP ${denied.status})`);
  pass(`${name} cannot provision an account`);
}
const created = await call(edge, owner, body);
assert.equal(created.status, 200, `Create account: ${String(created.data.error ?? created.data.code ?? "unexpected result")}`);
assert.ok(validProvisionResult(created.data, requestID, "http://localhost:3000"));
pass("owner creates invited Auth identity and employee profile with a private setup link");
const resumed = await call(edge, owner, { action: "resume", organization_id: org, request_id: requestID });
assert.equal(resumed.status, 200, `Resume account: ${String(resumed.data.error ?? "")}`);
assert.equal(resumed.data.profile_id, created.data.profile_id);
pass("interrupted or repeated setup resumes the same profile");
const token = setupToken(new URL(resumed.data.setup_url).hash);
assert.ok(token);
const verified = await call("/auth/v1/verify", status.ANON_KEY, token);
assert.equal(verified.status, 200, `Verify invitation: ${String(verified.data.error_code ?? "")}`);
assert.equal(verified.data.user.email, email);
pass("single-use invite verifies the intended employee email");
// Simulate interruption after email confirmation: owner recovers setup safely.
const recovery = await call(edge, owner, { action: "resume", organization_id: org, request_id: requestID });
assert.equal(recovery.status, 200, `Resume confirmed account: ${String(recovery.data.error ?? "")}`);
const recoveryToken = setupToken(new URL(recovery.data.setup_url).hash);
assert.equal(recoveryToken?.type, "recovery");
const recovered = await call("/auth/v1/verify", status.ANON_KEY, recoveryToken);
assert.equal(recovered.status, 200);
pass("interruption after confirmation recovers without creating a duplicate user");
const password = `${randomUUID()}${randomUUID()}`;
const updated = await call("/auth/v1/user", recovered.data.access_token, { password }, "PUT");
assert.equal(updated.status, 200, `Password save: ${String(updated.data.error_code ?? "")}`);
const activation = await call("/rest/v1/rpc/complete_own_account_setup", recovered.data.access_token, {});
assert.equal(activation.status, 200, `Activation: ${String(activation.data.code ?? "")}`);
assert.equal(activation.data.status, "active");
assert.equal(activation.data.role, "driver");
pass("employee chooses password and activates the assigned driver role");
const signin = await call("/auth/v1/token?grant_type=password", status.ANON_KEY, { email, password });
assert.equal(signin.status, 200);
assert.equal(signin.data.user.id, verified.data.user.id);
pass("new employee can sign in using their chosen password");
const replay = await call(edge, owner, body);
assert.equal(replay.status, 200);
assert.equal(replay.data.state, "active");
assert.equal(replay.data.setup_url, null);
pass("completed account replay cannot issue a password reset link");
writeFileSync(`${root}artifacts/backend/account-acceptance-private.json`, JSON.stringify({ requestID, profileID: created.data.profile_id, userID: verified.data.user.id, email, password }, null, 2), { mode: 0o600 });
console.log(`${checks} live account acceptance checks passed.`);
