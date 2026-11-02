// Environment configuration. Public values (NEXT_PUBLIC_*) are safe in the browser; everything else is
// server-only. Integrations report "not configured" instead of failing, so the rest of the site still works.

import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
});

export const supabaseConfig =
  publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? { url: publicEnv.NEXT_PUBLIC_SUPABASE_URL, anonKey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY }
    : null;

export const isSupabaseConfigured = supabaseConfig !== null;

export const siteUrl = publicEnv.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Integrations and the environment variables each one needs. Shown on the admin setup screen and in docs. */
export const integrations = [
  { id: "supabase", name: "Supabase (database, sign-in, photos)", vars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"], phase: 1 },
  { id: "google", name: "Google sign-in", vars: ["NEXT_PUBLIC_GOOGLE_AUTH_ENABLED"], phase: 1 },
  { id: "stripe", name: "Stripe Connect (payments and payouts)", vars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"], phase: 3 },
  { id: "shippo", name: "Shippo (rates, labels, tracking)", vars: ["SHIPPO_API_TOKEN", "SHIPPO_WEBHOOK_SECRET"], phase: 4 },
  { id: "cron", name: "Scheduled order job (releases holds, pays sellers)", vars: ["CRON_SECRET"], phase: 3 },
  { id: "resend", name: "Resend (email)", vars: ["RESEND_API_KEY"], phase: 7 },
  { id: "sentry", name: "Sentry (error monitoring)", vars: ["SENTRY_DSN"], phase: 7 },
  { id: "ga", name: "Google Analytics", vars: ["NEXT_PUBLIC_GA_MEASUREMENT_ID"], phase: 7 },
  { id: "openai", name: "OpenAI (listing assistant)", vars: ["OPENAI_API_KEY"], phase: 8 },
] as const;

export function integrationStatus(env: Record<string, string | undefined> = process.env) {
  return integrations.map((i) => ({ ...i, configured: i.vars.every((v) => Boolean(env[v])) }));
}

export const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
