import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  attributesSchema,
  listedWeights,
  parseAttributeSchema,
  parseRequiredPhotos,
  prefillFromProduct,
  type AttributeField,
  type Attributes,
  type ProductForPrefill,
  type RequiredPhoto,
} from "./attributes";
import type { ListingRecord } from "./listing";

// Server-side reads for the listing flow and seller dashboard. Everything runs as the signed-in seller, so
// Row Level Security limits it to their own listings. The ship-from ZIP comes from get_listing_shipping_origin,
// because column privileges hide it from direct selects.

/** Every column a seller may select (shipping_origin_postal_code is deliberately absent). */
export const LISTING_COLUMNS =
  "id, seller_id, category_id, manufacturer_id, product_id, title, description, attributes, asking_price_cents, accepts_offers, condition_score, structural_disclosure, has_cracks, has_rattle, has_loose_end_cap, has_repairs, has_alterations, has_significant_damage, cosmetic_wear, damage_disclosure, authenticity_declaration, ownership_declaration, shipping_weight_oz, package_length_inches, package_width_inches, package_height_inches, location_city, location_state, listing_status, published_at, expires_at";

export type SellCategory = { id: string; name: string; slug: string; description: string | null; fields: AttributeField[]; photos: RequiredPhoto[] };
export type SellManufacturer = { id: string; name: string; slug: string };

export type ListingPhoto = { id: string; url: string; storagePath: string | null; imageType: string; order: number; alt: string | null };

export type ProductSummary = {
  id: string;
  name: string;
  modelName: string;
  modelYear: number | null;
  slug: string;
  certifications: string[];
  listedWeights: number[];
  prefill: Attributes;
};

export type PriceHint = { sales: { priceCents: number; date: string; condition: number | null }[] };

export type ListingSnapshot = {
  listing: ListingRecord;
  shipFrom: string | null;
  photos: ListingPhoto[];
  category: SellCategory;
  manufacturer: SellManufacturer | null;
  product: ProductSummary | null;
  submission: { id: string; modelName: string; modelYear: number | null; status: string } | null;
  priceHint: PriceHint | null;
  attributesValid: boolean;
};

type Db = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export async function getSellCategories(db: Db): Promise<SellCategory[]> {
  const { data } = await db
    .from("product_categories")
    .select("id, name, slug, description, attribute_schema, required_photos")
    .eq("active", true)
    .order("display_order");
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    fields: parseAttributeSchema(c.attribute_schema),
    photos: parseRequiredPhotos(c.required_photos),
  }));
}

export async function getSellManufacturers(db: Db): Promise<SellManufacturer[]> {
  const { data } = await db.from("manufacturers").select("id, name, slug").eq("active", true).order("name");
  // "Other" goes last so the real brands are easy to scan.
  return (data ?? []).sort((a, b) => Number(a.slug === "other") - Number(b.slug === "other"));
}

const PRODUCT_COLUMNS =
  "id, product_name, model_name, model_year, slug, certification_association, product_specifications, bat_specifications(weight_oz, length_inches, barrel_length_inches, weighting_type, construction_type)";

type ProductRow = {
  id: string;
  product_name: string;
  model_name: string;
  model_year: number | null;
  slug: string;
  certification_association: string[] | null;
  product_specifications: Record<string, unknown> | null;
  bat_specifications: ProductForPrefill["bat_specifications"] | null;
};

export function summarizeProduct(p: ProductRow, fields: AttributeField[]): ProductSummary {
  const forPrefill: ProductForPrefill = {
    model_year: p.model_year,
    certification_association: p.certification_association,
    product_specifications: p.product_specifications,
    bat_specifications: p.bat_specifications ?? [],
  };
  return {
    id: p.id,
    name: p.product_name,
    modelName: p.model_name,
    modelYear: p.model_year,
    slug: p.slug,
    certifications: p.certification_association ?? [],
    listedWeights: listedWeights(forPrefill),
    prefill: prefillFromProduct(fields, forPrefill),
  };
}

/** Published catalog models for a category and brand, newest first. */
export async function findProducts(db: Db, categoryId: string, manufacturerId: string, fields: AttributeField[]): Promise<ProductSummary[]> {
  const { data } = await db
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("catalog_status", "published")
    .eq("category_id", categoryId)
    .eq("manufacturer_id", manufacturerId)
    .order("model_year", { ascending: false, nullsFirst: false })
    .order("product_name")
    .limit(300);
  return ((data ?? []) as unknown as ProductRow[]).map((p) => summarizeProduct(p, fields));
}

export async function getProduct(db: Db, productId: string, fields: AttributeField[]): Promise<ProductSummary | null> {
  const { data } = await db.from("products").select(PRODUCT_COLUMNS).eq("id", productId).eq("catalog_status", "published").maybeSingle();
  return data ? summarizeProduct(data as unknown as ProductRow, fields) : null;
}

/** Verified marketplace sales of this model, newest first. Never estimates. */
export async function getPriceHint(db: Db, productId: string | null): Promise<PriceHint | null> {
  if (!productId) return null;
  const { data } = await db
    .from("price_history")
    .select("sold_price_cents, sale_date, condition_score")
    .eq("product_id", productId)
    .eq("verified_transaction", true)
    .order("sale_date", { ascending: false })
    .limit(5);
  return { sales: (data ?? []).map((s) => ({ priceCents: s.sold_price_cents, date: s.sale_date, condition: s.condition_score })) };
}

/** Everything the listing flow needs for one of the signed-in seller's listings, or null if it isn't theirs. */
export async function loadListingSnapshot(db: Db, userId: string, listingId: string): Promise<ListingSnapshot | null> {
  const { data: listing } = await db.from("equipment_listings").select(LISTING_COLUMNS).eq("id", listingId).eq("seller_id", userId).maybeSingle();
  if (!listing) return null;
  const l = listing as unknown as ListingRecord;

  const [categories, mfr, photos, shipFrom, submission] = await Promise.all([
    getSellCategories(db),
    l.manufacturer_id ? db.from("manufacturers").select("id, name, slug").eq("id", l.manufacturer_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("listing_images").select("id, image_url, storage_path, image_type, display_order, alt_text").eq("listing_id", listingId).order("display_order").order("uploaded_at"),
    db.rpc("get_listing_shipping_origin", { p_listing_id: listingId }),
    db
      .from("product_submissions")
      .select("id, model_name, model_year, status")
      .eq("submitted_by", userId)
      .eq("details->>listing_id", listingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const category = categories.find((c) => c.id === l.category_id);
  if (!category) return null;
  const product = l.product_id ? await getProduct(db, l.product_id, category.fields) : null;
  const priceHint = await getPriceHint(db, l.product_id);

  return {
    listing: l,
    shipFrom: (shipFrom.data as string | null) ?? null,
    photos: (photos.data ?? []).map((p) => ({
      id: p.id,
      url: p.image_url,
      storagePath: p.storage_path,
      imageType: p.image_type,
      order: p.display_order,
      alt: p.alt_text,
    })),
    category,
    manufacturer: (mfr.data as SellManufacturer | null) ?? null,
    product,
    submission: submission.data
      ? { id: submission.data.id, modelName: submission.data.model_name, modelYear: submission.data.model_year, status: submission.data.status }
      : null,
    priceHint,
    attributesValid: attributesSchema(category.fields).safeParse(l.attributes ?? {}).success,
  };
}
