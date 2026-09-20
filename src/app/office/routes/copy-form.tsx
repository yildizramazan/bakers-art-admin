"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { prepareCommandAttempt, type CommandAttempt } from "@/domain/command-attempt";
import { copyRoute, type OperationalActionState } from "@/app/office/operational-actions";
import type { RouteCopyData } from "@/lib/office/editor-data";

export function RouteCopyForm({ data }: Readonly<{ data: RouteCopyData }>) {
  const attempt = useRef<CommandAttempt | undefined>(undefined);
  const [state, action, pending] = useActionState(async (_state: OperationalActionState, form: FormData): Promise<OperationalActionState> => {
    try {
      attempt.current = prepareCommandAttempt(form, attempt.current, ["request_id", "route_id"], () => crypto.randomUUID());
      return await copyRoute({}, form);
    } catch {
      return { outcome: "error", message: "The response did not arrive. Retry these same details to confirm the copy safely.",
        ...(attempt.current?.identifiers["request_id"] ? { reference: attempt.current.identifiers["request_id"] } : {}) };
    }
  }, {});
  return <section className="management-panel" aria-labelledby="copy-route-title">
    <h2 id="copy-route-title">New draft route</h2>
    <p>The selected shift supplies the new driver and date. Shops, stop order and delivery notes are copied. Daily orders and payment expectations start empty for the new day.</p>
    {state.message ? <div className={state.outcome === "error" ? "form-error" : "form-success"} role={state.outcome === "error" ? "alert" : "status"}>
      <p>{state.message}</p>{state.reference ? <small>Audit reference: <code>{state.reference}</code></small> : null}
    </div> : null}
    {state.outcome === "success" && state.entityID ? <div className="toolbar">
      <Link className="primary-link" href={`/office/routes/${state.entityID}/stops`}>Review stops and attach orders</Link>
      <Link className="quiet-link" href={`/office/routes/${state.entityID}`}>Open new route</Link>
    </div> : !data.stops.length ? <p>Add at least one stop to the source route before copying.</p>
      : !data.shifts.length ? <p>Create a planned shift for an active driver first. <Link href="/office/manage/shift/new">Create shift and expected load</Link></p>
        : <form action={action} onReset={(event) => event.preventDefault()} className="management-form">
          <input type="hidden" name="source_route_id" value={data.sourceRouteID} />
          <input type="hidden" name="expected_source_version" value={data.version} />
          <label htmlFor="copy-shift">New shift<select id="copy-shift" name="shift_id" required defaultValue="">
            <option value="" disabled>Choose date and driver</option>{data.shifts.map((shift) => <option key={shift.value} value={shift.value}>{shift.label}</option>)}
          </select></label>
          <label htmlFor="copy-reason">Reason<textarea id="copy-reason" name="reason" required maxLength={1000} placeholder="Repeat these visits for the next delivery day." /></label>
          <button type="submit" disabled={pending}>{pending ? "Copying route…" : state.outcome === "error" ? "Retry copy" : "Copy route"}</button>
        </form>}
  </section>;
}
