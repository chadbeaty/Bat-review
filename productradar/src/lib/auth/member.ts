import "server-only";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

type Db = NonNullable<Awaited<ReturnType<typeof createClient>>>;
export type Member = { user: User; role: "owner" | "member"; email: string; db: Db };

export type MemberCheck = { ok: true; member: Member } | { ok: false; reason: "not_configured" | "signed_out" | "not_member" | "not_owner" };

/**
 * Verifies on the server that the visitor is signed in (token checked with Supabase, not just the cookie) and is
 * listed in public.users. Returns their OWN database client, so Row Level Security and the audit log apply to
 * everything they change.
 */
export async function checkMember(requireOwner = false): Promise<MemberCheck> {
  const db = await createClient();
  if (!db) return { ok: false, reason: "not_configured" };
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return { ok: false, reason: "signed_out" };
  const service = createAdminClient();
  const { data: row } = await (service ?? db).from("users").select("role, email").eq("id", data.user.id).maybeSingle();
  if (!row) return { ok: false, reason: "not_member" };
  if (requireOwner && row.role !== "owner") return { ok: false, reason: "not_owner" };
  return { ok: true, member: { user: data.user, role: row.role as Member["role"], email: row.email as string, db } };
}

export async function requireMember(next = "/"): Promise<Member> {
  const c = await checkMember();
  if (c.ok) return c.member;
  if (c.reason === "signed_out") redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (c.reason === "not_configured") redirect("/sign-in?error=not-configured");
  redirect("/sign-in?error=no-access");
}

export async function requireOwner(next = "/admin"): Promise<Member> {
  const c = await checkMember(true);
  if (c.ok) return c.member;
  if (c.reason === "signed_out") redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (c.reason === "not_owner") notFound();
  redirect("/sign-in?error=no-access");
}

export class AuthError extends Error {}

/** For server actions: the same checks, but throws instead of redirecting. */
export async function assertMember(owner = false): Promise<Member> {
  const c = await checkMember(owner);
  if (!c.ok) throw new AuthError(c.reason);
  return c.member;
}

export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** First verified sign-in from ADMIN_EMAIL becomes the owner (only while no owner exists). */
export async function maybeBootstrapOwner(user: User): Promise<void> {
  const owner = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!owner || !user.email || user.email.toLowerCase() !== owner || !user.email_confirmed_at) return;
  const db = createAdminClient();
  if (!db) return;
  const { error } = await db.rpc("bootstrap_owner", { p_user: user.id, p_email: user.email });
  if (error) log.error("bootstrap_owner_failed", { message: error.message });
}
