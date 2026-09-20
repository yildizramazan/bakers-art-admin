import type { ReportDefinition } from "./reports.ts";
import type { ReportSourceRow } from "./report-aggregation.ts";

export const REPORT_SOURCE_LIMIT = 5000;

export function parseReportSnapshot(value: unknown, report: ReportDefinition):
  Readonly<{ rows: readonly ReportSourceRow[]; limitExceeded: boolean }> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result = value as Record<string, unknown>;
  const rows = result["rows"];
  const count = result["source_count"];
  if (result["limit"] !== REPORT_SOURCE_LIMIT || !Array.isArray(rows)) return undefined;
  if (result["limit_exceeded"] === true) {
    return count === REPORT_SOURCE_LIMIT + 1 && rows.length === 0 ? { rows: [], limitExceeded: true } : undefined;
  }
  if (result["limit_exceeded"] !== false || typeof count !== "number" || !Number.isSafeInteger(count)
    || count < 0 || count > REPORT_SOURCE_LIMIT || count !== rows.length) return undefined;
  const required = ["id", report.dateColumn, ...report.sourceColumns];
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
    if (required.some((key) => !Object.hasOwn(row, key))) return undefined;
    if (Object.values(row).some((item) => item !== null && typeof item !== "string")) return undefined;
    if (typeof row["id"] !== "string" || !row["id"] || ids.has(row["id"])) return undefined;
    ids.add(row["id"]);
  }
  return { rows, limitExceeded: false };
}
