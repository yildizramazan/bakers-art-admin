import { canonicalUUIDPattern } from "./office-commands.ts";

export type ReturnReviewDecision = "original_sale" | "authorized_manual_return";
export interface ReturnReviewLine {
  id: string; productName: string; quantity: string; net: string; tax: string; gross: string;
  invoiceNumber: string; reasonCode: string; physicalReason: string;
}
export interface ReturnReview {
  id: string; version: string; state: string; deliveryID: string; customerName: string; createdAt: string;
  currency: string; net: string; tax: string; gross: string; credit: string; cash: string; lines: ReturnReviewLine[];
  resolution: { decision: ReturnReviewDecision; reason: string; resolvedAt: string } | null;
  document: { id: string; kind: "invoice" | "credit_note"; number: string } | null;
}
export interface ReturnReviewPage { total: string; canResolve: boolean; approvalRequired: boolean; items: ReturnReview[] }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid review response");
  return value as Record<string, unknown>;
}
function text(value: unknown, limit = 1000): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error("Invalid review text");
  return value;
}
function id(value: unknown): string { const result = text(value, 36); if (!canonicalUUIDPattern.test(result)) throw new Error("Invalid review identity"); return result; }
function integer(value: unknown, nonnegative = false, aggregate = false): string {
  const result = text(value, aggregate ? 40 : 20);
  if (!/^(?:0|-?[1-9]\d*)$/.test(result) || (nonnegative && BigInt(result) < 0n) ||
    (!aggregate && (BigInt(result) < -9223372036854775808n || BigInt(result) > 9223372036854775807n))) throw new Error("Invalid review amount");
  return result;
}
function date(value: unknown): string {
  const result = text(value, 50);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result)) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(result)) throw new Error("Invalid review date");
  return result;
}
function decision(value: unknown): ReturnReviewDecision {
  if (value !== "original_sale" && value !== "authorized_manual_return") throw new Error("Invalid review decision");
  return value;
}
function amounts(row: Record<string, unknown>) {
  const net = integer(row["net_minor"]), tax = integer(row["tax_minor"]), gross = integer(row["gross_minor"]);
  if (BigInt(net) + BigInt(tax) !== BigInt(gross)) throw new Error("Invalid review totals");
  return { net, tax, gross };
}

/** This bounded financial projection is also available to read-only accountants. */
export function parseReturnReviews(value: unknown): ReturnReviewPage | undefined {
  try {
    const root = object(value);
    if (root["contract"] !== "wholesale.office-return-reviews" || root["contract_version"] !== 1 ||
      typeof root["can_resolve"] !== "boolean" || typeof root["approval_reference_required"] !== "boolean" ||
      !Array.isArray(root["items"]) || root["items"].length > 100) return undefined;
    const items = root["items"].map((item): ReturnReview => {
      const row = object(item), totals = amounts(row);
      if (!["open", "under_review", "resolved"].includes(String(row["state"])) ||
        !Array.isArray(row["lines"]) || !row["lines"].length || row["lines"].length > 500 ||
        !/^[A-Z]{3}$/.test(text(row["currency_code"], 3))) throw new Error("Invalid review state");
      const lines = row["lines"].map((item): ReturnReviewLine => {
        const line = object(item), values = amounts(line), quantity = integer(line["quantity"], true);
        if (BigInt(quantity) === 0n || Object.values(values).some((v) => BigInt(v) > 0n) ||
          !["original_sale_capacity_changed", "original_sale_corrected"].includes(String(line["reason_code"]))) throw new Error("Invalid return line");
        return { ...values, id: id(line["id"]), productName: text(line["product_name"]), quantity,
          invoiceNumber: text(line["invoice_number"], 100), reasonCode: String(line["reason_code"]), physicalReason: text(line["physical_reason"]) };
      });
      if (new Set(lines.map((line) => line["id"])).size !== lines.length) throw new Error("Repeated return line");
      const credit = integer(row["credit_gross_minor"], true, true);
      if (lines.reduce((sum, line) => sum - BigInt(line["gross"]), 0n) !== BigInt(credit)) throw new Error("Invalid credit total");
      const resolution = row["resolution"] == null ? null : object(row["resolution"]);
      const document = row["document"] == null ? null : object(row["document"]);
      const version = integer(row["version"], true);
      if (BigInt(version) < 1n || (row["state"] === "resolved") !== (resolution !== null) ||
        (document && !["invoice", "credit_note"].includes(String(document["kind"])))) throw new Error("Invalid review resolution");
      return { ...totals, id: id(row["id"]), version, state: String(row["state"]), deliveryID: id(row["delivery_id"]),
        customerName: text(row["customer_name"]), createdAt: date(row["created_at"]), currency: String(row["currency_code"]),
        credit, cash: integer(row["cash_received_minor"], true, true), lines,
        resolution: resolution ? { decision: decision(resolution["decision"]), reason: text(resolution["reason"]), resolvedAt: date(resolution["resolved_at"]) } : null,
        document: document ? { id: id(document["id"]), kind: document["kind"] as "invoice" | "credit_note", number: text(document["number"], 100) } : null };
    });
    const total = integer(root["total"], true);
    if (BigInt(total) < items.length || new Set(items.map((item) => item.id)).size !== items.length) return undefined;
    return { total, canResolve: root["can_resolve"], approvalRequired: root["approval_reference_required"], items };
  } catch { return undefined; }
}

export function parseReturnReviewDecision(form: FormData, approvalRequired: boolean) {
  const single = (name: string) => { const values = form.getAll(name); return values.length === 1 && typeof values[0] === "string" ? values[0].trim() : undefined; };
  try {
    if (single("confirmed") !== "yes") return undefined;
    const version = integer(single("expected_version"), true);
    if (BigInt(version) < 1n) return undefined;
    const approval = single("approval_reference");
    if (form.getAll("approval_reference").length > 1 || (approvalRequired && !approval) || (approval && approval.length > 1000)) return undefined;
    return { requestID: id(single("request_id")), exceptionID: id(single("exception_id")), deliveryID: id(single("delivery_id")),
      version, decision: decision(single("decision")), reason: text(single("reason")), approval: approval || null };
  } catch { return undefined; }
}
export function isReturnReviewResult(value: unknown, input: NonNullable<ReturnType<typeof parseReturnReviewDecision>>): boolean {
  try {
    const row = object(value), finalization = object(row["finalization"]);
    return row["contract"] === "wholesale.office-command-result" && row["contract_version"] === 1 &&
      row["command"] === "financial.return_review.resolve" && row["request_id"] === input.requestID && row["resolution_id"] === input.requestID &&
      row["exception_id"] === input.exceptionID && row["delivery_id"] === input.deliveryID && row["decision"] === input.decision && row["state"] === "resolved" &&
      finalization["contract"] === "wholesale.financial-finalization-result" && finalization["contract_version"] === 1 &&
      finalization["delivery_id"] === input.deliveryID && ["invoice", "credit_note"].includes(String(finalization["document_kind"])) &&
      canonicalUUIDPattern.test(String(finalization["financial_document_id"])) && typeof finalization["issued_number"] === "string" &&
      finalization["issued_number"].trim().length > 0;
  } catch { return false; }
}
export function returnReviewFailure(code?: string): string {
  if (code === "42501") return "Your account cannot approve this credit. Accountants need correction authority and an approval reference.";
  if (code === "40001") return "This review changed. Reload the page and check the latest decision before continuing.";
  if (code === "23514") return "The original invoice allowance or payment evidence still prevents this decision. Review the details before choosing a different credit basis.";
  if (code === "P0002") return "This review is no longer available in your organization.";
  if (code === "22023") return "The decision details are invalid or differ from an earlier attempt. Review the form before submitting again.";
  return "The approval result could not be confirmed. Retry the same details to check it safely.";
}
