import assert from "node:assert/strict";
import test from "node:test";
import {
  EnvironmentConfigurationError,
  validateEnvironment,
  validateSupabasePublicConfiguration,
} from "../src/config/environment.ts";

const hosted = { NODE_ENV: "production", APP_ENV: "production", APP_ORIGIN: "https://office.example.com" } as const;

function legacyJWT(role: string): string {
  return `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.example-signature`;
}

test("a new local checkout can open the foundation without remote credentials", () => {
  assert.deepEqual(validateEnvironment({}), { environment: "development", origin: "http://localhost:3000" });
});

test("optimized builds require an explicit deployment environment", () => {
  assert.throws(() => validateEnvironment({ NODE_ENV: "production" }), EnvironmentConfigurationError);
  assert.equal(validateEnvironment({ NODE_ENV: "production", APP_ENV: "staging", APP_ORIGIN: "https://staging.example.com" }).environment, "staging");
});

test("invalid deployment names and incomplete hosted configuration fail closed", () => {
  for (const input of [
    { APP_ENV: "prod", APP_ORIGIN: "https://office.example.com" },
    { APP_ENV: "production" },
    { APP_ENV: "staging", APP_ORIGIN: "" },
  ]) assert.throws(() => validateEnvironment(input), EnvironmentConfigurationError);
});

test("hosted origins reject plaintext, credentials, loopback aliases and private names", () => {
  for (const environment of ["staging", "production"]) {
    for (const origin of [
      "http://office.example.com", "https://user:private@office.example.com",
      "https://localhost", "https://app.localhost.", "https://router.local", "https://host.internal",
      "https://127.0.0.1", "https://127.1", "https://0x7f000001", "https://0177.0.0.1",
      "https://[::1]", "https://[::ffff:127.0.0.1]", "https://[fd00::1]", "https://192.168.1.8",
      "https://example.invalid", "https://example.test", "https://intranet", "file:///tmp/office",
    ]) assert.throws(() => validateEnvironment({ ...hosted, APP_ENV: environment, APP_ORIGIN: origin }), EnvironmentConfigurationError, origin);
  }
});

test("origins cannot silently include a route, query or fragment", () => {
  for (const suffix of ["/account", "?token=hidden", "#route"]) {
    assert.throws(() => validateEnvironment({ ...hosted, APP_ORIGIN: `${hosted.APP_ORIGIN}${suffix}` }), EnvironmentConfigurationError);
  }
  assert.equal(validateEnvironment({ ...hosted, APP_ORIGIN: `${hosted.APP_ORIGIN}/` }).origin, hosted.APP_ORIGIN);
});

test("public deployment identity must match the server deployment identity", () => {
  assert.throws(
    () => validateEnvironment({ ...hosted, NEXT_PUBLIC_APP_ENV: "staging" }),
    /NEXT_PUBLIC_APP_ENV must match APP_ENV/,
  );
  assert.throws(
    () => validateEnvironment({ ...hosted, NEXT_PUBLIC_APP_ORIGIN: "https://other.example.com" }),
    /NEXT_PUBLIC_APP_ORIGIN must exactly match APP_ORIGIN/,
  );
  assert.deepEqual(
    validateEnvironment({ ...hosted, NEXT_PUBLIC_APP_ENV: "production", NEXT_PUBLIC_APP_ORIGIN: hosted.APP_ORIGIN }),
    { environment: "production", origin: "https://office.example.com" },
  );
});

test("service-role JWTs and new secret keys cannot be exposed under innocent names", () => {
  for (const secret of [legacyJWT("service_role"), `Bearer ${legacyJWT("service_role")}`, "sb_secret_private", "-----BEGIN PRIVATE KEY-----", "postgresql://user:password@db.example.com/app"]) {
    assert.throws(() => validateEnvironment({ ...hosted, NEXT_PUBLIC_KEY: secret }), EnvironmentConfigurationError);
  }
});

test("public secret variable names fail even when their values do not match known token formats", () => {
  for (const name of ["NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SECRET", "NEXT_PUBLIC_PASSWORD", "NEXT_PUBLIC_PRIVATE_KEY", "NEXT_PUBLIC_DATABASE_URL"]) {
    assert.throws(() => validateEnvironment({ ...hosted, [name]: "sensitive-value" }), EnvironmentConfigurationError);
  }
});

test("configuration diagnostics never echo credential values", () => {
  const credential = "sb_secret_DO_NOT_DISPLAY_THIS_VALUE";
  assert.throws(() => validateEnvironment({ ...hosted, NEXT_PUBLIC_KEY: credential }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes("NEXT_PUBLIC_KEY"));
    assert.ok(!error.message.includes(credential));
    return true;
  });
});

test("a legacy anonymous key remains permissible without being treated as an authenticated session", () => {
  assert.equal(validateEnvironment({ ...hosted, NEXT_PUBLIC_SUPABASE_ANON_KEY: legacyJWT("anon") }).environment, "production");
});

test("configured public endpoint URLs receive the same hosted HTTPS validation", () => {
  assert.throws(() => validateEnvironment({ ...hosted, NEXT_PUBLIC_SUPABASE_URL: "http://api.example.com" }), EnvironmentConfigurationError);
  assert.throws(() => validateEnvironment({ ...hosted, NEXT_PUBLIC_SUPABASE_URL: "https://user:secret@api.example.com" }), EnvironmentConfigurationError);
  assert.equal(validateEnvironment({ ...hosted, NEXT_PUBLIC_SUPABASE_URL: "https://api.example.com" }).environment, "production");
});

test("server-only secret configuration is neither returned nor serialized to clients", () => {
  const configuration = validateEnvironment({ ...hosted, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_backend_only" });
  assert.deepEqual(Object.keys(configuration).sort(), ["environment", "origin"]);
  assert.ok(!JSON.stringify(configuration).includes("sb_secret"));
  assert.ok(Object.isFrozen(configuration));
});

test("Supabase public configuration accepts only an endpoint and non-privileged public key", () => {
  const configuration = validateSupabasePublicConfiguration({
    ...hosted,
    NEXT_PUBLIC_SUPABASE_URL: "https://tenant.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef",
  });
  assert.deepEqual(configuration, {
    url: "https://tenant.supabase.co",
    publishableKey: "sb_publishable_1234567890abcdef",
  });
  assert.ok(Object.isFrozen(configuration));
});

test("Supabase public configuration fails closed for missing, conflicting or privileged values", () => {
  for (const input of [
    { ...hosted },
    { ...hosted, NEXT_PUBLIC_SUPABASE_URL: "https://tenant.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "short" },
    { ...hosted, NEXT_PUBLIC_SUPABASE_URL: "https://tenant.supabase.co/path", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef" },
    { ...hosted, NEXT_PUBLIC_SUPABASE_URL: "https://tenant.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_1234567890abcdef" },
    { ...hosted, NEXT_PUBLIC_SUPABASE_URL: "https://tenant.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef", NEXT_PUBLIC_SUPABASE_ANON_KEY: "another_public_key_1234567890" },
  ]) {
    assert.throws(() => validateSupabasePublicConfiguration(input), EnvironmentConfigurationError);
  }
});
