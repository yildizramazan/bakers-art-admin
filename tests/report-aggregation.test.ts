import assert from "node:assert/strict";
import test from "node:test";
import { csvCell } from "../src/domain/csv.ts";
import { aggregateReportRows, ReportAggregationError } from "../src/domain/report-aggregation.ts";
import { reportForRole } from "../src/domain/reports.ts";

function ownerReport(slug: string) {
  const report = reportForRole(slug, "owner_admin");
  assert.ok(report, `missing report ${slug}`);
  return report;
}

test("daily sales are grouped by calendar day and currency with exact BigInt totals", () => {
  const result = aggregateReportRows(ownerReport("daily-sales"), [
    { service_date: "2026-09-15", currency_code: "GBP", sale_net_minor: "9007199254740992", sale_tax_minor: "10", sale_gross_minor: "9007199254741002", return_net_minor: "-2", return_tax_minor: "-1", return_gross_minor: "-3", total_net_minor: "9007199254740990", total_tax_minor: "9", total_gross_minor: "9007199254740999" },
    { service_date: "2026-09-15", currency_code: "GBP", sale_net_minor: "8", sale_tax_minor: "2", sale_gross_minor: "10", return_net_minor: "0", return_tax_minor: "0", return_gross_minor: "0", total_net_minor: "8", total_tax_minor: "2", total_gross_minor: "10" },
    { service_date: "2026-09-15", currency_code: "EUR", sale_net_minor: "50", sale_tax_minor: "10", sale_gross_minor: "60", return_net_minor: "0", return_tax_minor: "0", return_gross_minor: "0", total_net_minor: "50", total_tax_minor: "10", total_gross_minor: "60" },
  ]);
  assert.deepEqual(result, [
    { service_date: "2026-09-15", currency_code: "EUR", delivery_count: "1", sale_net_minor: "50", sale_tax_minor: "10", sale_gross_minor: "60", return_net_minor: "0", return_tax_minor: "0", return_gross_minor: "0", total_net_minor: "50", total_tax_minor: "10", total_gross_minor: "60" },
    { service_date: "2026-09-15", currency_code: "GBP", delivery_count: "2", sale_net_minor: "9007199254741000", sale_tax_minor: "12", sale_gross_minor: "9007199254741012", return_net_minor: "-2", return_tax_minor: "-1", return_gross_minor: "-3", total_net_minor: "9007199254740998", total_tax_minor: "11", total_gross_minor: "9007199254741009" },
  ]);
});

test("route completion exposes completed, skipped, failed, cancelled and open counts", () => {
  const result = aggregateReportRows(ownerReport("route-completion"), [
    { route_id: "route-a", status: "completed" },
    { route_id: "route-a", status: "skipped" },
    { route_id: "route-a", status: "failed" },
    { route_id: "route-a", status: "cancelled" },
    { route_id: "route-a", status: "in_progress" },
    { route_id: "route-a", status: "planned" },
  ]);
  assert.deepEqual(result, [{
    route_id: "route-a", stop_count: "6", completed_stops: "1", skipped_stops: "1",
    failed_stops: "1", cancelled_stops: "1", open_stops: "2",
  }]);
});

test("cash totals use only the latest declaration revision for each shift", () => {
  const result = aggregateReportRows(ownerReport("cash"), [
    { shift_id: "shift-a", driver_user_id: "driver-a", declaration_revision: "1", currency_code: "GBP", expected_minor: "100", declared_minor: "90", discrepancy_minor: "-10" },
    { shift_id: "shift-a", driver_user_id: "driver-a", declaration_revision: "2", currency_code: "GBP", expected_minor: "100", declared_minor: "100", discrepancy_minor: "0" },
    { shift_id: "shift-b", driver_user_id: "driver-a", declaration_revision: "1", currency_code: "GBP", expected_minor: "50", declared_minor: "55", discrepancy_minor: "5" },
  ]);
  assert.deepEqual(result, [{
    driver_user_id: "driver-a", currency_code: "GBP", shift_count: "2",
    expected_minor: "150", declared_minor: "155", discrepancy_minor: "5",
  }]);
});

test("load report omits reconciled groups and computes exact non-zero discrepancies", () => {
  const result = aggregateReportRows(ownerReport("load-discrepancy"), [
    { shift_id: "shift-a", product_id: "product-a", expected_quantity: "5", confirmed_quantity: "5" },
    { shift_id: "shift-a", product_id: "product-b", expected_quantity: "6", confirmed_quantity: "4" },
    { shift_id: "shift-a", product_id: "product-b", expected_quantity: "1", confirmed_quantity: "2" },
  ]);
  assert.deepEqual(result, [{
    shift_id: "shift-a", product_id: "product-b", expected_quantity: "7",
    confirmed_quantity: "6", discrepancy_quantity: "-1",
  }]);
});

test("aggregation fails closed for a JSON number that has already lost integer precision", () => {
  assert.throws(
    () => aggregateReportRows(ownerReport("on-account"), [
      { current_status: "pending", currency_code: "GBP", amount_minor: Number.MAX_SAFE_INTEGER + 1 },
    ]),
    ReportAggregationError,
  );
});

test("grouped snapshot text remains formula-neutralized in the final CSV cell", () => {
  const [row] = aggregateReportRows(ownerReport("sales-by-product"), [{
    kind: "sale", product_id: "product-a", sku_snapshot: "+CMD", description_snapshot: "=2+2",
    currency_code: "GBP", quantity: "1", net_minor: "10", tax_minor: "2", gross_minor: "12",
  }]);
  assert.ok(row);
  assert.equal(csvCell(row["description_snapshot"]), '"\'=2+2"');
  assert.equal(csvCell(row["sku_snapshot"]), '"\'+CMD"');
});

test("physical returns remain separate from issued and pending credit", () => {
  const common = { product_id: "product-a", product_sku_snapshot: "A", product_name_snapshot: "Product A", currency_code: "GBP" };
  const rows = aggregateReportRows(ownerReport("returns-by-product"), [
    { ...common, financial_state: "issued", quantity: "2", issued_credit_net_minor: "-200", issued_credit_tax_minor: "-40", issued_credit_gross_minor: "-240", pending_credit_net_minor: "0", pending_credit_tax_minor: "0", pending_credit_gross_minor: "0" },
    { ...common, financial_state: "awaiting_review", quantity: "1", issued_credit_net_minor: "0", issued_credit_tax_minor: "0", issued_credit_gross_minor: "0", pending_credit_net_minor: "-100", pending_credit_tax_minor: "-20", pending_credit_gross_minor: "-120" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row["financial_state"] === "awaiting_review")?.["issued_credit_gross_minor"], "0");
  assert.equal(rows.find((row) => row["financial_state"] === "awaiting_review")?.["pending_credit_gross_minor"], "-120");
  assert.equal(rows.reduce((sum, row) => sum + BigInt(row["quantity"]!), 0n), 3n);
  assert.equal(rows.reduce((sum, row) => sum + BigInt(row["issued_credit_gross_minor"]!), 0n), -240n);
});

test("product financial totals include credits and unallocated corrections without inventing product quantities", () => {
  const rows = aggregateReportRows(ownerReport("sales-by-product"), [
    { kind: "sale", product_id: "product-a", sku_snapshot: "A", description_snapshot: "Product A", currency_code: "GBP", quantity: "2", net_minor: "200", tax_minor: "40", gross_minor: "240" },
    { kind: "return_credit", product_id: "product-a", sku_snapshot: "A", description_snapshot: "Product A", currency_code: "GBP", quantity: "1", net_minor: "-100", tax_minor: "-20", gross_minor: "-120" },
    { kind: "correction", product_id: null, sku_snapshot: "", description_snapshot: "Invoice-level correction", currency_code: "GBP", quantity: "0", net_minor: "-25", tax_minor: "-5", gross_minor: "-30" },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row["kind"] === "correction")?.["product_id"], "");
  assert.equal(rows.find((row) => row["kind"] === "correction")?.["quantity"], "0");
  assert.equal(rows.reduce((sum, row) => sum + BigInt(row["gross_minor"]!), 0n), 90n);
  assert.equal(ownerReport("sales-by-product").filters, undefined);
  assert.equal(ownerReport("issued-financial-totals").dateColumn, "issue_date");
});


test("on-account report retains original amounts alongside corrected issued totals", () => {
  assert.deepEqual(aggregateReportRows(ownerReport("on-account"), [
    { current_status: "unpaid", currency_code: "GBP", amount_minor: "240", current_invoice_total_minor: "216" },
    { current_status: "unpaid", currency_code: "GBP", amount_minor: "100", current_invoice_total_minor: "0" },
    { current_status: "paid", currency_code: "GBP", amount_minor: "600", current_invoice_total_minor: "540" },
  ]), [
    { current_status: "paid", currency_code: "GBP", payment_count: "1", amount_minor: "600", current_invoice_total_minor: "540" },
    { current_status: "unpaid", currency_code: "GBP", payment_count: "2", amount_minor: "340", current_invoice_total_minor: "216" },
  ]);
});
