import type { NextRequest } from "next/server";
import { sectionForRole } from "@/domain/office";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { shortLivedPrivateFileRedirect } from "@/lib/office/protected-files";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const canonicalUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/office/[section]/[recordID]/artifacts/[artifactID]/download">,
): Promise<Response> {
  const identity = await requireOfficeIdentity();
  const { section: slug, recordID, artifactID } = await context.params;
  const section = sectionForRole(slug, identity.role);
  if (!section?.documentType || !canonicalUUID.test(recordID) || !canonicalUUID.test(artifactID)) {
    return new Response("File not found.", { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const [documentResult, artifactResult] = await Promise.all([
    supabase
      .from("financial_documents")
      .select("id")
      .eq("organization_id", identity.organizationID)
      .eq("id", recordID)
      .eq("kind", section.documentType)
      .maybeSingle(),
    supabase
      .from("financial_document_artifacts")
      .select("storage_path,state")
      .eq("organization_id", identity.organizationID)
      .eq("financial_document_id", recordID)
      .eq("id", artifactID)
      .eq("state", "stored")
      .maybeSingle(),
  ]);
  if (documentResult.error || artifactResult.error) {
    return new Response("The protected file is temporarily unavailable.", { status: 503 });
  }
  if (!documentResult.data || !artifactResult.data?.storage_path) return new Response("File not found.", { status: 404 });

  const expectedPath = `organizations/${identity.organizationID}/financial-documents/${recordID}/${artifactID}.pdf`;
  if (artifactResult.data.storage_path !== expectedPath) return new Response("File not found.", { status: 404 });
  return shortLivedPrivateFileRedirect("wholesale-financial-private", artifactResult.data.storage_path);
}
