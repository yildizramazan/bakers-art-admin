import "server-only";

import { validateSupabasePublicConfiguration } from "@/config/environment";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PrivateOfficeBucket = "wholesale-pod-private" | "wholesale-financial-private";

export async function shortLivedPrivateFileRedirect(bucket: PrivateOfficeBucket, storagePath: string): Promise<Response> {
  const configuration = validateSupabasePublicConfiguration(process.env);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60);
  if (error || !data.signedUrl) return new Response("The protected file is temporarily unavailable.", { status: 503 });

  const destination = new URL(data.signedUrl, configuration.url);
  if (destination.origin !== new URL(configuration.url).origin) {
    return new Response("The protected file is temporarily unavailable.", { status: 503 });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination.toString(),
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
