import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ListingCard } from "@/lib/catalog";
import { PAGE_SIZE, searchRpcArgs, type SearchQuery } from "@/lib/search";

// Server-side reads for the shop, listing and seller pages. Everything runs as the visitor, so Row Level
// Security decides what is visible (drafts only to their seller, private columns never).

export type SearchResult = { listings: ListingCard[]; total: number; pageSize: number; failed: boolean };

type SearchRow = {
  id: string;
  title: string;
  asking_price_cents: number;
  condition_score: number | null;
  location_city: string | null;
  location_state: string | null;
  published_at: string | null;
  image_url: string | null;
  image_alt: string | null;
  total_count: number;
};

export async function searchListings(query: SearchQuery, scope: { category?: string; sellerId?: string; pageSize?: number } = {}): Promise<SearchResult> {
  const pageSize = scope.pageSize ?? PAGE_SIZE;
  const supabase = await createClient();
  if (!supabase) return { listings: [], total: 0, pageSize, failed: false };
  const { data, error } = await supabase.rpc("search_listings", searchRpcArgs(query, scope));
  if (error || !data) {
    console.error("search_listings failed", error?.message);
    return { listings: [], total: 0, pageSize, failed: true };
  }
  const rows = data as SearchRow[];
  let total = rows[0] ? Number(rows[0].total_count) : 0;
  // Past the last page there are no rows to carry the count, so ask for the first page's count instead.
  if (!rows.length && query.page > 1) {
    const { data: firstPage } = await supabase.rpc("search_listings", { ...searchRpcArgs({ ...query, page: 1 }, scope), p_limit: 1 });
    total = (firstPage as SearchRow[] | null)?.[0] ? Number((firstPage as SearchRow[])[0].total_count) : 0;
  }
  return {
    total,
    pageSize,
    failed: false,
    listings: rows.map((r) => ({
      id: r.id,
      title: r.title,
      askingPriceCents: r.asking_price_cents,
      conditionScore: r.condition_score,
      locationCity: r.location_city,
      locationState: r.location_state,
      imageUrl: r.image_url,
      imageAlt: r.image_alt,
      publishedAt: r.published_at,
    })),
  };
}

export type Facets = Record<string, { value: string; listings: number }[]>;

/** Filter values that have live listings, with counts (for example the weights actually for sale). */
export async function getFacets(category?: string): Promise<Facets> {
  const supabase = await createClient();
  if (!supabase) return {};
  const { data, error } = await supabase.rpc("search_listing_facets", { p_category: category ?? null });
  if (error || !data) return {};
  const out: Facets = {};
  for (const row of data as { facet: string; value: string; listings: number }[]) {
    (out[row.facet] ??= []).push({ value: row.value, listings: Number(row.listings) });
  }
  return out;
}

export type Suggestions = { correctedQuery: string | null; models: { name: string; slug: string }[] };

/** Did-you-mean help for a search with no results: a respelled query and catalog models that look close. */
export async function getSuggestions(q: string, terms: string[]): Promise<Suggestions> {
  const supabase = await createClient();
  if (!supabase || !q) return { correctedQuery: null, models: [] };
  const [spelling, models] = await Promise.all([
    supabase.rpc("search_spelling", { p_terms: terms }),
    supabase.rpc("search_suggestions", { p_query: q, p_limit: 4 }),
  ]);
  const fixes = new Map(((spelling.data ?? []) as { term: string; suggestion: string }[]).map((r) => [r.term, r.suggestion]));
  const corrected = fixes.size ? terms.map((t) => fixes.get(t) ?? t).join(" ") : null;
  return {
    correctedQuery: corrected,
    models: ((models.data ?? []) as { suggestion: string; product_slug: string }[]).map((m) => ({ name: m.suggestion, slug: m.product_slug })),
  };
}

export type CategoryField = {
  key: string;
  label: string;
  type: "number" | "select" | "multiselect" | "text";
  options?: (string | number)[];
};
export type CategoryDetail = { id: string; slug: string; name: string; description: string | null; fields: CategoryField[] };

export const getCategoryDetail = cache(async (slug: string): Promise<CategoryDetail | null> => {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("product_categories")
    .select("id, slug, name, description, attribute_schema")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, slug: data.slug, name: data.name, description: data.description, fields: (data.attribute_schema ?? []) as CategoryField[] };
});

export type BrandOption = { slug: string; name: string };
export type ModelOption = { slug: string; name: string; manufacturerSlug: string; modelYear: number | null };

/** Brands and catalog models for the filter menus, from the published catalog. */
export async function getFilterOptions(category?: string): Promise<{ brands: BrandOption[]; models: ModelOption[] }> {
  const supabase = await createClient();
  if (!supabase) return { brands: [], models: [] };
  const brandsReq = supabase.from("manufacturers").select("slug, name").eq("active", true).order("name");
  let modelsReq = supabase
    .from("products")
    .select("slug, product_name, model_year, manufacturers(slug), product_categories!inner(slug)")
    .order("product_name")
    .limit(1000);
  if (category) modelsReq = modelsReq.eq("product_categories.slug", category);
  const [brands, models] = await Promise.all([brandsReq, category ? modelsReq : Promise.resolve({ data: [] as never[] })]);
  return {
    brands: (brands.data ?? []).filter((b) => b.slug !== "other"),
    models: ((models.data ?? []) as unknown as { slug: string; product_name: string; model_year: number | null; manufacturers: { slug: string } | null }[]).map(
      (p) => ({ slug: p.slug, name: p.product_name, manufacturerSlug: p.manufacturers?.slug ?? "", modelYear: p.model_year })
    ),
  };
}

// ---------------------------------------------------------------------------
// Listing detail
// ---------------------------------------------------------------------------

export type ListingDetail = {
  id: string;
  sellerId: string;
  title: string;
  description: string | null;
  attributes: Record<string, unknown>;
  askingPriceCents: number;
  acceptsOffers: boolean;
  conditionScore: number | null;
  conditionLabel: string | null;
  structuralDisclosure: "no_known_damage" | "damage_disclosed" | "unknown";
  damage: {
    hasCracks: boolean | null;
    hasRattle: boolean | null;
    hasLooseEndCap: boolean | null;
    hasRepairs: boolean | null;
    hasAlterations: boolean | null;
    hasSignificantDamage: boolean | null;
  };
  cosmeticWear: string | null;
  damageDisclosure: string | null;
  authenticityDeclaration: boolean;
  ownershipDeclaration: boolean;
  locationCity: string | null;
  locationState: string | null;
  status: string;
  viewsCount: number;
  publishedAt: string | null;
  soldAt: string | null;
  updatedAt: string;
  images: { url: string; alt: string | null; type: string }[];
  category: { slug: string; name: string; fields: CategoryField[] } | null;
  manufacturer: { slug: string; name: string } | null;
  product: { id: string; slug: string; name: string; modelYear: number | null; manufacturerSlug: string | null } | null;
};

const LISTING_COLUMNS = `
  id, seller_id, title, description, attributes, asking_price_cents, accepts_offers, condition_score, condition_label,
  structural_disclosure, has_cracks, has_rattle, has_loose_end_cap, has_repairs, has_alterations, has_significant_damage,
  cosmetic_wear, damage_disclosure, authenticity_declaration, ownership_declaration, location_city, location_state,
  listing_status, views_count, published_at, sold_at, updated_at,
  listing_images(image_url, alt_text, image_type, display_order, uploaded_at),
  product_categories(slug, name, attribute_schema),
  manufacturers(slug, name),
  products(id, slug, product_name, model_year, manufacturers(slug, name))
`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID.test(v);
}

/** A listing as the visitor may see it, or null (unknown, or a draft that isn't theirs). Cached per request. */
export const getListing = cache(async (id: string): Promise<ListingDetail | null> => {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("equipment_listings").select(LISTING_COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  type Row = {
    listing_images: { image_url: string; alt_text: string | null; image_type: string; display_order: number; uploaded_at: string }[] | null;
    product_categories: { slug: string; name: string; attribute_schema: CategoryField[] } | null;
    manufacturers: { slug: string; name: string } | null;
    products: { id: string; slug: string; product_name: string; model_year: number | null; manufacturers: { slug: string; name: string } | null } | null;
  };
  const row = data as unknown as typeof data & Row;
  const images = [...(row.listing_images ?? [])].sort((a, b) => a.display_order - b.display_order || a.uploaded_at.localeCompare(b.uploaded_at));
  const product = row.products;
  return {
    id: row.id,
    sellerId: row.seller_id,
    title: row.title,
    description: row.description,
    attributes: (row.attributes ?? {}) as Record<string, unknown>,
    askingPriceCents: row.asking_price_cents,
    acceptsOffers: row.accepts_offers,
    conditionScore: row.condition_score,
    conditionLabel: row.condition_label,
    structuralDisclosure: row.structural_disclosure,
    damage: {
      hasCracks: row.has_cracks,
      hasRattle: row.has_rattle,
      hasLooseEndCap: row.has_loose_end_cap,
      hasRepairs: row.has_repairs,
      hasAlterations: row.has_alterations,
      hasSignificantDamage: row.has_significant_damage,
    },
    cosmeticWear: row.cosmetic_wear,
    damageDisclosure: row.damage_disclosure,
    authenticityDeclaration: row.authenticity_declaration,
    ownershipDeclaration: row.ownership_declaration,
    locationCity: row.location_city,
    locationState: row.location_state,
    status: row.listing_status,
    viewsCount: row.views_count,
    publishedAt: row.published_at,
    soldAt: row.sold_at,
    updatedAt: row.updated_at,
    images: images.map((i) => ({ url: i.image_url, alt: i.alt_text, type: i.image_type })),
    category: row.product_categories
      ? { slug: row.product_categories.slug, name: row.product_categories.name, fields: row.product_categories.attribute_schema ?? [] }
      : null,
    manufacturer: row.manufacturers ?? product?.manufacturers ?? null,
    product: product
      ? { id: product.id, slug: product.slug, name: product.product_name, modelYear: product.model_year, manufacturerSlug: product.manufacturers?.slug ?? null }
      : null,
  };
});

// ---------------------------------------------------------------------------
// Sellers
// ---------------------------------------------------------------------------

export type SellerSummary = {
  id: string;
  username: string;
  displayName: string | null;
  photoUrl: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  sellerVerified: boolean;
  identityVerified: boolean;
  memberSince: string;
  completedSales: number;
  completedPurchases: number;
  averageRating: number | null;
  reviewCount: number;
  activeListings: number;
};

const PROFILE_COLUMNS = "id, username, display_name, profile_photo_url, bio, city, state, seller_verified, identity_verified, created_at";

async function withStats(profile: {
  id: string;
  username: string;
  display_name: string | null;
  profile_photo_url: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  seller_verified: boolean;
  identity_verified: boolean;
  created_at: string;
}): Promise<SellerSummary> {
  const supabase = (await createClient())!;
  const { data: stats } = await supabase.from("seller_public_stats").select("*").eq("user_id", profile.id).maybeSingle();
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    photoUrl: profile.profile_photo_url,
    bio: profile.bio,
    city: profile.city,
    state: profile.state,
    sellerVerified: profile.seller_verified,
    identityVerified: profile.identity_verified,
    memberSince: profile.created_at,
    completedSales: stats?.completed_sales ?? 0,
    completedPurchases: stats?.completed_purchases ?? 0,
    averageRating: stats?.average_rating != null ? Number(stats.average_rating) : null,
    reviewCount: stats?.review_count ?? 0,
    activeListings: stats?.active_listings ?? 0,
  };
}

export const getSellerById = cache(async (id: string): Promise<SellerSummary | null> => {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", id).in("account_status", ["active", "suspended"]).maybeSingle();
  return data ? withStats(data) : null;
});

export const getSellerByUsername = cache(async (username: string): Promise<SellerSummary | null> => {
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  // username is citext, so this match ignores case.
  const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("username", username).eq("account_status", "active").maybeSingle();
  return data ? withStats(data) : null;
});

export type PublicReview = { id: string; rating: number; text: string | null; response: string | null; role: "buyer" | "seller"; createdAt: string; reviewer: string | null; reviewerId: string };

/** Published reviews of a member, newest first. */
export async function getReviewsOf(userId: string, limit = 10): Promise<PublicReview[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("reviews")
    .select("id, rating, review_text, response_text, reviewer_role, created_at, reviewer_id")
    .eq("reviewed_user_id", userId)
    .eq("review_status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!data?.length) return [];
  const { data: reviewers } = await supabase.from("profiles").select("id, username").in("id", [...new Set(data.map((r) => r.reviewer_id))]);
  const names = new Map((reviewers ?? []).map((r) => [r.id, r.username as string]));
  return data.map((r) => ({
    id: r.id,
    rating: r.rating,
    text: r.review_text,
    response: r.response_text,
    role: r.reviewer_role,
    createdAt: r.created_at,
    reviewer: names.get(r.reviewer_id) ?? null,
    reviewerId: r.reviewer_id as string,
  }));
}

/** Whether the signed-in member has favorited a listing. */
export async function isFavorite(userId: string, listingId: string): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return false;
  const { data } = await supabase.from("favorites").select("id").eq("user_id", userId).eq("listing_id", listingId).maybeSingle();
  return Boolean(data);
}
