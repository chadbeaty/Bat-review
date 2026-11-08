import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Everything except sign-in, the auth callbacks and the cron endpoints needs a signed-in user.
const PUBLIC_PREFIXES = ["/sign-in", "/auth", "/api/cron"];

export function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Runs before page requests: refreshes the Supabase session cookie and sends signed-out visitors to sign-in.
 * Only a convenience redirect; every page, server action and database policy checks membership again.
 */
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/cron")) return response;
  if (!url || !key) return isPublicPath(pathname) ? response : redirectToSignIn(request);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub && !isPublicPath(pathname)) {
    const redirect = redirectToSignIn(request);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

function redirectToSignIn(request: NextRequest) {
  const target = request.nextUrl.clone();
  target.pathname = "/sign-in";
  target.search = "";
  if (request.nextUrl.pathname !== "/") target.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(target);
}
