import Link from "next/link";
import { notFound } from "next/navigation";
import { EditorForm } from "@/app/office/editor-form";
import { editorForKind } from "@/domain/office-editors";
import { loadDailyOrderFromTemplate, loadEditorData } from "@/lib/office/editor-data";

export const metadata = { title: "Manage business records" };

export default async function ManageRecordPage({ params, searchParams }: Readonly<{ params: Promise<{ kind: string; recordID: string }>; searchParams: Promise<{ copy?: string | readonly string[]; template?: string | readonly string[] }> }>) {
  const { kind, recordID } = await params;
  const editor = editorForKind(kind);
  if (!editor) notFound();
  const { copy: copyID, template: templateID } = await searchParams;
  if (copyID !== undefined && (typeof copyID !== "string" || copyID === "")) notFound();
  if (templateID !== undefined && (typeof templateID !== "string" || templateID === "" || copyID !== undefined || kind !== "planned_order" || recordID !== "new")) notFound();
  const data = templateID ? await loadDailyOrderFromTemplate(templateID) : await loadEditorData(editor, recordID, copyID);
  return <div className="office-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/office">Dashboard</Link><span aria-hidden="true">/</span><Link href={`/office/${editor.section}`}>{editor.title}</Link></nav>
    <div className="page-heading"><div><p className="eyebrow">{data.organizationName}</p><h1>{copyID ? "Next revision of" : templateID ? "Generate" : recordID === "new" ? "New" : "Manage"} {editor.title.toLowerCase()}</h1><p>{templateID ? "Review the date and quantities copied from this standing template. Save the dated draft, then publish it and attach it to a route stop." : copyID && editor.family === "order" ? "Review a new draft revision. Earlier orders and delivery facts keep their original quantities." : "Fields marked * are required. Changes are recorded with your name and reason."}</p>{copyID && editor.kind === "standing_order" ? <p>Before publishing, retire the preceding template with an end date matching this revision’s start date.</p> : null}{copyID && editor.kind === "planned_order" ? <p>Publishing supersedes the previous plan. Update draft route stops to use the new revision. Publication is blocked while an active published route still uses the previous plan.</p> : null}</div></div>
    {editor.family === "route" ? <p className="notice">Driver, shift and date can change while a route is a draft. Publication locks the assignment to protect downloaded work. For another driver or day, copy the visits into a new draft and review them before publishing.</p> : null}
    <EditorForm key={`${kind}:${recordID}:${copyID ?? templateID ?? ""}`} editor={editor} data={data} />
  </div>;
}
