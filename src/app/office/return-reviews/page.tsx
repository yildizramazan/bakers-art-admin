import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { officePage } from "@/domain/office-pagination";
import { displayValue, exactMinorUnits } from "@/domain/presentation";
import { parseReturnReviews } from "@/domain/return-reviews";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReturnReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Return reviews" };
export default async function ReturnReviewsPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const identity = await requireOfficeIdentity();
  const params = await searchParams, page = officePage(params["page"]);
  if (!page || (params["view"] !== undefined && params["view"] !== "all")) notFound();
  const includeResolved = params["view"] === "all", limit = 25;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_office_return_reviews", { p_organization_id: identity.organizationID,
    p_include_resolved: includeResolved, p_limit: limit, p_offset: (page - 1) * limit });
  const result = error ? undefined : parseReturnReviews(data);
  if (!result) throw new Error("Return reviews could not be loaded. Please refresh this page.");
  const pageURL = (number: number) => `/office/return-reviews?page=${number}${includeResolved ? "&view=all" : ""}`;
  const timestamp = (value: string) => displayValue("created_at", value, { __timezone: identity.timezoneName });
  return <div className="office-page">
    <div className="page-heading"><div><p className="eyebrow">Financial review</p><h1>Return reviews</h1><p>Resolve original invoice credits when the return allowance or invoice changed after the driver downloaded it.</p></div>
      <Link className="primary-link" href={includeResolved ? "/office/return-reviews" : "/office/return-reviews?view=all"}>{includeResolved ? "Show open reviews" : "Show all reviews"}</Link></div>
    <p>{BigInt(result.total).toLocaleString("en-GB")} {includeResolved ? (result.total === "1" ? "review" : "reviews") : (result.total === "1" ? "open review" : "open reviews")} · Goods and cash stay recorded while credit awaits a decision.</p>
    {result.items.length === 0 ? <section className="attention-panel"><h2>{page === 1 ? (includeResolved ? "No return reviews yet" : "No returns awaiting review") : "No reviews on this page"}</h2><p>{page === 1 ? "Original invoice credit conflicts will appear here after a driver syncs." : "Use the previous page to see earlier reviews."}</p></section> : result.items.map((review) => <section key={review.id} className="return-review-card" aria-labelledby={`customer-${review.id}`}>
      <div className="page-heading"><div><h2 id={`customer-${review.id}`}>{review.customerName}</h2><p>{timestamp(review.createdAt)} · {review.resolution ? "Resolved" : "Awaiting approval"}</p></div>
        {review.document ? <Link className="primary-link" href={`/office/${review.document.kind === "invoice" ? "invoices" : "credit-notes"}/${review.document.id}`}>{review.document.number}</Link> : null}</div>
      {identity.role === "owner_admin" ? <p><Link className="primary-link" href={`/office/deliveries/${review.deliveryID}`}>View collection and proof of delivery</Link></p> : null}
      <dl className="review-totals"><div><dt>Credit to review</dt><dd>{exactMinorUnits(review.credit, review.currency)}</dd></div><div><dt>Collection net</dt><dd>{exactMinorUnits(review.net, review.currency)}</dd></div><div><dt>VAT</dt><dd>{exactMinorUnits(review.tax, review.currency)}</dd></div><div><dt>Collection total</dt><dd>{exactMinorUnits(review.gross, review.currency)}</dd></div><div><dt>Cash received</dt><dd>{exactMinorUnits(review.cash, review.currency)}</dd></div></dl>
      <div className="table-scroll"><table><caption className="visually-hidden">Returned goods requiring a credit decision</caption><thead><tr><th>Product and original invoice</th><th>Quantity</th><th>Credit</th><th>Reason for review</th></tr></thead><tbody>{review.lines.map((line) => <tr key={line.id}><td><strong>{line.productName}</strong><br />{line.invoiceNumber}<br /><small>{line.physicalReason}</small></td><td>{BigInt(line.quantity).toLocaleString("en-GB")}</td><td>{exactMinorUnits((-BigInt(line.gross)).toString(), review.currency)}<br /><small>Net {exactMinorUnits((-BigInt(line.net)).toString(), review.currency)} · VAT {exactMinorUnits((-BigInt(line.tax)).toString(), review.currency)}</small></td><td>{line.reasonCode === "original_sale_corrected" ? "Original invoice was corrected" : "Return allowance changed"}</td></tr>)}</tbody></table></div>
      {review.resolution ? <div className="form-success"><p><strong>{review.resolution.decision === "original_sale" ? "Original invoice credit approved" : "Separate collection credit approved"}</strong> · {timestamp(review.resolution.resolvedAt)}</p><p>{review.resolution.reason}</p></div>
        : result.canResolve ? <ReturnReviewForm review={review} approvalRequired={result.approvalRequired} /> : <p>An owner or accountant with correction authority must approve this credit.</p>}
    </section>)}
    <nav className="pagination" aria-label="Return review pages"><span>{page > 1 ? <Link href={pageURL(page - 1)}>← Previous</Link> : null}</span><span>Page {page}</span><span>{BigInt(page * limit) < BigInt(result.total) && page < 10000 ? <Link href={pageURL(page + 1)}>Next →</Link> : null}</span></nav>
  </div>;
}
