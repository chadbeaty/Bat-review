import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { AdminAuthError, adminDb, assertStaff, type Staff } from "@/lib/admin/auth";
import type { Access } from "@/lib/admin/roles";

type Db = ReturnType<typeof adminDb>;

/** A friendly error a server action can throw to show the admin a specific message. */
export class AdminInputError extends Error {}

function secret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev-only-flash-secret";
}

function sign(kind: string, message: string) {
  return createHmac("sha256", secret()).update(`${kind}:${message}`).digest("base64url").slice(0, 22);
}

/** Adds a signed result message to a path, so pages only show messages the server wrote. */
export function withFlash(path: string, kind: "notice" | "error", message: string): string {
  const url = new URL(path, "http://x");
  url.searchParams.delete("notice");
  url.searchParams.delete("error");
  url.searchParams.delete("sig");
  url.searchParams.delete("confirm");
  url.searchParams.set(kind, message.slice(0, 300));
  url.searchParams.set("sig", sign(kind, message.slice(0, 300)));
  return url.pathname + url.search;
}

/** Reads a signed message from page search params; ignores anything unsigned. */
export function readFlash(params: Record<string, string | string[] | undefined>): { kind: "notice" | "error"; message: string } | null {
  const sig = typeof params.sig === "string" ? params.sig : "";
  for (const kind of ["error", "notice"] as const) {
    const message = params[kind];
    if (typeof message !== "string" || !sig) continue;
    const expected = Buffer.from(sign(kind, message));
    const given = Buffer.from(sig);
    if (expected.length === given.length && timingSafeEqual(expected, given)) return { kind, message };
  }
  return null;
}

/** The page to return to after an action: a path inside /admin from the form, or the fallback. */
export function returnPath(form: FormData, fallback: string): string {
  const r = String(form.get("return") ?? "");
  return r.startsWith("/admin") && !r.startsWith("//") ? r : fallback;
}

/**
 * Runs an admin write: checks the staff member (role and MFA) again on the server, runs the change with the
 * service-role client, and returns to the page with a result message. Database errors are shown as messages.
 */
export async function runAdminAction(
  access: Access,
  form: FormData,
  fallback: string,
  fn: (staff: Staff, db: Db) => Promise<string | { notice: string; to: string } | void>
): Promise<never> {
  const back = returnPath(form, fallback);
  let target: string;
  try {
    const staff = await assertStaff(access);
    const result = await fn(staff, adminDb());
    if (result && typeof result === "object") target = withFlash(result.to, "notice", result.notice);
    else target = withFlash(back, "notice", result || "Saved.");
  } catch (err) {
    let message = "Something went wrong. Nothing was changed.";
    if (err instanceof AdminAuthError) message = "You don't have access to do that, or your session needs a fresh two-step code.";
    else if (err instanceof AdminInputError) message = err.message;
    else if (err instanceof Error && err.message) message = err.message;
    target = withFlash(back, "error", message);
  }
  redirect(target);
}

/** Turns a Supabase error into a thrown message, or returns the data. */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new AdminInputError(res.error.message);
  return res.data;
}
