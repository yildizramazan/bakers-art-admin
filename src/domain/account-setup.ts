export interface AccountProvisionResult {
  readonly contract_version: 1;
  readonly request_id: string;
  readonly profile_id: string;
  readonly state: "invited" | "active";
  readonly setup_url: string | null;
}

export const accountUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function setupToken(fragment: string): { token_hash: string; type: "invite" | "recovery" } | undefined {
  const values = new URLSearchParams(fragment.replace(/^#/, ""));
  const hash = values.get("token_hash");
  const type = values.get("type");
  if (!hash || !/^[a-zA-Z0-9_-]{32,256}$/.test(hash) || (type !== "invite" && type !== "recovery") || [...values.keys()].sort().join() !== "token_hash,type") return;
  return { token_hash: hash, type };
}

export function validProvisionResult(value: unknown, requestID: string, appOrigin: string): value is AccountProvisionResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row["contract_version"] !== 1 || row["request_id"] !== requestID || typeof row["profile_id"] !== "string" || !accountUUID.test(row["profile_id"])) return false;
  if (row["state"] === "active") return row["setup_url"] === null;
  if (row["state"] !== "invited" || typeof row["setup_url"] !== "string") return false;
  try {
    const url = new URL(row["setup_url"]);
    return url.origin === appOrigin && url.pathname === "/account/setup" && !url.search && !url.username && !url.password && !!setupToken(url.hash);
  } catch { return false; }
}
