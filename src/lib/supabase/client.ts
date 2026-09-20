"use client";

import { createBrowserClient } from "@supabase/ssr";
import { validateSupabasePublicConfiguration } from "@/config/environment";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  const configuration = validateSupabasePublicConfiguration({
    APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    APP_ORIGIN: process.env.NEXT_PUBLIC_APP_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  browserClient = createBrowserClient(
    configuration.url,
    configuration.publishableKey,
  );
  return browserClient;
}
