import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { shippingProviderFromEnv } from "@/lib/shipping/provider";
import { createStripe } from "./stripe-client";
import type { Deps } from "./deps";

/** Server wiring for the payments services, or null when Stripe or the database isn't configured. */
export function paymentsDeps(): Deps | null {
  const db = createAdminClient();
  const stripe = createStripe();
  if (!db || !stripe) return null;
  return {
    db,
    stripe,
    shipping: shippingProviderFromEnv(),
    mail: (to, email) => sendEmail(to, email),
    siteUrl,
  };
}

/** Checks `Authorization: Bearer <CRON_SECRET>` in constant time. */
export function cronAuthorized(header: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
