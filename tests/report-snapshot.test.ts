import test from "node:test";
import assert from "node:assert/strict";
import { parseReportSnapshot } from "../src/domain/report-snapshot.ts";
import { reportDefinitions } from "../src/domain/reports.ts";

test("bounded report snapshots reject partial, duplicate and imprecise source rows", () => {
  const report = reportDefinitions.find((item) => item.slug === "daily-sales")!;
  const row = Object.fromEntries(["id", report.dateColumn, ...report.sourceColumns].map((key) => [key, "example"]));
  row["total_gross_minor"] = "9007199254740993";
  const snapshot = { rows: [row], source_count: 1, limit: 5000, limit_exceeded: false };
  assert.equal(parseReportSnapshot(snapshot, report)?.rows[0]?.["total_gross_minor"], "9007199254740993");
  assert.equal(parseReportSnapshot({ ...snapshot, source_count: 2 }, report), undefined);
  assert.equal(parseReportSnapshot({ ...snapshot, rows: [row, row], source_count: 2 }, report), undefined);
  assert.equal(parseReportSnapshot({ ...snapshot, rows: [{ ...row, total_gross_minor: 9007199254740992 }] }, report), undefined);
  const missing = { ...row }; delete missing["total_gross_minor"];
  assert.equal(parseReportSnapshot({ ...snapshot, rows: [missing] }, report), undefined);
});

test("an oversized export is refused with no partial rows; empty reports remain valid", () => {
  const report = reportDefinitions[0]!;
  assert.deepEqual(parseReportSnapshot({ rows: [], source_count: 5001, limit: 5000, limit_exceeded: true }, report),
    { rows: [], limitExceeded: true });
  assert.equal(parseReportSnapshot({ rows: [{}], source_count: 5001, limit: 5000, limit_exceeded: true }, report), undefined);
  assert.deepEqual(parseReportSnapshot({ rows: [], source_count: 0, limit: 5000, limit_exceeded: false }, report),
    { rows: [], limitExceeded: false });
});
