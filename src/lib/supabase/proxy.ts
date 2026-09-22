import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { validateSupabasePublicConfiguration } from "@/config/environment";

export async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  let configuration;
  try {
    configuration = validateSupabasePublicConfiguration(process.env);
  } catch {
    return response;
  }
  const supabase = createServerClient(configuration.url, configuration.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const isAuthenticationRoute =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname.startsWith("/auth/");
  const isOfficeRoute = request.nextUrl.pathname.startsWith("/office");

  if (!data.user && isOfficeRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (data.user && isAuthenticationRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/office";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
