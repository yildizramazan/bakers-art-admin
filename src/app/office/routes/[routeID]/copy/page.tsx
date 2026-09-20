import Link from "next/link";
import { RouteCopyForm } from "@/app/office/routes/copy-form";
import { loadRouteCopyData } from "@/lib/office/editor-data";

export const metadata = { title: "Copy route" };
export default async function CopyRoutePage({ params }: Readonly<{ params: Promise<{ routeID: string }> }>) {
  const { routeID } = await params;
  const data = await loadRouteCopyData(routeID);
  return <div className="office-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/office/routes">Routes</Link><span aria-hidden="true">/</span><Link href={`/office/routes/${routeID}`}>Source route</Link></nav>
    <div className="page-heading"><div><h1>Copy route</h1><p>Repeat the visits from {data.sourceDate} as a new draft.</p></div></div>
    <section aria-labelledby="source-stops-title"><h2 id="source-stops-title">Visits to copy ({data.stops.length})</h2>
      {data.notes ? <p>{data.notes}</p> : null}
      <ol>{data.stops.map((stop) => <li key={stop.id} value={Number(stop.sequence)}><strong>{stop.label}</strong>{stop.deliveryNotes ? <p>{stop.deliveryNotes}</p> : null}</li>)}</ol>
    </section>
    <RouteCopyForm key={routeID} data={data} />
  </div>;
}
