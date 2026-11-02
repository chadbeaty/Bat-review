// Shared helpers for browser tests. They talk to the local Supabase stack with the service role key
// from .env.local, so tests can create confirmed members and test data without going through email.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

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

const env = { ...loadEnv(), ...process.env } as Record<string, string>;

export const PASSWORD = "test-password-123";

export function serviceClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function hasSupabase(): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export type TestUser = { id: string; email: string; username: string };

/** A member whose email is already confirmed. */
export async function createConfirmedUser(prefix = "member"): Promise<TestUser> {
  const tag = randomUUID().slice(0, 8);
  const email = `${prefix}-${tag}@example.com`;
  const username = `${prefix}_${tag}`.slice(0, 24);
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  return { id: data.user.id, email, username };
}

export async function signIn(page: Page, user: { email: string }, next = "/account") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

/** Looks up a seeded catalog product by slug (for example a bat id from data/bats.json). */
export async function productBySlug(slug: string): Promise<{ id: string; category_id: string; manufacturer_id: string }> {
  const { data, error } = await serviceClient().from("products").select("id, category_id, manufacturer_id").eq("slug", slug).single();
  if (error || !data) throw error ?? new Error(`No product ${slug}`);
  return data;
}

/**
 * Creates a live listing for a seller directly in the database (bypassing the sell flow), with one photo.
 * Use for tests of browsing, buying, messaging and offers.
 */
export async function createLiveListing(
  seller: TestUser,
  opts: { productSlug?: string; title?: string; priceCents?: number; attributes?: Record<string, unknown>; condition?: number } = {}
): Promise<string> {
  const db = serviceClient();
  const product = await productBySlug(opts.productSlug ?? "miken-freak-black-maxload-usssa-2026");
  const { data: listing, error } = await db
    .from("equipment_listings")
    .insert({
      seller_id: seller.id,
      product_id: product.id,
      category_id: product.category_id,
      manufacturer_id: product.manufacturer_id,
      title: opts.title ?? "Test listing: 2026 Miken Freak Black Maxload 26 oz",
      description: "Created by an automated test.",
      attributes: opts.attributes ?? { weight_oz: 26, certification: ["USSSA"], weighting_type: "endload", model_year: 2026 },
      asking_price_cents: opts.priceCents ?? 22000,
      condition_score: opts.condition ?? 8,
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
  const { error: pubError } = await db.from("equipment_listings").update({ listing_status: "active" }).eq("id", listing.id);
  if (pubError) throw pubError;
  return listing.id;
}
