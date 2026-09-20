import type { NextRequest } from "next/server";
import { requireOfficeIdentity } from "@/lib/office/identity";
import { shortLivedPrivateFileRedirect } from "@/lib/office/protected-files";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const canonicalUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/office/pod/[recordID]/attachments/[attachmentID]/download">,
): Promise<Response> {
  const identity = await requireOfficeIdentity();
  const { recordID, attachmentID } = await context.params;
  if (identity.role !== "owner_admin" || !canonicalUUID.test(recordID) || !canonicalUUID.test(attachmentID)) {
    return new Response("File not found.", { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("attachments")
    .select("storage_path,delivery_id,upload_state")
    .eq("organization_id", identity.organizationID)
    .eq("proof_of_delivery_id", recordID)
    .eq("id", attachmentID)
    .eq("upload_state", "verified")
    .maybeSingle();
  if (error) return new Response("The protected file is temporarily unavailable.", { status: 503 });
  if (!data) return new Response("File not found.", { status: 404 });

  const expectedPath = `organizations/${identity.organizationID}/deliveries/${data.delivery_id}/pod/${attachmentID}`;
  if (data.storage_path !== expectedPath) return new Response("File not found.", { status: 404 });
  return shortLivedPrivateFileRedirect("wholesale-pod-private", data.storage_path);
}

