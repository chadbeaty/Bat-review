// Environment configuration. NEXT_PUBLIC_* values are safe in the browser; everything else is server-only.
// Every integration reports "not configured" instead of crashing, so the app keeps working without it.

import { z } from "zod";

function optionalUrl(v: string | undefined) {
  if (!v) return undefined;
  return z.string().url().safeParse(v).success ? v.replace(/\/$/, "") : undefined;
}

export const supabaseConfig = (() => {
  const u = optionalUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return u && key && key.length > 20 ? { url: u, anonKey: key } : null;
})();

export const siteUrl =
  optionalUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export type Integration = {
  id: string;
  name: string;
  vars: readonly string[];
  required: boolean;
  purpose: string;
  getFrom: string;
  cost: string;
};

/** Every credential the app can use. Shown on Admin → Settings with a configured / missing badge. */
export const integrations: readonly Integration[] = [
  { id: "supabase", name: "Supabase", vars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"], required: true,
    purpose: "Database and sign-in.", getFrom: "supabase.com → project → Project Settings → API", cost: "Free plan: $0" },
  { id: "site", name: "Site address", vars: ["NEXT_PUBLIC_SITE_URL"], required: true,
    purpose: "Links in emails and sign-in redirects.", getFrom: "Your Vercel address, e.g. https://product-radar.vercel.app", cost: "$0" },
  { id: "owner", name: "Owner email", vars: ["ADMIN_EMAIL"], required: true,
    purpose: "The address that becomes the owner on first sign-in, and receives alerts.", getFrom: "Your email address", cost: "$0" },
  { id: "cron", name: "Scheduled jobs", vars: ["CRON_SECRET"], required: true,
    purpose: "Protects the scheduled endpoints (Vercel sends it automatically).", getFrom: "Any random string of 32+ characters", cost: "$0" },
  { id: "anthropic", name: "Claude API", vars: ["ANTHROPIC_API_KEY"], required: true,
    purpose: "Reads videos, groups product names, scores products and writes video ideas.", getFrom: "console.anthropic.com → API keys", cost: "Pay per use; capped by the daily AI budget in Settings" },
  { id: "youtube", name: "YouTube Data API v3", vars: ["YOUTUBE_API_KEY"], required: true,
    purpose: "Verifies channels and reads new uploads and view counts.", getFrom: "console.cloud.google.com → APIs & Services → enable YouTube Data API v3 → Credentials → API key", cost: "Free (10,000 units/day)" },
  { id: "resend", name: "Resend email", vars: ["RESEND_API_KEY", "ALERT_FROM_EMAIL"], required: true,
    purpose: "Daily digest and instant alerts.", getFrom: "resend.com → API keys (and a verified sending domain)", cost: "Free plan: 3,000 emails/month, 100/day" },
] as const;

export function integrationStatus(env: Record<string, string | undefined> = process.env) {
  return integrations.map((i) => ({ ...i, configured: i.vars.every((v) => Boolean(env[v])) }));
}

export const DEFAULT_MODEL = "claude-opus-5-5";
