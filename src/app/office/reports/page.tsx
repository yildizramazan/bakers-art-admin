import type { Metadata } from "next";
import { reportDefinitions } from "@/domain/reports";
import { requireOfficeIdentity } from "@/lib/office/identity";

export const metadata: Metadata = { title: "Reports & CSV" };

export default async function ReportsPage() {
  const identity = await requireOfficeIdentity();
  const reports = reportDefinitions.filter((report) => report.roles.includes(identity.role));
  return (
    <div className="office-page">
      <div className="page-heading"><div><p className="eyebrow">Exact grouped totals</p><h1>Reports &amp; CSV</h1><p>Download organization-scoped operational and financial summaries. Spreadsheet-formula prefixes are neutralized in every CSV cell.</p></div></div>
      <div className="report-grid">
        {reports.map((report) => (
          <article className="report-card" key={report.slug}>
            <h2>{report.title}</h2><p>{report.description}</p>
            <form method="get" action="/office/reports/download">
              <input type="hidden" name="report" value={report.slug} />
              <label>From <input type="date" name="from" /></label>
              <label>To <input type="date" name="to" /></label>
              <button type="submit">Download CSV</button>
            </form>
          </article>
        ))}
      </div>
      <p className="data-note">Date ranges use {identity.timezoneName}. To prevent partial totals, an export is refused when it contains more than 5,000 source rows. Narrow the date range and retry; no truncated report is downloaded.</p>
    </div>
  );
}
