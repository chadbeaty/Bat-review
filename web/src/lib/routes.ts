// Route groups shared by the proxy, the sitemap and robots.txt.

/** Pages that need a signed-in member. */
export const PROTECTED_PREFIXES = ["/account", "/sell/new", "/seller", "/admin", "/checkout", "/messages"];

/** Pages search engines should not index. */
export const PRIVATE_PREFIXES = [...PROTECTED_PREFIXES, "/auth", "/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/verify-email"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Only allow redirects back into this site, never to another domain. */
export function safeNextPath(next: string | null | undefined, fallback = "/account"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
