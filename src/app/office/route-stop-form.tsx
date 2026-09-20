"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { manageRouteStop, type OperationalActionState } from "@/app/office/operational-actions";
import type { RouteStopData } from "@/lib/office/editor-data";

const terminalStates = new Set(["completed", "skipped", "failed", "cancelled"]);

export function RouteStopForm({ data: initialData }: Readonly<{ data: RouteStopData }>) {
  const [data] = useState(initialData);
  const isDraft = data.status === "draft";
  const remaining = data.stops.filter((stop) => !terminalStates.has(String(stop["status"])));
  const [command, setCommand] = useState(isDraft ? "add" : "reorder");
  const [selectedID, setSelectedID] = useState("");
  const [values, setValues] = useState<Record<string, string>>({ customer_account_id: "", shop_location_id: "", planned_order_id: "", delivery_notes: "", expected_payment_details: "", reason: "" });
  const [ordered, setOrdered] = useState(remaining.map((stop) => String(stop["id"])));
  const attempt = useRef({ requestID: data.requestID, fingerprint: "" });
  const [state, action, pending] = useActionState(async (_previous: OperationalActionState, form: FormData): Promise<OperationalActionState> => {
    form.set("entity_id", data.routeID); form.set("expected_version", data.version);
    form.set("stop_id", command === "add" ? data.newStopID : selectedID);
    form.set("stop_sequence", String(Math.max(0, ...data.stops.map((stop) => Number(stop["stop_sequence"]))) + 1));
    form.set("change_id", data.changeID); form.set("ordered_stop_ids", ordered.join(","));
    const fingerprint = JSON.stringify([...form.entries()].filter(([name]) => !name.startsWith("$ACTION_")));
    if (attempt.current.fingerprint && attempt.current.fingerprint !== fingerprint) attempt.current.requestID = crypto.randomUUID();
    attempt.current.fingerprint = fingerprint;
    form.set("request_id", attempt.current.requestID);
    try { return await manageRouteStop({}, form); }
    catch { return { outcome: "error", message: "The response did not arrive. Retry these same details to confirm the result safely.", reference: attempt.current.requestID }; }
  }, {});
  function selectStop(id: string) {
    setSelectedID(id);
    const stop = data.stops.find((row) => row["id"] === id);
    setValues((previous) => ({ ...previous, ...Object.fromEntries(["customer_account_id", "shop_location_id", "planned_order_id", "delivery_notes", "expected_payment_details"].map((key) => [key, String(stop?.[key] ?? "")])) }));
  }
  function move(index: number, step: number) {
    setOrdered((previous) => { const next = [...previous]; const source = next[index], target = next[index + step]; if (source && target) { next[index] = target; next[index + step] = source; } return next; });
  }
  if (state.outcome === "success") return <section className="editor-result" role="status"><h2>Route stops saved</h2><Link className="primary-link" href={`/office/routes/${data.routeID}`}>View route</Link></section>;
  if (["completed", "cancelled"].includes(data.status)) return <p>This route has finished. Its stops are locked.</p>;
  return <form className="management-form editor-form" action={action} onReset={(event) => event.preventDefault()}><fieldset disabled={pending}><legend className="visually-hidden">Manage route stops</legend>
    <div className="editor-action"><label htmlFor="stop-action">Action</label><select id="stop-action" name="command_action" value={command} onChange={(event) => setCommand(event.target.value)}>{isDraft ? <><option value="add">Add a stop</option><option value="update">Edit a stop</option><option value="remove">Remove a stop</option></> : null}<option value="reorder">Reorder remaining stops</option></select></div>
    {(command === "update" || command === "remove") ? <div className="editor-field"><label htmlFor="selected-stop">Stop *</label><select id="selected-stop" value={selectedID} required onChange={(event) => selectStop(event.target.value)}><option value="">Choose stop…</option>{data.stops.map((stop) => <option value={String(stop["id"])} key={String(stop["id"])}>{String(stop["stop_sequence"])}. {String(stop["label"])}</option>)}</select></div> : null}
    {command === "reorder" ? <section className="editor-lines"><h2>Remaining stops</h2><p>Move stops into the desired order. Completed, skipped, failed and cancelled stops keep their positions.</p><ol className="stop-reorder-list">{ordered.map((id, index) => <li key={id}><span>{String(data.stops.find((stop) => stop["id"] === id)?.["label"])}</span><button type="button" className="quiet-button" disabled={index === 0} aria-label={`Move stop ${index + 1} up`} onClick={() => move(index, -1)}>↑ Up</button><button type="button" className="quiet-button" disabled={index === ordered.length - 1} aria-label={`Move stop ${index + 1} down`} onClick={() => move(index, 1)}>↓ Down</button></li>)}</ol></section> : command !== "remove" ? <div className="editor-grid">
      <div className="editor-field"><label htmlFor="stop-customer">Customer *</label><select id="stop-customer" name="customer_account_id" required value={values["customer_account_id"]} onChange={(event) => setValues((previous) => ({ ...previous, customer_account_id: event.target.value, shop_location_id: "", planned_order_id: "" }))}><option value="">Choose customer…</option>{data.customers.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></div>
      <div className="editor-field"><label htmlFor="stop-shop">Shop *</label><select id="stop-shop" name="shop_location_id" required value={values["shop_location_id"]} onChange={(event) => setValues((previous) => ({ ...previous, shop_location_id: event.target.value, planned_order_id: "" }))}><option value="">Choose shop…</option>{data.shops.filter((choice) => choice.parentID === values["customer_account_id"]).map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></div>
      <div className="editor-field editor-field-wide"><label htmlFor="stop-order">Published daily order</label><select id="stop-order" name="planned_order_id" value={values["planned_order_id"]} onChange={(event) => setValues((previous) => ({ ...previous, planned_order_id: event.target.value }))}><option value="">No planned order</option>{data.orders.filter((choice) => choice.parentID === values["shop_location_id"]).map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></div>
      {[["delivery_notes", "Delivery notes"], ["expected_payment_details", "Expected payment details"]].map(([key = "", label]) => <div key={key} className="editor-field"><label htmlFor={`stop-${key}`}>{label}</label><textarea id={`stop-${key}`} name={key} rows={3} maxLength={4000} value={values[key]} onChange={(event) => setValues((previous) => ({ ...previous, [key]: event.target.value }))} /></div>)}
    </div> : <p>Remove this stop from the draft route. This action is recorded in the audit history.</p>}
    <div className="editor-footer"><label htmlFor="stop-reason">Reason for this change *</label><textarea id="stop-reason" name="reason" rows={2} maxLength={1000} required value={values["reason"]} onChange={(event) => setValues((previous) => ({ ...previous, reason: event.target.value }))} />
      <label className="command-confirmation"><input type="checkbox" key={command} name="confirm_command" value={command} required />I confirm these route changes.</label>
      {state.message ? <div role="alert" className="form-error"><p>{state.message}</p>{state.reference ? <small>Reference: {state.reference}</small> : null}</div> : null}
      <div className="toolbar"><button type="submit" disabled={command === "reorder" && ordered.length < 2}>{pending ? "Saving…" : "Save route stops"}</button><Link href={`/office/routes/${data.routeID}`} className="quiet-link">Back without saving</Link></div>
    </div>
  </fieldset></form>;
}
