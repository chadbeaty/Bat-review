// Creates the Stripe client. STRIPE_API_HOST / STRIPE_API_PORT / STRIPE_API_PROTOCOL point it at a test double
// (stripe-mock) for automated tests; leave them unset in production so it talks to api.stripe.com.

import Stripe from "stripe";

export type StripeEnv = Record<string, string | undefined>;

export function stripeConfigured(env: StripeEnv = process.env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function createStripe(env: StripeEnv = process.env): Stripe | null {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  const host = env.STRIPE_API_HOST?.trim();
  const protocol = env.STRIPE_API_PROTOCOL === "http" ? "http" : env.STRIPE_API_PROTOCOL === "https" ? "https" : undefined;
  return new Stripe(key, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "slowpitch-marketplace" },
    ...(host ? { host } : {}),
    ...(env.STRIPE_API_PORT ? { port: env.STRIPE_API_PORT } : {}),
    ...(protocol ? { protocol } : {}),
  });
}

/** True when the key is a live-mode key. Pages warn when test keys are in use. */
export function isLiveKey(env: StripeEnv = process.env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.startsWith("sk_live_") || env.STRIPE_SECRET_KEY?.startsWith("rk_live_"));
}

/** The webhook signing secrets to try: the platform endpoint's and (optionally) the Connect endpoint's. */
export function webhookSecrets(env: StripeEnv = process.env): string[] {
  return [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_CONNECT_WEBHOOK_SECRET].map((s) => s?.trim()).filter((s): s is string => Boolean(s));
}

export type { Stripe };
