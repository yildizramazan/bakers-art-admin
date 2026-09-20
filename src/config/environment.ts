/** Server-side deployment configuration; never export process.env to a client. */
export type AppEnvironment = "development" | "staging" | "production";
export type EnvironmentInput = Readonly<Record<string, string | undefined>>;

export interface AppConfiguration {
  readonly environment: AppEnvironment;
  readonly origin: string;
}

export interface SupabasePublicConfiguration {
  readonly url: string;
  readonly publishableKey: string;
}

export class EnvironmentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentConfigurationError";
  }
}

function fail(message: string): never {
  // Names are useful diagnostics; values may contain credentials and are never logged.
  throw new EnvironmentConfigurationError(message);
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  // Hosted environments require DNS names. Reject IP literals altogether,
  // including IPv4-mapped IPv6 and URL-normalized octal/hex loopback aliases.
  if (host.startsWith("[") || /^(?:\d+\.){3}\d+$/.test(host) || !host.includes(".")) return true;
  return ["localhost", "local", "internal", "test", "invalid", "example"].some((suffix) => host.endsWith(`.${suffix}`));
}

function validatedURL(name: string, value: string, environment: AppEnvironment): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(`${name} must be an absolute HTTP(S) URL.`);
  }
  if (url.username || url.password) fail(`${name} must not contain credentials.`);
  if (url.protocol !== "http:" && url.protocol !== "https:") fail(`${name} must use HTTP(S).`);
  if (environment !== "development" && (url.protocol !== "https:" || isLocalHostname(url.hostname))) {
    fail(`${name} must use a public HTTPS host in staging and production.`);
  }
  return url;
}

function isPrivilegedToken(value: string): boolean {
  if (/sb_secret_|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|postgres(?:ql)?:\/\//i.test(value)) return true;
  // Legacy Supabase JWTs identify service-role authority in their payload. Inspecting
  // this claim only detects unsafe configuration; it is never authentication.
  const token = value.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3 || parts[1] === undefined) return false;
  try {
    const encoded = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof payload === "object" && payload !== null && "role" in payload && payload.role === "service_role";
  } catch {
    return false;
  }
}

export function validateEnvironment(input: EnvironmentInput): AppConfiguration {
  const environmentValue = input["APP_ENV"]?.trim();
  if (!environmentValue && input["NODE_ENV"] === "production") {
    fail("APP_ENV must be explicitly set for a production-optimized build or server.");
  }
  const environment = environmentValue || "development";
  if (environment !== "development" && environment !== "staging" && environment !== "production") {
    fail("APP_ENV must be development, staging, or production.");
  }

  for (const [name, rawValue] of Object.entries(input)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !rawValue) continue;
    if (name.startsWith("NEXT_PUBLIC_VERCEL_")) continue;
    if (/(?:SECRET|SERVICE_ROLE|PASSWORD|PRIVATE_KEY|DATABASE_URL)/i.test(name) || isPrivilegedToken(rawValue)) {
      fail(`${name} contains or names a privileged credential and must not be public.`);
    }
    if (/(?:_URL|_ORIGIN)$/.test(name)) validatedURL(name, rawValue, environment);
  }

  const originValue = input["APP_ORIGIN"]?.trim() || (environment === "development" ? "http://localhost:3000" : "");
  if (!originValue) fail("APP_ORIGIN must be configured for staging and production.");
  const origin = validatedURL("APP_ORIGIN", originValue, environment);
  if (origin.pathname !== "/" || origin.search || origin.hash) fail("APP_ORIGIN must contain only the scheme, host and optional port.");

  const publicEnvironment = input["NEXT_PUBLIC_APP_ENV"]?.trim();
  if (publicEnvironment && publicEnvironment !== environment) {
    fail("NEXT_PUBLIC_APP_ENV must match APP_ENV.");
  }
  const publicOriginValue = input["NEXT_PUBLIC_APP_ORIGIN"]?.trim();
  if (publicOriginValue) {
    const publicOrigin = validatedURL("NEXT_PUBLIC_APP_ORIGIN", publicOriginValue, environment);
    if (publicOrigin.pathname !== "/" || publicOrigin.search || publicOrigin.hash || publicOrigin.origin !== origin.origin) {
      fail("NEXT_PUBLIC_APP_ORIGIN must exactly match APP_ORIGIN.");
    }
  }

  return Object.freeze({ environment, origin: origin.origin });
}

/**
 * Reads only the two values that are safe to expose to the browser. Database
 * authorization still comes from the signed-in user's JWT and PostgreSQL RLS;
 * this function deliberately has no service-role-key fallback.
 */
export function validateSupabasePublicConfiguration(
  input: EnvironmentInput,
): SupabasePublicConfiguration {
  const app = validateEnvironment(input);
  const rawURL = input["NEXT_PUBLIC_SUPABASE_URL"]?.trim();
  const publishable = input["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]?.trim();
  const legacyAnonymous = input["NEXT_PUBLIC_SUPABASE_ANON_KEY"]?.trim();

  if (!rawURL) fail("NEXT_PUBLIC_SUPABASE_URL must be configured.");
  if (publishable && legacyAnonymous && publishable !== legacyAnonymous) {
    fail("Configure one Supabase public key, not two different values.");
  }
  const publishableKey = publishable || legacyAnonymous;
  if (!publishableKey) fail("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be configured.");
  if (isPrivilegedToken(publishableKey)) {
    fail("The configured Supabase key is privileged and cannot be exposed publicly.");
  }
  if (publishableKey.length < 20 || /\s/.test(publishableKey)) {
    fail("The configured Supabase public key has an invalid shape.");
  }

  const url = validatedURL("NEXT_PUBLIC_SUPABASE_URL", rawURL, app.environment);
  if (url.pathname !== "/" || url.search || url.hash) {
    fail("NEXT_PUBLIC_SUPABASE_URL must contain only the scheme, host and optional port.");
  }
  return Object.freeze({ url: url.origin, publishableKey });
}
