import "server-only";
import { createClient } from "@/lib/supabase/server";
import * as reference from "@/data/reference";
import fallbackCatalog from "@/data/catalog-fallback.json";
import type { BatSpec } from "@/lib/bat-drawing";
import { withCardExtras } from "@/lib/card-extras";

// Read-only catalog queries for public pages. When the database isn't connected, reference data and the
// researched bat catalog are used instead. Listings and sponsors never fall back: without a database there are none.

export type CategorySummary = { slug: string; name: string; description: string | null };
export type ManufacturerSummary = { slug: string; name: string };
export type BatModel = {
  slug: string;
  name: string;
  manufacturer: string;
  modelYear: number | null;
  certifications: string[];
  weightingType: string;
};
export type ListingCard = {
  id: string;
  title: string;
  askingPriceCents: number;
  conditionScore: number | null;
  locationCity: string | null;
  locationState: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  publishedAt: string | null;
  /** Extra facts for drawing and describing the listing (bats especially). Filled in by withCardExtras(). */
  extra?: CardExtra;
};
/** What a listing card needs beyond the basics: category, brand, the bat's real specs, stamps and passport progress. */
export type CardExtra = {
  categorySlug: string | null;
  brand: string | null;
  bat: BatSpec | null;
  /** Stamps on the barrel (USSSA, USA, ...) as the seller listed them, or the catalog model's. */
  stamps: string[];
  weightOz: number | null;
  approxHits: number | null;
  /** How many of the four Bat Passport checks have data (null when it is not a catalog bat). */
  passportFilled: number | null;
};
export type Partner = { id: string; advertiserName: string; imageUrl: string | null; destinationUrl: string | null };

export async function getCategories(): Promise<CategorySummary[]> {
  const supabase = await createClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("product_categories")
      .select("slug, name, description")
      .eq("active", true)
      .order("display_order");
    if (!error && data) return data;
  }
  return reference.categories.map(({ slug, name, description }) => ({ slug, name, description }));
}

export async function getManufacturers(): Promise<ManufacturerSummary[]> {
  const supabase = await createClient();
  if (supabase) {
    const { data, error } = await supabase.from("manufacturers").select("slug, name").eq("active", true).order("name");
    if (!error && data) return data.filter((m) => m.slug !== "other");
  }
  return reference.manufacturers.filter((m) => m.slug !== "other").sort((a, b) => a.name.localeCompare(b.name));
}

/** One model per manufacturer first, so a list isn't all one brand. Keeps the input order otherwise. */
export function varyByManufacturer<T extends { manufacturer: string }>(models: T[], limit: number): T[] {
  const seen = new Set<string>();
  const first = models.filter((m) => !seen.has(m.manufacturer) && seen.add(m.manufacturer));
  const rest = models.filter((m) => !first.includes(m));
  return [...first, ...rest].slice(0, limit);
}

/** Bat models from the newest model year in the catalog, newest first, mixing manufacturers. */
export async function getNewestBatModels(limit = 8): Promise<BatModel[]> {
  const supabase = await createClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("products")
      .select("slug, product_name, model_year, certification_association, manufacturers(name), product_categories!inner(slug), bat_specifications(weighting_type)")
      .eq("product_categories.slug", "bats")
      .order("model_year", { ascending: false })
      .order("product_name")
      .limit(limit * 6);
    if (!error && data) {
      const newest = data[0]?.model_year;
      const models = data.filter((p) => p.model_year === newest).map((p) => {
        const mfr = p.manufacturers as unknown as { name: string } | null;
        const specs = p.bat_specifications as unknown as { weighting_type: string }[] | null;
        return {
          slug: p.slug,
          name: p.product_name.replace(/^\d{4}\s+/, ""),
          manufacturer: mfr?.name ?? "",
          modelYear: p.model_year,
          certifications: p.certification_association ?? [],
          weightingType: specs?.[0]?.weighting_type ?? "unknown",
        };
      });
      return varyByManufacturer(models, limit);
    }
  }
  const sorted = [...fallbackCatalog.bats].sort((a, b) => b.modelYear - a.modelYear || a.name.localeCompare(b.name));
  const newestYear = sorted[0]?.modelYear;
  const fallback = sorted
    .filter((b) => b.modelYear === newestYear)
    .map((b) => ({
      slug: b.slug,
      name: b.name,
      manufacturer: b.manufacturer,
      modelYear: b.modelYear,
      certifications: b.certifications,
      weightingType: b.weightingType,
    }));
  return varyByManufacturer(fallback, limit);
}

export async function getCatalogStats(): Promise<{ batModels: number; manufacturers: number }> {
  const supabase = await createClient();
  if (supabase) {
    const [bats, mfrs] = await Promise.all([
      supabase.from("products").select("id, product_categories!inner(slug)", { count: "exact", head: true }).eq("product_categories.slug", "bats"),
      supabase.from("manufacturers").select("id", { count: "exact", head: true }).eq("active", true),
    ]);
    if (!bats.error && !mfrs.error) return { batModels: bats.count ?? 0, manufacturers: (mfrs.count ?? 1) - 1 };
  }
  return { batModels: fallbackCatalog.bats.length, manufacturers: reference.manufacturers.length - 1 };
}

/** Live listings, newest first. Optionally only one category, or only featured listings. */
export async function getListings(opts: { category?: string; excludeCategory?: string; featured?: boolean; limit?: number } = {}): Promise<ListingCard[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  let query = supabase
    .from("equipment_listings")
    .select(
      "id, title, asking_price_cents, condition_score, location_city, location_state, published_at, product_categories!inner(slug), listing_images(image_url, alt_text, display_order)"
    )
    .eq("listing_status", "active")
    .order("published_at", { ascending: false })
    .limit(opts.limit ?? 8);
  if (opts.category) query = query.eq("product_categories.slug", opts.category);
  if (opts.excludeCategory) query = query.neq("product_categories.slug", opts.excludeCategory);
  if (opts.featured) query = query.eq("featured", true);
  const { data, error } = await query;
  if (error || !data) return [];
  const cards = data.map((l) => {
    const images = ((l.listing_images as unknown as { image_url: string; alt_text: string | null; display_order: number }[]) ?? []).sort(
      (a, b) => a.display_order - b.display_order
    );
    return {
      id: l.id,
      title: l.title,
      askingPriceCents: l.asking_price_cents,
      conditionScore: l.condition_score,
      locationCity: l.location_city,
      locationState: l.location_state,
      imageUrl: images[0]?.image_url ?? null,
      imageAlt: images[0]?.alt_text ?? null,
      publishedAt: l.published_at,
    };
  });
  return withCardExtras(cards);
}

/** Sponsors with a paid, running homepage placement. Empty until a real sponsor buys one. */
export async function getHomepagePartners(): Promise<Partner[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("advertising_campaigns")
    .select("id, advertiser_name, image_url, destination_url")
    .eq("placement", "homepage_partner");
  if (error || !data) return [];
  return data.map((c) => ({ id: c.id, advertiserName: c.advertiser_name, imageUrl: c.image_url, destinationUrl: c.destination_url }));
}
