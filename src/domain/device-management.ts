import { canonicalUUIDPattern } from "./office-commands.ts";

export type DeviceInputResult =
  | Readonly<{ ok: true; userID: string; installationID: string; displayName: string | null }>
  | Readonly<{ ok: false }>;

export function validateDeviceProvisionInput(formData: FormData): DeviceInputResult {
  const rawUserID = formData.get("user_id");
  const rawInstallationID = formData.get("installation_id");
  const rawDisplayName = formData.get("display_name");
  if (typeof rawUserID !== "string" || typeof rawInstallationID !== "string" || typeof rawDisplayName !== "string") {
    return { ok: false };
  }
  const userID = rawUserID.trim().toLowerCase();
  const installationID = rawInstallationID.trim().toLowerCase();
  const displayName = rawDisplayName.trim();
  if (!canonicalUUIDPattern.test(userID) || !canonicalUUIDPattern.test(installationID) || displayName.length > 120) {
    return { ok: false };
  }
  return { ok: true, userID, installationID, displayName: displayName || null };
}

export type DeviceRevocationInputResult =
  | Readonly<{ ok: true; requestID: string; deviceID: string; reason: string }>
  | Readonly<{ ok: false }>;

export function validateDeviceRevocationInput(formData: FormData): DeviceRevocationInputResult {
  const rawRequestID = formData.get("request_id");
  const rawDeviceID = formData.get("device_id");
  const rawReason = formData.get("reason");
  const confirmation = formData.get("confirm_revocation");
  if (typeof rawRequestID !== "string" || typeof rawDeviceID !== "string" || typeof rawReason !== "string" || confirmation !== "revoke") return { ok: false };
  const requestID = rawRequestID.trim().toLowerCase();
  const deviceID = rawDeviceID.trim().toLowerCase();
  const reason = rawReason.trim();
  if (!canonicalUUIDPattern.test(requestID) || !canonicalUUIDPattern.test(deviceID) || reason.length === 0 || reason.length > 500) return { ok: false };
  return { ok: true, requestID, deviceID, reason };
}
