import type { NextRequest } from "next/server";
import { csvCell } from "@/domain/csv";
import { isCalendarDate } from "@/domain/dates";
import { aggregateReportRows, ReportAggregationError } from "@/domain/report-aggregation";
import { reportForRole } from "@/domain/reports";
import { parseReportSnapshot, REPORT_SOURCE_LIMIT } from "@/domain/report-snapshot";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;

function errorResponse(message: string, status: number): Response {
  return new Response(message, { status, headers: privateHeaders });
}

export async function GET(request: NextRequest): Promise<Response> {
  const identity = await requireOfficeIdentity();
  const slug = request.nextUrl.searchParams.get("report") ?? "";
  const report = reportForRole(slug, identity.role);
  if (!report) return errorResponse("Report not found.", 404);

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if ((from && !isCalendarDate(from)) || (to && !isCalendarDate(to)) || (from && to && from > to)) {
    return errorResponse("The report date range is invalid.", 400);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("office_report_snapshot", {
    p_organization_id: identity.organizationID,
    p_report_slug: report.slug,
    p_from: from || null,
    p_to: to || null,
  });
  if (error) return errorResponse("The report could not be generated.", 503);
  const snapshot = parseReportSnapshot(data, report);
  if (!snapshot) return errorResponse("The report could not be generated completely. Try again.", 503);
  if (snapshot.limitExceeded) {
    return errorResponse(
      `This report contains more than ${REPORT_SOURCE_LIMIT.toLocaleString("en-GB")} source rows. Narrow the date range and try again.`,
      422,
    );
  }
  const sourceRows = snapshot.rows;

  let rows;
  try {
    rows = aggregateReportRows(report, sourceRows);
  } catch (error) {
    if (!(error instanceof ReportAggregationError)) throw error;
    return errorResponse("The report contains a value that cannot be totalled exactly.", 503);
  }
  const csv = [
    report.outputColumns.map(csvCell).join(","),
    ...rows.map((row) => report.outputColumns.map((column) => csvCell(row[column])).join(",")),
  ].join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      ...privateHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.slug}.csv"`,
      "X-Wholesale-Source-Limit": String(REPORT_SOURCE_LIMIT),
      "X-Wholesale-Source-Rows": String(sourceRows.length),
      "X-Wholesale-Aggregate-Rows": String(rows.length),
    },
  });
}
