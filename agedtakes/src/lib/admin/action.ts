import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertStaff, StaffAuthError, type Staff } from "@/lib/auth/staff";
import type { StaffRole } from "@/lib/auth/roles";
import { log } from "@/lib/log";

/** A message a server action can throw to show the editor something specific. */
export class InputError extends Error {}

function secret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev-only-flash-secret";
}

function sign(kind: string, message: string) {
  return createHmac("sha256", secret()).update(`${kind}:${message}`).digest("base64url").slice(0, 22);
}

/** Adds a signed result message to a path, so pages only show messages the server wrote. */
export function withFlash(path: string, kind: "notice" | "error", message: string): string {
  const url = new URL(path, "http://x");
  ["notice", "error", "sig"].forEach((k) => url.searchParams.delete(k));
  const m = message.slice(0, 300);
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

export function returnPath(form: FormData, fallback: string): string {
  const r = String(form.get("return") ?? "");
  return r.startsWith("/admin") && !r.startsWith("//") ? r : fallback;
}

/** Translates database rule violations into plain messages for editors. */
export function friendlyDbError(message: string): string {
  if (/row-level security|permission denied|insufficient_privilege/i.test(message)) return "You don't have permission to do that.";
  if (/duplicate key.*slug/i.test(message)) return "That address (slug) is already used. Choose another.";
  if (/duplicate key/i.test(message)) return "That record already exists.";
  if (/violates check constraint "statements_public_needs_verification"/.test(message)) return "A statement must be verified, dated and linked to a source before it can be public.";
  if (/violates check constraint "wallets_attribution_sourced"/.test(message)) return "Attributing a wallet requires a source.";
  if (/violates check constraint "predictions_resolved_has_evidence"/.test(message)) return "A resolved prediction needs an outcome, an outcome source and a resolution date.";
  if (/violates check constraint "people_image_needs_credit"/.test(message)) return "Add a photo credit for the image.";
  if (/violates check constraint/.test(message)) return "Some values aren't allowed. Check the form and try again.";
  if (/violates foreign key/.test(message)) return "That record is still referenced elsewhere, so it can't be changed or removed.";
  // Messages raised by our own editorial rules are already written for editors.
  return message.replace(/^ERROR:\s*/, "");
}

export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new InputError(friendlyDbError(res.error.message));
  return res.data;
}

/** Refreshes public pages after an editorial change (they are otherwise cached for a few minutes). */
export function refreshPublic(paths: string[] = []) {
  revalidatePath("/", "layout");
  paths.forEach((p) => revalidatePath(p));
}

/**
 * Runs a newsroom write: re-checks the staff member's role and two-step verification on the server, runs the
 * change through their own session (RLS + editorial triggers apply), then returns to the page with a message.
 */
export async function runAction(
  min: StaffRole,
  form: FormData,
  fallback: string,
  fn: (staff: Staff) => Promise<string | { notice: string; to: string } | void>
): Promise<never> {
  const back = returnPath(form, fallback);
  let target: string;
  try {
    const staff = await assertStaff(min);
    const result = await fn(staff);
    target = result && typeof result === "object" ? withFlash(result.to, "notice", result.notice) : withFlash(back, "notice", result || "Saved.");
  } catch (err) {
    let message = "Something went wrong. Nothing was changed.";
    if (err instanceof StaffAuthError) message = "You don't have access to do that, or your session needs a fresh two-step code.";
    else if (err instanceof InputError || (err instanceof Error && err.name === "ValidationError")) message = err.message;
    else if (err instanceof Error && err.message) message = friendlyDbError(err.message);
    // redirect() inside the action throws a control-flow error that must propagate.
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw err;
    if (!(err instanceof InputError)) log.warn("admin_action_failed", { message: err instanceof Error ? err.message : String(err) });
    target = withFlash(back, "error", message);
  }
  redirect(target);
}

/** Writes an explicit audit entry for actions that don't change an audited table (sends, exports, job runs). */
export async function audit(staff: Staff, action: string, entityType: string, entityId: string | null, value?: unknown) {
  await staff.db.from("audit_logs").insert({ actor_id: staff.user.id, actor_label: "user", action, entity_type: entityType, entity_id: entityId, new_value: value ?? null });
}

// Form helpers -------------------------------------------------------------------------------------------
export const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};
export const opt = (form: FormData, key: string) => str(form, key) || null;
export const bool = (form: FormData, key: string) => form.get(key) === "on" || form.get(key) === "true";
export const num = (form: FormData, key: string) => {
  const v = str(form, key).replace(/[, $]/g, "");
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new InputError(`${key.replace(/_/g, " ")} must be a number.`);
  return n;
};
