import type { ReportDefinition } from "./reports.ts";

export type ReportSourceRow = Readonly<Record<string, unknown>>;
export type ReportOutputRow = Readonly<Record<string, string>>;

export class ReportAggregationError extends Error {
  constructor() {
    super("Report source values could not be aggregated exactly.");
    this.name = "ReportAggregationError";
  }
}

function scalarText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new ReportAggregationError();
}

function exactInteger(value: unknown): bigint {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new ReportAggregationError();
    return BigInt(value);
  }
  if (typeof value !== "string" || !/^-?(0|[1-9]\d*)$/.test(value)) throw new ReportAggregationError();
  return BigInt(value);
}

function latestRows(report: ReportDefinition, rows: readonly ReportSourceRow[]): readonly ReportSourceRow[] {
  if (!report.latestPer) return rows;
  const latest = new Map<string, Readonly<{ revision: bigint; row: ReportSourceRow }>>();
  for (const row of rows) {
    const key = JSON.stringify(report.latestPer.keys.map((column) => scalarText(row[column])));
    const revision = exactInteger(row[report.latestPer.revisionColumn]);
    const existing = latest.get(key);
    if (!existing || revision > existing.revision) latest.set(key, { revision, row });
  }
  return [...latest.values()].map((entry) => entry.row);
}

interface MutableAggregate {
  readonly group: Record<string, string>;
  readonly sums: Record<string, bigint>;
  count: bigint;
  readonly conditionalCounts: Record<string, bigint>;
}

export function aggregateReportRows(
  report: ReportDefinition,
  sourceRows: readonly ReportSourceRow[],
): readonly ReportOutputRow[] {
  const groups = new Map<string, MutableAggregate>();
  for (const row of latestRows(report, sourceRows)) {
    const groupValues = report.groupColumns.map((column) => scalarText(row[column]));
    const key = JSON.stringify(groupValues);
    let aggregate = groups.get(key);
    if (!aggregate) {
      aggregate = {
        group: Object.fromEntries(report.groupColumns.map((column, index) => [column, groupValues[index] ?? ""])),
        sums: Object.fromEntries(report.sumColumns.map((column) => [column, 0n])),
        count: 0n,
        conditionalCounts: Object.fromEntries((report.conditionalCounts ?? []).map((counter) => [counter.outputColumn, 0n])),
      };
      groups.set(key, aggregate);
    }
    aggregate.count += 1n;
    for (const column of report.sumColumns) {
      aggregate.sums[column] = (aggregate.sums[column] ?? 0n) + exactInteger(row[column]);
    }
    for (const counter of report.conditionalCounts ?? []) {
      if (counter.values.includes(scalarText(row[counter.sourceColumn]))) {
        aggregate.conditionalCounts[counter.outputColumn] = (aggregate.conditionalCounts[counter.outputColumn] ?? 0n) + 1n;
      }
    }
  }

  const output: ReportOutputRow[] = [];
  for (const aggregate of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, "en-GB")).map((entry) => entry[1])) {
    const row: Record<string, string> = { ...aggregate.group };
    if (report.countColumn) row[report.countColumn] = aggregate.count.toString();
    for (const [column, value] of Object.entries(aggregate.sums)) row[column] = value.toString();
    for (const [column, value] of Object.entries(aggregate.conditionalCounts)) row[column] = value.toString();
    let omit = false;
    for (const difference of report.differences ?? []) {
      const value = (aggregate.sums[difference.leftColumn] ?? 0n) - (aggregate.sums[difference.rightColumn] ?? 0n);
      row[difference.outputColumn] = value.toString();
      if (difference.omitZero && value === 0n) omit = true;
    }
    if (!omit) output.push(Object.fromEntries(report.outputColumns.map((column) => [column, row[column] ?? ""])));
  }
  return output;
}
