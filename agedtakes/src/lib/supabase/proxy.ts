import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED = ["/admin", "/account"];

export function isProtectedPath(pathname: string) {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Runs before page requests: refreshes the Supabase session cookie and sends signed-out visitors away from the
 * newsroom and account pages. This is only a convenience redirect — every protected page, server action and
 * database policy checks the user again.
 */
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!isProtectedPath(request.nextUrl.pathname) && !request.nextUrl.pathname.startsWith("/auth")) {
    // Public pages don't touch the session, so they stay cacheable.
    return response;
  }
  if (!url || !key) return isProtectedPath(request.nextUrl.pathname) ? redirectToSignIn(request) : response;

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
  if (!data?.claims?.sub && isProtectedPath(request.nextUrl.pathname)) {
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
  target.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(target);
}
