/** Read-only real Auth/REST/CSV acceptance against preserved fictional records. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServerClient } from "@supabase/ssr";
import { aggregateReportRows } from "../src/domain/report-aggregation.ts";
import { reportDefinitions } from "../src/domain/reports.ts";
import { parseReportSnapshot } from "../src/domain/report-snapshot.ts";
import { csvCell } from "../src/domain/csv.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const status = JSON.parse(readFileSync(`${root}artifacts/backend/local-status.json`, "utf8"));
const credentials = JSON.parse(readFileSync(`${root}artifacts/backend/development-credentials.json`, "utf8"));
const base = String(status.API_URL), org = "10000000-0000-4000-8000-000000000001";
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(base));
const evidence: Record<string, unknown>[] = [];
for (const role of ["OWNER", "ACCOUNTANT"] as const) {
  const jar = new Map<string, string>();
  const client = createServerClient(base, status.ANON_KEY, { cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (values) => { for (const value of values) jar.set(value.name, value.value); },
  } });
  const auth = await client.auth.signInWithPassword(credentials[role]);
  assert.equal(auth.error, null); assert.equal(auth.data.user?.app_metadata["development_seed"], true);
  assert.ok(auth.data.user?.email?.endsWith("@pilot-wholesale.localhost"));
  async function rows(table: string, select = "*") {
    const result = await client.from(table).select(select).eq("organization_id", org).order("id").limit(1000);
    assert.equal(result.error, null, `${role}: ${table} read must succeed`);
    assert.ok(result.data);
    assert.ok(result.data.length < 1000, "Fixture verification refuses silently truncated data");
    return result.data as unknown as Record<string, unknown>[];
  }
  const financial = await rows("office_report_financial_lines"), returned = await rows("office_report_return_lines");
  const documents = await rows("financial_documents", "id,issued_at,gross_minor:gross_minor::text,tax_minor:tax_minor::text");
  const sum = (items: readonly Record<string, unknown>[], key: string) => items.reduce((total, row) => total + BigInt(String(row[key])), 0n);
  assert.ok(documents.length >= 7, "Both original routes and credit notes must still exist");
  assert.equal(sum(financial, "gross_minor"), sum(documents.filter((row) => row["issued_at"] != null), "gross_minor"));
  assert.equal(sum(financial, "tax_minor"), sum(documents.filter((row) => row["issued_at"] != null), "tax_minor"));
  assert.equal(sum(returned, "pending_credit_gross_minor"), 0n, "Preserved example routes have no unresolved financial reviews");
  let csvChecks = 0;
  for (const report of reportDefinitions.filter((item) => item.roles.includes(role === "OWNER" ? "owner_admin" : "accountant"))) {
    const slug = report.slug;
    const selection = [...new Set(["id", report.dateColumn, ...report.sourceColumns])]
      .map((column) => `${column}:${column}::text`).join(",");
    let query = client.from(report.table).select(selection).eq("organization_id", org).order("id").limit(1000);
    for (const filter of report.filters ?? []) {
      if (filter.operator === "in") query = query.in(filter.column, [...filter.values]);
      else if (filter.operator === "not_null") query = query.not(filter.column, "is", null);
      else query = query.eq(filter.column, filter.value);
    }
    const direct = await query; assert.equal(direct.error, null); assert.ok(direct.data && direct.data.length < 1000);
    const source = direct.data as unknown as Record<string, unknown>[];
    const rpc = await client.rpc("office_report_snapshot", { p_organization_id: org, p_report_slug: slug });
    assert.equal(rpc.error, null);
    const snapshot = parseReportSnapshot(rpc.data, report); assert.ok(snapshot && !snapshot.limitExceeded);
    assert.deepEqual(aggregateReportRows(report, snapshot.rows), aggregateReportRows(report, source),
      `${role}: snapshot must match independently read authorized source facts`);
    const aggregates = aggregateReportRows(report, source);
    const expected = [report.outputColumns.map(csvCell).join(","), ...aggregates.map((row) => report.outputColumns.map((column) => csvCell(row[column])).join(","))].join("\r\n") + "\r\n";
    const response = await fetch(`http://localhost:3000/office/reports/download?report=${slug}`, {
      headers: { Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") }, redirect: "manual",
    });
    assert.equal(response.status, 200, `${role}: ${slug} CSV must be authorized`);
    assert.match(response.headers.get("content-type") ?? "", /^text\/csv/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-wholesale-source-rows"), String(source.length));
    assert.equal(await response.text(), expected, `${role}: CSV must exactly match authorized signed financial/physical facts`);
    csvChecks++;
  }
  evidence.push({ role, csvChecks, financialLines: financial.length, returnLines: returned.length,
    issuedDocuments: documents.length, issuedGrossMinor: sum(financial, "gross_minor").toString(),
    issuedTaxMinor: sum(financial, "tax_minor").toString(), returnedQuantity: sum(returned, "quantity").toString() });
  console.log(`Verified ${role}: ${csvChecks} exact CSV exports and issued ledger totals`);
}
writeFileSync(`${root}artifacts/backend/report-snapshot-server-acceptance.json`, JSON.stringify({ checkedAt: new Date().toISOString(), checks: evidence }, null, 2), { mode: 0o600 });
