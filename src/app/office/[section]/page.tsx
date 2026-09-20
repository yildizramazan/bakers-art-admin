import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordTable } from "@/components/record-table";
import { officeSections, sectionForRole } from "@/domain/office";
import { officePage } from "@/domain/office-pagination";
import { exactOfficeSelect } from "@/domain/presentation";
import { editorForSection } from "@/domain/office-editors";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { withRecordLabels } from "@/lib/office/record-labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DataRow = Readonly<Record<string, unknown>>;
const pageSize = 50;

export async function generateMetadata({ params }: Readonly<{ params: Promise<{ section: string }> }>): Promise<Metadata> {
  const { section: slug } = await params;
  const section = officeSections.find((candidate) => candidate.slug === slug);
  return { title: section?.title ?? "Section unavailable" };
}

export default async function ResourcePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ section: string }>;
  searchParams: Promise<{ page?: string | readonly string[] }>;
}>) {
  const identity = await requireOfficeIdentity();
  const { section: slug } = await params;
  const section = sectionForRole(slug, identity.role);
  if (!section) notFound();
  const page = officePage((await searchParams).page);
  if (page === undefined) notFound();

  const supabase = await createSupabaseServerClient();
  const selectedColumns = exactOfficeSelect(["id", ...section.columns]);
  const firstRow = (page - 1) * pageSize;
  let query = supabase.from(section.table).select(selectedColumns, { count: "exact" }).range(firstRow, firstRow + pageSize - 1);
  query = section.table === "organizations"
    ? query.eq("id", identity.organizationID)
    : query.eq("organization_id", identity.organizationID);
  if (section.documentType) query = query.eq("kind", section.documentType);
  const { data, error, count } = await query.order(section.orderBy, { ascending: section.ascending ?? false });
  if (error) throw new Error(`${section.title} could not be loaded.`);
  const rows = await withRecordLabels(supabase, identity, (data ?? []) as unknown as readonly DataRow[], section.columns);
  if (page > 1 && rows.length === 0) notFound();
  const total = count ?? rows.length;
  const lastRow = Math.min(firstRow + rows.length, total);
  const hasNextPage = firstRow + rows.length < total;
  const editor = identity.role === "owner_admin" ? editorForSection(slug) : undefined;

  return (
    <div className="office-page">
      <div className="page-heading"><div><p className="eyebrow">{identity.organizationName}</p><h1>{section.title}</h1><p>{section.description}</p></div><span className="record-count">{total === 0 ? "0 records" : `${firstRow + 1}–${lastRow} of ${total}`}</span></div>
      {editor && editor.family !== "membership" && editor.family !== "organization" ? <div className="toolbar section-toolbar"><Link className="primary-link" href={`/office/manage/${editor.kind}/new`}>New {editor.title.toLowerCase()}</Link></div> : null}
      {slug === "drivers" && identity.role === "owner_admin" ? <div className="toolbar section-toolbar"><Link className="primary-link" href="/office/drivers/accounts">Create employee account</Link></div> : null}
      {rows.length === 0 ? <div className="empty-state"><h2>No records</h2><p>No {section.title.toLowerCase()} have been added for this organization yet.</p></div> : (
        <RecordTable caption={`${section.title} records`} columns={section.columns} rows={rows} detailBasePath={`/office/${section.slug}`} />
      )}
      {page > 1 || hasNextPage ? (
        <nav className="pagination" aria-label={`${section.title} pages`}>
          {page > 1 ? <a className="quiet-link" href={`?page=${page - 1}`} rel="prev">Previous</a> : <span />}
          <span>Page {page.toLocaleString("en-GB")}</span>
          {hasNextPage ? <a className="quiet-link" href={`?page=${page + 1}`} rel="next">Next</a> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
