"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { manageMembership, manageOrderRevision, managePolicyRevision, manageRoute, manageShiftLoad, saveMasterData, saveOrganization, type OperationalActionState } from "@/app/office/operational-actions";
import { membershipCapabilities } from "@/domain/admin-management";
import { decimalFromHundredths, hundredthsFromDecimal, type EditorField, type OfficeEditor } from "@/domain/office-editors";
import type { EditorData, EditorLine } from "@/lib/office/editor-data";

const actions = { master: saveMasterData, policy: managePolicyRevision, order: manageOrderRevision, route: manageRoute, load: manageShiftLoad, membership: manageMembership, organization: saveOrganization };
const actionLabels: Readonly<Record<string, string>> = { create: "Create", update: "Save changes", publish: "Publish", cancel: "Cancel record", retire: "Retire template" };
const capabilityLabels: Readonly<Record<string, string>> = {
  transaction_unit_price_override: "Override a sale price", transaction_discount: "Apply a discount", transaction_return_credit_override: "Override return credit", reorder_remaining_stops: "Reorder remaining stops", financial_correction: "Issue financial corrections",
};

export function EditorForm({ editor, data: initialData }: Readonly<{ editor: OfficeEditor; data: EditorData }>) {
  // A revalidated /new page generates fresh server IDs. Preserve this form's
  // entity/version across that render and across uncertain-response retries.
  const [data] = useState(initialData);
  const [values, setValues] = useState<Record<string, string>>({ ...data.values, reason: "" });
  const [lines, setLines] = useState<readonly EditorLine[]>(data.lines);
  const [command, setCommand] = useState(data.actions[0] ?? "");
  const [capabilities, setCapabilities] = useState(() => Object.fromEntries(data.capabilities.map((row) => [String(row["capability"]), { id: String(row["id"]), enabled: row["enabled"] === true, basis: decimalFromHundredths(row["limit_basis_points"]), minor: decimalFromHundredths(row["limit_minor_units"]) }])));
  const attempt = useRef({ fingerprint: "", requestID: data.requestID });
  const [state, action, pending] = useActionState(async (_previous: OperationalActionState, form: FormData): Promise<OperationalActionState> => {
    for (const field of editor.fields) {
      if (!form.has(field.name) || (field.kind !== "money" && field.kind !== "percent")) continue;
      const raw = String(form.get(field.name) ?? "").trim();
      const parsed = raw === "" && !field.required ? "" : hundredthsFromDecimal(raw);
      if (parsed === undefined || (field.kind === "percent" && parsed !== "" && BigInt(parsed) > 10000n)) return { outcome: "error", message: `${field.label}: enter ${field.kind === "percent" ? "0–100" : "a nonnegative amount"} with up to two decimal places.` };
      form.set(field.name, parsed);
    }
    if (editor.kind === "price_rule") {
      if (values["scope"] !== "customer_account") form.set("customer_account_id", "");
      if (values["scope"] !== "shop_location") form.set("shop_location_id", "");
    }
    if (editor.family === "membership") {
      form.set("is_active", values["status"] === "active" || values["status"] === "invited" ? "true" : "false");
      for (const capability of membershipCapabilities) {
        const selected = capabilities[capability];
        if (!selected?.enabled || values["role"] === "owner_admin" || (values["role"] === "accountant") !== (capability === "financial_correction")) continue;
        form.append("selected_capability", capability);
        form.set(`capability_id_${capability}`, selected.id);
        form.set(`capability_enabled_${capability}`, "true");
        for (const unit of ["basis", "minor"] as const) {
          const raw = selected[unit].trim();
          const parsed = raw === "" ? "" : hundredthsFromDecimal(raw);
          if (parsed === undefined || (unit === "basis" && parsed !== "" && BigInt(parsed) > 10000n)) return { outcome: "error", message: "Enter a valid permission limit with up to two decimal places." };
          form.set(`capability_${unit}_${capability}`, parsed);
        }
      }
    }
    form.set("entity_id", data.entityID);
    form.set("expected_version", data.version);
    if (editor.family === "master") form.set("entity_type", editor.kind);
    if (editor.family === "order") form.set("order_type", editor.kind);
    // Keep one request identity for identical retries, including a lost response.
    const fingerprint = JSON.stringify([...form.entries()].filter(([key]) => !key.startsWith("$ACTION_") && key !== "request_id"));
    if (attempt.current.fingerprint && attempt.current.fingerprint !== fingerprint) attempt.current.requestID = crypto.randomUUID();
    attempt.current.fingerprint = fingerprint;
    form.set("request_id", attempt.current.requestID);
    try { return await actions[editor.family]({}, form); }
    catch { return { outcome: "error", message: "The response did not arrive. Retry these same details to confirm the result safely.", reference: attempt.current.requestID }; }
  }, {});

  function change(name: string, value: string) {
    if (editor.kind === "planned_order" && name === "source_standing_order_id") setLines((current) => current.map((line) => ({ ...line, sourceID: "" })));
    setValues((previous) => ({ ...previous, [name]: value, ...Object.fromEntries(editor.fields.filter((field) => field.parentField === name).map((field) => [field.name, ""])) }));
  }
  function renderField(field: EditorField) {
    const value = values[field.name] ?? "";
    if (field.kind === "hidden") return <input key={field.name} type="hidden" name={field.name} value={value} />;
    if (editor.kind === "price_rule" && ((field.name === "customer_account_id" && values["scope"] !== "customer_account") || (field.name === "shop_location_id" && values["scope"] !== "shop_location"))) return <input key={field.name} type="hidden" name={field.name} value="" />;
    const available = (field.lookup ? data.options[field.lookup] ?? [] : field.choices ?? []).filter((option) => !field.parentField || option.parentID === values[field.parentField]);
    const id = `editor-${field.name}`;
    const shared = { id, name: field.name, required: field.required, value, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => change(field.name, event.target.value), ...(field.kind === "date" ? { onInput: (event: React.FormEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => change(field.name, event.currentTarget.value) } : {}), "aria-describedby": field.help ? `${id}-help` : undefined };
    return <div className={field.kind === "textarea" ? "editor-field editor-field-wide" : "editor-field"} key={field.name}>
      <label htmlFor={id}>{field.label}{field.required ? <span aria-hidden="true"> *</span> : null}</label>
      {field.kind === "select" ? <select {...shared}>
        {!available.some((option) => option.value === "") ? <option value="">{field.required ? "Choose…" : "None / use default"}</option> : null}
        {available.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select> : field.kind === "textarea" ? <textarea {...shared} rows={3} maxLength={field.maximum} /> : <input {...shared}
        type={field.kind === "date" || field.kind === "email" ? field.kind : "text"}
        inputMode={["money", "percent", "decimal"].includes(field.kind) ? "decimal" : field.kind === "integer" ? "numeric" : undefined}
        pattern={field.kind === "integer" ? "(0|[1-9][0-9]*)" : field.kind === "money" || field.kind === "percent" ? "(0|[1-9][0-9]*)(\\.[0-9]{1,2})?" : undefined}
        maxLength={field.kind === "integer" ? 16 : field.maximum} />}
      {field.help ? <p id={`${id}-help`} className="field-help">{field.help}</p> : null}
    </div>;
  }
  if (state.outcome === "success") {
    const id = editor.family === "membership" ? values["profile_id"] : state.entityID ?? data.entityID;
    return <section className="editor-result" role="status"><h2>Saved</h2><p>Your {editor.title.toLowerCase()} has been saved.</p><div className="toolbar"><Link className="primary-link" href={`/office/${editor.section}/${id}`}>View record</Link><Link className="quiet-link" href={`/office/${editor.section}`}>Back to list</Link></div>{state.reference ? <small>Reference: {state.reference}</small> : null}</section>;
  }
  if (!data.actions.length) return <section className="editor-result"><h2>This record is locked</h2><p>Published and completed records retain their history. Open the record to review it.</p><Link href={data.returnPath}>Back to record</Link></section>;
  const editingFields = command !== "cancel" && command !== "retire" && !(command === "publish" && editor.family !== "policy");
  return <form className="management-form editor-form" action={action} onReset={(event) => event.preventDefault()}>
    {data.notice ? <div className="editor-notice"><p>{data.notice.text}</p><Link href={data.notice.href}>{data.notice.label}</Link></div> : null}
    <fieldset disabled={pending}>
      <legend className="visually-hidden">{editor.title} details</legend>
      {!editingFields && editor.family === "policy" ? <><input type="hidden" name="revision_type" value={values["revision_type"] ?? ""} /><p>Choose tomorrow or a later date when this revision should stop applying. Publish a replacement revision starting on that date. Existing transaction amounts and today&apos;s issued work remain unchanged.</p></> : null}
      {data.actions.length > 1 ? <div className="editor-action"><label htmlFor="editor-action">Action</label><select id="editor-action" name="command_action" value={command} onChange={(event) => setCommand(event.target.value)}>{data.actions.map((value) => <option value={value} key={value}>{actionLabels[value] ?? value}</option>)}</select></div> : <input type="hidden" name="command_action" value={command} />}
      {editingFields ? <div className="editor-grid">{editor.fields.map(renderField)}</div> : command === "retire" ? renderField({ name: "effective_until", label: "Last effective date (exclusive)", kind: "date", required: true, initial: "", maximum: 10 }) : <p>{command === "publish" ? "Publish the saved draft for use in upcoming work." : "Cancel this record. Its history will remain available."}</p>}
      {editingFields && editor.lineTable ? <section className="editor-lines" aria-labelledby="editor-lines-title"><h2 id="editor-lines-title">{editor.family === "load" ? "Expected load" : "Order lines"}</h2><p>Use whole units. Each product can appear once.</p>
        {lines.map((line, index) => <div className="editor-line" key={line.id}>
          <input type="hidden" name="line_id" value={line.id} /><input type="hidden" name="line_display_order" value={index + 1} />
          {editor.kind === "planned_order" ? <input type="hidden" name="line_source_id" value={line.sourceID} /> : null}
          <label>Product {index + 1}<select name="line_product_id" aria-label={`Product ${index + 1}`} required value={line.productID} onChange={(event) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, productID: event.target.value, sourceID: "" } : item))}><option value="">Choose product…</option>{(data.options["products"] ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Quantity<input name="line_quantity" aria-label={`Quantity ${index + 1}`} required inputMode="numeric" pattern={editor.family === "load" ? "(0|[1-9][0-9]*)" : "[1-9][0-9]*"} maxLength={16} value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity: event.target.value } : item))} /></label>
          <button type="button" className="quiet-button" aria-label={`Remove line ${index + 1}`} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>Remove</button>
        </div>)}
        <button type="button" className="quiet-button" disabled={lines.length >= 500} onClick={() => setLines((current) => [...current, { id: crypto.randomUUID(), productID: "", quantity: "1", sourceID: "" }])}>Add product</button>
      </section> : null}
      {editor.family === "membership" && values["role"] !== "owner_admin" ? <section className="editor-lines"><h2>Additional permissions</h2>{membershipCapabilities.filter((capability) => (values["role"] === "accountant") === (capability === "financial_correction")).map((capability) => {
        const current = capabilities[capability];
        const unit = capability === "transaction_discount" ? "basis" : "minor";
        return <div className="capability-row" key={capability}><label className="command-confirmation"><input type="checkbox" checked={current?.enabled ?? false} onChange={(event) => setCapabilities((previous) => ({ ...previous, [capability]: { id: current?.id ?? crypto.randomUUID(), enabled: event.target.checked, basis: current?.basis ?? "", minor: current?.minor ?? "" } }))} />{capabilityLabels[capability]}</label>
          {current?.enabled && capability !== "reorder_remaining_stops" ? <label>Limit ({unit === "basis" ? "%" : "£"})<input inputMode="decimal" value={current[unit]} onChange={(event) => setCapabilities((previous) => ({ ...previous, [capability]: { ...current, [unit]: event.target.value } }))} /><small>Leave blank for no additional permission limit. Organization policy still applies.</small></label> : null}
        </div>;
      })}</section> : null}
      <div className="editor-footer"><label htmlFor="editor-reason">Reason for this change *</label><textarea id="editor-reason" name="reason" required maxLength={1000} rows={2} value={values["reason"] ?? ""} onChange={(event) => change("reason", event.target.value)} />
        <label className="command-confirmation"><input key={command} type="checkbox" name="confirm_command" value={command} required />I confirm these details and this action.</label>
        {state.message ? <div className="form-error" role="alert"><p>{state.message}</p>{state.reference ? <small>Reference: {state.reference}</small> : null}</div> : null}
        <div className="toolbar"><button type="submit">{pending ? "Saving…" : command === "retire" && editor.family === "policy" ? "Schedule end date" : actionLabels[command] ?? "Save"}</button><Link className="quiet-link" href={data.returnPath}>Back without saving</Link></div>
      </div>
    </fieldset>
  </form>;
}
