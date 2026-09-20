import { canonicalUUIDPattern } from "./office-commands.ts";

const maxInt64 = 9223372036854775807n;
export interface ReplacementLine {
  readonly id: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitAmountMinor: string;
  readonly taxRateBasisPoints: number;
  readonly priceMode: "tax_inclusive" | "tax_exclusive";
}
export interface ReplacementTotals { readonly net_minor: string; readonly tax_minor: string; readonly gross_minor: string }

export function poundsToMinor(value: string): string | undefined {
  if (!/^(0|[1-9][0-9]{0,16})(\.[0-9]{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  return amount <= maxInt64 ? amount.toString() : undefined;
}
export function minorToPounds(value: string): string {
  const amount = BigInt(value);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}
export function replacementTotals(lines: readonly ReplacementLine[], pounds: readonly string[]): ReplacementTotals | undefined {
  if (!lines.length || lines.length > 1000 || lines.length !== pounds.length) return undefined;
  let net = 0n, tax = 0n, gross = 0n;
  for (const [index, line] of lines.entries()) {
    const price = poundsToMinor(pounds[index] ?? "");
    if (price === undefined || !/^[1-9][0-9]{0,18}$/.test(line.quantity)
      || !Number.isInteger(line.taxRateBasisPoints) || line.taxRateBasisPoints < 0 || line.taxRateBasisPoints > 10000) return undefined;
    const entered = BigInt(price) * BigInt(line.quantity);
    const rate = BigInt(line.taxRateBasisPoints);
    const denominator = line.priceMode === "tax_exclusive" ? 10000n : 10000n + rate;
    const numerator = entered * rate;
    const lineTax = numerator / denominator + (numerator % denominator * 2n >= denominator ? 1n : 0n);
    const lineNet = line.priceMode === "tax_exclusive" ? entered : entered - lineTax;
    net += lineNet; tax += lineTax; gross += lineNet + lineTax;
    if (gross > maxInt64) return undefined;
  }
  return { net_minor: net.toString(), tax_minor: tax.toString(), gross_minor: gross.toString() };
}
function one(form: FormData, key: string): string | undefined {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : undefined;
}
export function parseInvoiceReplacement(form: FormData) {
  const requestID = one(form, "request_id"), correctionID = one(form, "correction_id"), invoiceID = one(form, "invoice_id");
  const reason = one(form, "reason")?.trim(), approval = one(form, "approval_reference")?.trim();
  const ids = form.getAll("original_line_id"), prices = form.getAll("unit_price");
  if (![requestID, correctionID, invoiceID].every((id) => id && canonicalUUIDPattern.test(id))
    || !reason || reason.length > 500 || approval === undefined || approval.length > 250
    || one(form, "confirm_replacement") !== "issue" || ids.length < 1 || ids.length > 1000
    || ids.length !== prices.length || new Set(ids).size !== ids.length) return undefined;
  const unitPrices = [];
  for (const [index, id] of ids.entries()) {
    const price = prices[index];
    if (typeof id !== "string" || !canonicalUUIDPattern.test(id) || typeof price !== "string") return undefined;
    const amount = poundsToMinor(price);
    if (amount === undefined) return undefined;
    unitPrices.push({ original_line_id: id, unit_amount_minor: amount });
  }
  const net = one(form, "expected_net_minor"), tax = one(form, "expected_tax_minor"), gross = one(form, "expected_gross_minor");
  if (![net, tax, gross].every((v) => v && /^(0|[1-9][0-9]{0,18})$/.test(v) && BigInt(v) <= maxInt64)
    || BigInt(net!) + BigInt(tax!) !== BigInt(gross!) || BigInt(gross!) <= 0n) return undefined;
  return { requestID: requestID!, correctionID: correctionID!, invoiceID: invoiceID!, unitPrices,
    expectedTotals: { net_minor: net!, tax_minor: tax!, gross_minor: gross! }, reason, approvalReference: approval || null };
}
export function isInvoiceReplacementResult(value: unknown, requestID: string, correctionID: string, invoiceID: string): value is {
  invoice: { financial_document_id: string; issued_number: string };
  credit_note: { financial_document_id: string; issued_number: string };
} {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row["contract"] !== "wholesale.invoice-replacement-result" || row["contract_version"] !== 1
    || row["request_id"] !== requestID || row["correction_id"] !== correctionID || row["original_invoice_id"] !== invoiceID) return false;
  return ["invoice", "credit_note"].every((kind) => {
    const doc = row[kind] as Record<string, unknown> | undefined;
    return doc?.["contract"] === "wholesale.financial-finalization-result" && doc["contract_version"] === 1
      && doc["document_kind"] === kind && doc["correction_id"] === correctionID
      && typeof doc["financial_document_id"] === "string" && canonicalUUIDPattern.test(doc["financial_document_id"])
      && typeof doc["issued_number"] === "string" && doc["issued_number"].length > 0;
  });
}
