// Environment configuration. NEXT_PUBLIC_* values are safe in the browser; everything else is server-only.
// Every integration reports "not configured" instead of crashing, so the site keeps working without
// optional providers.

import { z } from "zod";

const url = z.string().url();

function optionalUrl(v: string | undefined) {
  if (!v) return undefined;
  return url.safeParse(v).success ? v.replace(/\/$/, "") : undefined;
}

export const supabaseConfig = (() => {
  const u = optionalUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return u && key && key.length > 20 ? { url: u, anonKey: key } : null;
})();

export const isSupabaseConfigured = supabaseConfig !== null;

/** Canonical public address of the site. Never hard-coded: set SITE_URL / NEXT_PUBLIC_SITE_URL per environment. */
export const siteUrl =
  optionalUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
  optionalUrl(process.env.SITE_URL) ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export type Integration = {
  id: string;
  name: string;
  vars: readonly string[];
  required: boolean;
  purpose: string;
  getFrom: string;
};

/** Every credential the app can use, where to get it, and whether it is required. Shown in Admin → Settings. */
export const integrations: readonly Integration[] = [
  { id: "supabase", name: "Supabase", vars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"], required: true,
    purpose: "Database, sign-in and file storage.", getFrom: "supabase.com → your project → Project Settings → API" },
  { id: "site", name: "Site address", vars: ["NEXT_PUBLIC_SITE_URL"], required: true,
    purpose: "Canonical links, sitemap, emails and share images.", getFrom: "Your Vercel domain, e.g. https://aged-takes.vercel.app" },
  { id: "admin", name: "First admin", vars: ["ADMIN_EMAIL"], required: true,
    purpose: "The email address that becomes the first newsroom admin when it first signs in.", getFrom: "Your own email address" },
  { id: "cron", name: "Scheduled jobs", vars: ["CRON_SECRET"], required: true,
    purpose: "Protects the scheduled research and monitoring endpoints.", getFrom: "Any long random string (Vercel sends it automatically)" },
  { id: "secrets", name: "Signing secrets", vars: ["NEWSLETTER_SECRET", "RATE_LIMIT_SALT"], required: false,
    purpose: "Sign newsletter unsubscribe links and hash visitor IPs. Falls back to the service key if unset; set them before launch.", getFrom: "Any long random strings (openssl rand -hex 32)" },
  { id: "anthropic", name: "Anthropic Claude API", vars: ["ANTHROPIC_API_KEY"], required: false,
    purpose: "AI research agents. Without it, research jobs are skipped and everything else works.", getFrom: "console.anthropic.com → API keys (needs API billing)" },
  { id: "resend", name: "Resend email", vars: ["RESEND_API_KEY", "NEWSLETTER_FROM_EMAIL"], required: false,
    purpose: "Newsletter confirmation, welcome, digest and alert emails.", getFrom: "resend.com → API keys; verify your sending domain first" },
  { id: "youtube", name: "YouTube Data API", vars: ["YOUTUBE_API_KEY"], required: false,
    purpose: "Monitor public videos from tracked channels.", getFrom: "console.cloud.google.com → APIs → YouTube Data API v3 → credentials" },
  { id: "fmp", name: "Financial Modeling Prep", vars: ["FMP_API_KEY"], required: false,
    purpose: "Stock prices for resolving stock predictions.", getFrom: "financialmodelingprep.com → dashboard (free tier available)" },
  { id: "coingecko", name: "CoinGecko (optional key)", vars: ["COINGECKO_API_KEY"], required: false,
    purpose: "Crypto prices. Works without a key at low volume; a demo key raises limits.", getFrom: "coingecko.com/en/api → Demo API key" },
  { id: "sec", name: "SEC EDGAR contact", vars: ["SEC_USER_AGENT"], required: false,
    purpose: "SEC requires a descriptive User-Agent with a contact email for automated access.", getFrom: 'Your publication name and contact email, e.g. "Aged Takes research@yourdomain.com"' },
  { id: "sentry", name: "Error tracking", vars: ["SENTRY_DSN"], required: false,
    purpose: "Optional error tracking integration point (see src/lib/log.ts).", getFrom: "sentry.io → project → Client Keys (DSN)" },
] as const;

export function integrationStatus(env: Record<string, string | undefined> = process.env) {
  return integrations.map((i) => ({ ...i, configured: i.vars.every((v) => Boolean(env[v])) }));
}

export const aiConfig = {
  /** Model used by the research agents. Defaults to Claude Opus 5.5; override with ANTHROPIC_MODEL. */
  model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  get enabled() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },
};
