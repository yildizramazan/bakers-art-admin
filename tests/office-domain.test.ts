import assert from "node:assert/strict";
import test from "node:test";
import { detailRelationsForRole } from "../src/domain/office-details.ts";
import { officeSections, sectionForRole } from "../src/domain/office.ts";
import { reportDefinitions, reportForRole } from "../src/domain/reports.ts";

test("the office navigation covers every required operational and financial section", () => {
  const required = [
    "drivers", "products", "barcodes", "customers", "shops", "pricing", "tax",
    "standing-orders", "daily-orders", "routes", "loads", "deliveries", "returns",
    "invoices", "credit-notes", "payments", "cash-reconciliation", "pod", "audit", "settings",
  ];
  assert.ok(required.every((slug) => officeSections.some((section) => section.slug === slug)));
  assert.equal(new Set(officeSections.map((section) => section.slug)).size, officeSections.length);
});

test("accountants cannot resolve owner-only operational configuration sections", () => {
  for (const slug of ["drivers", "products", "customers", "shops", "pricing", "price-rules", "tax", "tax-rules", "routes", "loads", "settings", "settings-revisions"]) {
    assert.equal(sectionForRole(slug, "accountant"), undefined, slug);
    assert.ok(sectionForRole(slug, "owner_admin"), slug);
  }
  for (const slug of ["deliveries", "returns", "invoices", "credit-notes", "payments", "cash-reconciliation", "audit"]) {
    assert.ok(sectionForRole(slug, "accountant"), slug);
  }
  assert.equal(sectionForRole("pod", "accountant"), undefined, "private POD is intentionally owner-only in the database policy");
  assert.ok(sectionForRole("pod", "owner_admin"));
});

test("unknown URL segments cannot select arbitrary database tables", () => {
  for (const slug of ["organization_memberships", "auth.users", "../devices", "financial_document_artifacts"]) {
    assert.equal(sectionForRole(slug, "owner_admin"), undefined);
    assert.equal(reportForRole(slug, "owner_admin"), undefined);
  }
});

test("report catalogue covers the V1 operational and financial export sources", () => {
  assert.deepEqual(reportDefinitions.map((report) => report.slug), [
    "daily-sales", "sales-by-customer", "sales-by-shop", "sales-by-product", "issued-financial-totals",
    "returns-by-customer", "returns-by-product", "driver-deliveries", "route-completion",
    "cash", "pending-external-payments", "on-account", "vat-summary-source", "load-discrepancy",
  ]);
  for (const report of reportDefinitions) {
    assert.ok(reportForRole(report.slug, "owner_admin"));
    assert.ok(report.sourceColumns.length > 0);
    assert.ok(report.outputColumns.length > 0);
    assert.ok(report.groupColumns.length > 0);
    assert.ok(report.sumColumns.length > 0 || report.countColumn || report.conditionalCounts?.length || report.differences?.length);
    assert.match(report.table, /^[a-z][a-z0-9_]*$/);
  }
  assert.equal(reportForRole("route-completion", "accountant"), undefined);
  assert.equal(reportForRole("load-discrepancy", "accountant"), undefined);
  assert.ok(reportForRole("daily-sales", "accountant"));
  assert.ok(reportForRole("vat-summary-source", "accountant"));
});

test("detail relations are allowlisted and follow the same POD role boundary", () => {
  const allowedTables = new Set([
    "organization_memberships", "devices", "product_barcodes", "shop_locations", "work_packages",
    "standing_order_lines", "planned_order_lines", "standing_orders", "planned_orders", "route_stops", "delivery_lines",
    "returns", "deliveries", "delivery_documents", "return_lines", "financial_document_lines",
    "financial_documents", "financial_document_artifacts", "payment_allocations", "payment_status_events",
    "proof_of_delivery", "attachments", "organization_settings_revisions", "corrections", "shift_load_lines",
  ]);
  for (const section of officeSections) {
    for (const relation of detailRelationsForRole(section.slug, "owner_admin")) {
      assert.ok(allowedTables.has(relation.table), `${section.slug}/${relation.slug}`);
      assert.match(relation.foreignColumn, /^[a-z][a-z0-9_]*$/);
      assert.ok(relation.columns.length > 0);
    }
  }
  assert.deepEqual(detailRelationsForRole("pod", "accountant"), []);
  assert.deepEqual(detailRelationsForRole("routes", "accountant"), []);
  assert.equal(detailRelationsForRole("unknown", "owner_admin").length, 0);
});
