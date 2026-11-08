import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Result messages after a form submit travel in the URL, signed so a page only ever shows messages the server wrote.

function secret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.CRON_SECRET ?? "dev-only-flash-secret";
}
function sign(kind: string, message: string) {
  return createHmac("sha256", secret()).update(`${kind}:${message}`).digest("base64url").slice(0, 22);
}

export function withFlash(path: string, kind: "notice" | "error", message: string): string {
  const url = new URL(path, "http://x");
  ["notice", "error", "sig"].forEach((k) => url.searchParams.delete(k));
  const m = message.slice(0, 400);
  url.searchParams.set(kind, m);
  url.searchParams.set("sig", sign(kind, m));
  return url.pathname + url.search;
}

export function readFlash(params: Record<string, string | string[] | undefined>): { kind: "notice" | "error"; message: string } | null {
  const sig = typeof params.sig === "string" ? params.sig : "";
  for (const kind of ["error", "notice"] as const) {
    const message = params[kind];
    if (typeof message !== "string" || !sig) continue;
    const a = Buffer.from(sign(kind, message));
    const b = Buffer.from(sig);
    if (a.length === b.length && timingSafeEqual(a, b)) return { kind, message };
  }
  return null;
}

/** Plain-English version of database errors for the owner. */
export function friendlyDbError(message: string): string {
  if (/row-level security|permission denied|insufficient_privilege|42501/i.test(message)) return "You don't have permission to do that.";
  if (/creators_active_needs_verified/.test(message)) return "A creator can only be activated after its channel is verified.";
  if (/duplicate key.*creators_platform_channel/.test(message)) return "That channel is already in the list.";
  if (/duplicate key/i.test(message)) return "That already exists.";
  if (/violates check constraint/.test(message)) return "Some values aren't allowed. Check the form and try again.";
  return message.replace(/^ERROR:\s*/, "");
}
