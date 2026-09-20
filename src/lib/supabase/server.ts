import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { validateSupabasePublicConfiguration } from "@/config/environment";

function isReadonlyServerComponentCookieError(error: unknown): boolean {
  return error instanceof Error
    && "__NEXT_ERROR_CODE" in error
    && error.__NEXT_ERROR_CODE === "E1180";
}

export async function createSupabaseServerClient() {
  const configuration = validateSupabasePublicConfiguration(process.env);
  const cookieStore = await cookies();

  return createServerClient(configuration.url, configuration.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch (error) {
          // The proxy owns refresh-cookie writes before rendering. Suppress only
          // Next's documented read-only Server Component boundary, never an
          // unrelated cookie or serialization failure.
          if (!isReadonlyServerComponentCookieError(error)) throw error;
        }
      },
    },
  });
}
