"use client";

import { useActionState, type FormEvent } from "react";
import { provisionDriverDevice, revokeDriverDevice, type DeviceActionState } from "./device-actions";

const initialState: DeviceActionState = {};

export interface DriverDeviceRow {
  readonly id: string;
  readonly installationID: string;
  readonly displayName: string | null;
  readonly revokedAt: string | null;
  readonly lastSuccessfulSyncAt: string | null;
}

function prepareRequestID(event: FormEvent<HTMLFormElement>): void {
  try {
    const field = event.currentTarget.elements.namedItem("request_id");
    if (!(field instanceof HTMLInputElement)) throw new Error("Command identifier field is missing.");
    field.value = crypto.randomUUID();
  } catch {
    event.preventDefault();
  }
}

function ActionMessage({ state }: Readonly<{ state: DeviceActionState }>) {
  if (!state.message) return null;
  return (
    <div className={state.outcome === "error" ? "form-error" : "form-success"} role={state.outcome === "error" ? "alert" : "status"}>
      <p>{state.message}</p>
      {state.reference ? <small>Audit reference: <code>{state.reference}</code></small> : null}
    </div>
  );
}

function DeviceRevocationForm({ device }: Readonly<{ device: DriverDeviceRow }>) {
  const [state, action, pending] = useActionState(revokeDriverDevice, initialState);
  return (
    <div className="device-row" role="listitem">
      <div>
        <strong>{device.displayName ?? "Unnamed installation"}</strong>
        <span className="technical-value">{device.installationID}</span>
        <small>{device.lastSuccessfulSyncAt ? `Last successful sync: ${device.lastSuccessfulSyncAt}` : "No successful synchronization recorded"}</small>
      </div>
      {device.revokedAt ? <span className="status-chip">Revoked</span> : (
        <form action={action} className="device-revocation-form" aria-busy={pending} onSubmit={prepareRequestID}>
          <input type="hidden" name="request_id" />
          <input type="hidden" name="device_id" value={device.id} />
          <label htmlFor={`device-revocation-reason-${device.id}`}>Revocation reason</label>
          <textarea id={`device-revocation-reason-${device.id}`} name="reason" rows={2} required maxLength={500} />
          <label className="revocation-confirmation"><input type="checkbox" name="confirm_revocation" value="revoke" required /> Confirm terminal revocation</label>
          <button className="danger-button" type="submit" disabled={pending}>{pending ? "Revoking…" : "Revoke device"}</button>
        </form>
      )}
      <ActionMessage state={state} />
    </div>
  );
}

export function DriverDeviceManagement({ driverUserID, devices }: Readonly<{ driverUserID: string; devices: readonly DriverDeviceRow[] }>) {
  const [state, action, pending] = useActionState(provisionDriverDevice, initialState);
  return (
    <section className="management-panel" aria-labelledby="device-management-title">
      <div>
        <p className="eyebrow">Audited owner action</p>
        <h2 id="device-management-title">Driver device access</h2>
        <p>Provision an installation identifier shown by the driver app, or terminally revoke an existing installation. Revocation is idempotent, audited and re-authorized by the database RPC.</p>
      </div>
      <form action={action} className="management-form" aria-busy={pending}>
        <input type="hidden" name="user_id" value={driverUserID} />
        <label htmlFor="installation-id">Installation UUID</label>
        <input id="installation-id" name="installation_id" inputMode="text" autoComplete="off" spellCheck={false} required maxLength={36} placeholder="00000000-0000-4000-8000-000000000000" />
        <label htmlFor="device-name">Device name <span>(optional)</span></label>
        <input id="device-name" name="display_name" autoComplete="off" maxLength={120} />
        <button type="submit" disabled={pending}>{pending ? "Provisioning…" : "Provision device"}</button>
        <ActionMessage state={state} />
      </form>
      {devices.length > 0 ? <div className="device-list" role="list" aria-label="Existing driver devices">{devices.map((device) => <DeviceRevocationForm device={device} key={device.id} />)}</div> : <p className="compact-empty">No devices are registered for this user.</p>}
    </section>
  );
}
