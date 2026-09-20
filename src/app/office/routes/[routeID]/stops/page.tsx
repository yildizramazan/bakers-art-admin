import Link from "next/link";
import { RouteStopForm } from "@/app/office/route-stop-form";
import { loadRouteStopData } from "@/lib/office/editor-data";

export const metadata = { title: "Manage route stops" };
export default async function RouteStopsPage({ params }: Readonly<{ params: Promise<{ routeID: string }> }>) {
  const { routeID } = await params;
  const data = await loadRouteStopData(routeID);
  return <div className="office-page"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/office/routes">Routes</Link><span aria-hidden="true">/</span><Link href={`/office/routes/${routeID}`}>Route details</Link></nav><div className="page-heading"><div><h1>Manage route stops</h1><p>Add and edit stops before publishing, or reorder the remaining stops.</p></div></div><RouteStopForm key={routeID} data={data} /></div>;
}
