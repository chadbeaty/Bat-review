// Dependencies of the payments and shipping services, passed in so tests can run them against stripe-mock and
// the local database without the Next.js server. Production wiring lives in ./server.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { RenderedEmail } from "@/lib/email/layout";
import type { ShippingProvider } from "@/lib/shipping/types";

/** A service-role database client. Only server code holds one. */
export type Db = SupabaseClient;
export type Mailer = (to: string, email: RenderedEmail) => Promise<unknown>;

export type Deps = {
  db: Db;
  stripe: Stripe;
  shipping: ShippingProvider;
  mail: Mailer;
  /** Absolute base URL for Stripe redirect links. */
  siteUrl: string;
};

export class PaymentsError extends Error {
  constructor(
    message: string,
    public code: string = "payments_error"
  ) {
    super(message);
  }
}

/** Throws a friendly error from a Supabase result, or returns its data. */
export function must<T>(res: { data: T; error: { message: string; code?: string } | null }, context = "Database error"): T {
  if (res.error) throw new PaymentsError(res.error.message || context, res.error.code ?? "db_error");
  return res.data;
}

export type Member = { id: string; email: string | null; name: string | null; username: string | null };

export async function getMember(db: Db, id: string): Promise<Member> {
  const { data } = await db.from("profiles").select("id, email, display_name, username").eq("id", id).maybeSingle();
  return { id, email: data?.email ?? null, name: data?.display_name || data?.username || null, username: data?.username ?? null };
}

/** Emails a member if they have an address. Never throws: email trouble must not undo a payment step. */
export async function emailMember(deps: Pick<Deps, "db" | "mail">, userId: string, build: (m: Member) => RenderedEmail): Promise<void> {
  try {
    const m = await getMember(deps.db, userId);
    if (!m.email) return;
    await deps.mail(m.email, build(m));
  } catch (err) {
    console.error("payments email failed", err instanceof Error ? err.message : err);
  }
}

export async function notify(db: Db, userId: string, type: string, title: string, message: string, entityId: string | null, link: string | null) {
  await db.from("notifications").insert({ user_id: userId, notification_type: type, title, message, related_entity_id: entityId, link_path: link });
}

export const purchasePath = (orderId: string) => `/account/purchases/${orderId}`;
export const saleOrderPath = (orderId: string) => `/seller/orders/${orderId}`;

export function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
