import { NextResponse, type NextRequest } from "next/server";
import { paymentsDeps } from "@/lib/payments/server";
import { webhookSecrets } from "@/lib/payments/stripe-client";
import { processStripeWebhook } from "@/lib/payments/webhooks";

// Stripe webhook endpoint. The signature is checked against the raw request body with STRIPE_WEBHOOK_SECRET
// (and STRIPE_CONNECT_WEBHOOK_SECRET for the Connect endpoint). Orders become paid only here.

export async function POST(request: NextRequest) {
  const deps = paymentsDeps();
  if (!deps) return NextResponse.json({ received: false, error: "Payments are not configured" }, { status: 503 });
  const raw = await request.text();
  const result = await processStripeWebhook(deps, raw, request.headers.get("stripe-signature"), webhookSecrets());
  return NextResponse.json(result.body, { status: result.status });
}
