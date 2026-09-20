"use client";

import { useActionState, useRef } from "react";
import { prepareCommandAttempt, type CommandAttempt } from "@/domain/command-attempt";
import { prepareDriverDownload } from "./download-action";
import type { OperationalActionState } from "@/app/office/operational-actions";

export interface DownloadDevice { readonly id: string; readonly label: string }

export function DriverDownloadForm({ routeID, expectedVersion, devices, alreadyPrepared }: Readonly<{
  routeID: string; expectedVersion: string; devices: readonly DownloadDevice[]; alreadyPrepared: boolean;
}>) {
  const attempt = useRef<CommandAttempt | undefined>(undefined);
  const [state, action, pending] = useActionState(async (_state: OperationalActionState, form: FormData): Promise<OperationalActionState> => {
    try {
      attempt.current = prepareCommandAttempt(form, attempt.current, ["request_id", "work_package_id"], () => crypto.randomUUID());
      return await prepareDriverDownload({}, form);
    } catch {
      return { outcome: "error", message: "The response did not arrive. Retry these same details to confirm preparation safely.",
        ...(attempt.current?.identifiers["request_id"] ? { reference: attempt.current.identifiers["request_id"] } : {}) };
    }
  }, {});
  return <section className="management-panel" aria-labelledby="driver-download-title">
    <div><p className="eyebrow">Driver preparation</p><h2 id="driver-download-title">Prepare driver download</h2>
      <p>Prepare today&apos;s or tomorrow&apos;s route after checking the stops, daily orders, prices and expected load. The download remains valid until midnight after the following day in your business time zone.</p></div>
    {state.message ? <div className={state.outcome === "error" ? "form-error" : "form-success"} role={state.outcome === "error" ? "alert" : "status"}>
      <p>{state.message}</p>{state.reference ? <small>Audit reference: <code>{state.reference}</code></small> : null}
    </div> : null}
    {state.outcome === "success" ? null : alreadyPrepared && !state.reference ? <p>A download has already been prepared. Review its history below and ask the driver to sync on the assigned phone.</p>
      : devices.length === 0 ? <p>The driver needs to sign in on their phone first. Refresh this page after the phone registers.</p>
      : <form action={action} onReset={(event) => event.preventDefault()} className="management-form">
        <input type="hidden" name="route_id" value={routeID} /><input type="hidden" name="expected_version" value={expectedVersion} />
        <label htmlFor="download-device">Registered driver phone<select id="download-device" name="device_id" required defaultValue={devices.length === 1 ? devices[0]?.id : ""}>
          <option value="" disabled>Choose the phone used for this route</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}
        </select></label>
        <label htmlFor="download-reason">Preparation note<textarea id="download-reason" name="reason" required maxLength={1000} placeholder="Stops, prices and expected load checked for this route." /></label>
        <label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes" required />I checked the assignment and load and am ready for the driver to download.</label>
        <button type="submit" disabled={pending}>{pending ? "Preparing download…" : state.outcome === "error" ? "Retry preparation" : "Prepare download"}</button>
      </form>}
  </section>;
}
