// Helpers for payment tests that run against the local Supabase stack and stripe-mock (the official Stripe test
// double: `docker run -d -p 12111:12111 stripe/stripe-mock:latest`). Used by the integration tests and the
// payments browser test. Every member, listing and order a test creates is removed again by cleanupUsers().

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function loadEnv(): Record<string, string> {
  try {
    const text = readFileSync(join(__dirname, "..", "..", ".env.local"), "utf8");
    return Object.fromEntries(
      text
        .split("\n")
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
    );
  } catch {
    return {};
  }
}

export const env = { ...loadEnv(), ...process.env } as Record<string, string>;

export const STRIPE_MOCK = {
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_API_HOST: env.STRIPE_API_HOST || "localhost",
  STRIPE_API_PORT: env.STRIPE_API_PORT || "12111",
  STRIPE_API_PROTOCOL: "http",
};

export const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET || "whsec_test_trackd_local_secret";

export function service(): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function mockStripe(): Stripe {
  return new Stripe("sk_test_123", { host: STRIPE_MOCK.STRIPE_API_HOST, port: STRIPE_MOCK.STRIPE_API_PORT, protocol: "http", maxNetworkRetries: 0 });
}

export async function stripeMockUp(): Promise<boolean> {
  try {
    const res = await fetch(`http://${STRIPE_MOCK.STRIPE_API_HOST}:${STRIPE_MOCK.STRIPE_API_PORT}/v1/balance`, {
      headers: { Authorization: "Bearer sk_test_123" },
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function supabaseUp(): Promise<boolean> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const { error } = await service().from("site_settings").select("key").limit(1);
    return !error;
  } catch {
    return false;
  }
}

export type Member = { id: string; email: string; username: string };

export async function createMember(prefix: string, password = "test-password-123"): Promise<Member> {
  const tag = randomUUID().slice(0, 8);
  const email = `${prefix}-${tag}@example.com`;
  const username = `${prefix}_${tag}`.slice(0, 24);
  const { data, error } = await service().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  return { id: data.user.id, email, username };
}

/** Marks a seller as having finished Stripe onboarding (the account.updated webhook does this in real life). */
export async function makeSellerReady(sellerId: string, accountId = `acct_test_${randomUUID().slice(0, 12)}`) {
  const { error } = await service()
    .from("seller_payment_accounts")
    .upsert({ seller_id: sellerId, stripe_connected_account_id: accountId, onboarding_status: "complete", payouts_enabled: true }, { onConflict: "seller_id" });
  if (error) throw error;
  return accountId;
}

export async function liveListing(seller: Member, priceCents = 22000): Promise<string> {
  const db = service();
  const { data: product } = await db.from("products").select("id, category_id, manufacturer_id").eq("slug", "miken-freak-black-maxload-usssa-2026").single();
  if (!product) throw new Error("seed product missing");
  const { data: listing, error } = await db
    .from("equipment_listings")
    .insert({
      seller_id: seller.id,
      product_id: product.id,
      category_id: product.category_id,
      manufacturer_id: product.manufacturer_id,
      title: `Payments test bat ${randomUUID().slice(0, 6)}`,
      description: "Created by an automated payments test.",
      attributes: { weight_oz: 26, certification: ["USSSA"], weighting_type: "endload", model_year: 2026 },
      asking_price_cents: priceCents,
      condition_score: 8,
      condition_label: "Normal light wear",
      structural_disclosure: "no_known_damage",
      has_cracks: false,
      has_rattle: false,
      has_loose_end_cap: false,
      has_repairs: false,
      has_alterations: false,
      has_significant_damage: false,
      authenticity_declaration: true,
      ownership_declaration: true,
      shipping_weight_oz: 48,
      package_length_inches: 38,
      package_width_inches: 5,
      package_height_inches: 5,
      shipping_origin_postal_code: "37201",
      location_city: "Nashville",
      location_state: "TN",
    })
    .select("id")
    .single();
  if (error || !listing) throw error ?? new Error("listing insert failed");
  await db.from("listing_images").insert({ listing_id: listing.id, image_url: "https://placehold.co/800x600/png?text=Test+bat", image_type: "full" });
  const { error: pub } = await db.from("equipment_listings").update({ listing_status: "active" }).eq("id", listing.id);
  if (pub) throw pub;
  return listing.id;
}

export async function buyerAddress(buyer: Member): Promise<string> {
  const { data, error } = await service()
    .from("addresses")
    .insert({ user_id: buyer.id, full_name: "Pat Buyer", street_address: "1 Main St", city: "Austin", state: "TX", postal_code: "78701" })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("address insert failed");
  return data.id;
}

/** An order inserted directly (bypassing checkout_create_order, so tests don't have to switch checkout on). */
export async function insertOrder(
  buyer: Member,
  seller: Member,
  listingId: string,
  opts: { status?: string; paymentIntent?: string; charge?: string; itemCents?: number; shippingCents?: number } = {}
) {
  const db = service();
  const item = opts.itemCents ?? 22000;
  const ship = opts.shippingCents ?? 1899;
  const commission = Math.round(item * 0.07);
  const address = await buyerAddress(buyer);
  const { data: order, error } = await db
    .from("orders")
    .insert({
      buyer_id: buyer.id,
      seller_id: seller.id,
      order_status: opts.status ?? "awaiting_payment",
      subtotal_cents: item,
      shipping_cost_cents: ship,
      total_amount_cents: item + ship,
      platform_fee_cents: commission,
      seller_payout_cents: item - commission,
      shipping_address_id: address,
      shipping_rate_snapshot: { carrier: "USPS", service: "Ground Advantage", serviceToken: "usps_ground_advantage", amountCents: ship },
      stripe_payment_intent_id: opts.paymentIntent ?? null,
      stripe_charge_id: opts.charge ?? null,
      paid_at: opts.status && opts.status !== "awaiting_payment" ? new Date().toISOString() : null,
      checkout_expires_at: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
    })
    .select("*")
    .single();
  if (error || !order) throw error ?? new Error("order insert failed");
  const { data: listing } = await db.from("equipment_listings").select("product_id").eq("id", listingId).single();
  const { error: itemError } = await db.from("order_items").insert({
    order_id: order.id,
    listing_id: listingId,
    product_id: listing?.product_id ?? null,
    seller_id: seller.id,
    product_title_snapshot: "Payments test bat",
    unit_price_cents: item,
  });
  if (itemError) throw itemError;
  return order as { id: string; order_number: string; total_amount_cents: number };
}

/** Deletes members and everything their tests created (orders first: they don't cascade from users). */
export async function cleanupUsers(ids: string[]) {
  const db = service();
  const real = ids.filter(Boolean);
  if (real.length === 0) return;
  const list = `(${real.join(",")})`;
  const { data: orders } = await db.from("orders").select("id").or(`buyer_id.in.${list},seller_id.in.${list}`);
  const orderIds = (orders ?? []).map((o) => o.id);
  if (orderIds.length) {
    await db.from("price_history").delete().in("transaction_id", orderIds);
    await db.from("orders").delete().in("id", orderIds);
  }
  for (const id of real) await db.auth.admin.deleteUser(id);
}
