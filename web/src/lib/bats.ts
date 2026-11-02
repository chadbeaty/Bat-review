import "server-only";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import fallbackCatalog from "@/data/catalog-fallback.json";
import { batModelPath, modelSegment, productSlugPattern } from "@/lib/paths";
import type { ListingCard } from "@/lib/catalog";
import { isSimilar, type Maturity } from "@/lib/bat-display";
import type { AskingListing, SaleRecord } from "@/lib/price-stats";
import type { OwnerReport } from "@/lib/owner-reports";

// Bat database queries: model pages, price guide, comparison and manufacturer pages. Everything reads through
// the visitor's RLS-scoped client. Without a database, the researched catalog in catalog-fallback.json is used
// for model facts and every market or community section is empty (never invented).

type Db = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type BatSummary = {
  id: string;
  slug: string;
  path: string;
  productName: string;
  modelName: string;
  modelYear: number | null;
  manufacturerSlug: string;
  manufacturerName: string;
  productLineId: string | null;
  productLineName: string | null;
  stamps: string[];
  weights: number[];
  weightingType: string;
  endloadOz: number | null;
  constructionType: string;
  material: string;
  barrelLengthInches: number | null;
  barrelDiameterInches: number | null;
  lengthInches: number | null;
  warrantySummary: string | null;
};

export type SpecRow = {
  weightOz: number | null;
  verified: boolean;
  verificationSource: string | null;
  partNumber: string | null;
};

export type LineageNote = {
  predecessor_name: string | null;
  predecessor_in_catalog: boolean;
  changes: string[];
  confidence: "high" | "medium" | "low";
  basis: string;
  sources: string[];
  researched_on?: string;
};

export type LineageLink = {
  direction: "predecessor" | "successor" | "sibling";
  relation: "predecessor" | "same_platform" | "variant";
  confidence: "high" | "medium" | "low";
  basis: string;
  sourceUrl: string | null;
  verified: boolean;
  other: BatSummary;
};

export type PublishedReview = {
  id: string;
  kind: string;
  title: string;
  url: string;
  source: string;
  ratingText: string | null;
  publishedOn: string | null;
  summary: string | null;
};

export type PublicOwnerReport = {
  id: string;
  createdAt: string;
  ownershipVerified: boolean;
  weightOz: number | null;
  hitsSoFar: number | null;
  stillBreakingIn: boolean | null;
  temperatureF: number | null;
  ballType: string;
  popVsPreviousGamer: string;
  previousGamer: string | null;
  sting: number | null;
  sound: string | null;
  durabilityStatus: string;
  notes: string | null;
};

export type Durability = {
  reportingOwners: number;
  verifiedOwners: number;
  intact: number;
  dented: number;
  cracked: number;
  rattle: number;
  returnedWarranty: number;
  ownersReportingFailure: number;
  medianHitsIntact: number | null;
  medianHitsAtFailure: number | null;
  hitsAtFailure: number[];
};

export type MarketSummary = {
  activeListings: number;
  askingMinCents: number | null;
  askingMaxCents: number | null;
  askingAvgCents: number | null;
  verifiedSales: number;
  firstSaleDate: string | null;
  lastSaleDate: string | null;
};

export type BatSettings = {
  minSales: unknown;
  fullSales: unknown;
  windowDays: number;
  earlyThreshold: number;
  durabilityMinOwners: number;
  intervalDays: number;
};

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

type ProductRow = {
  id: string;
  slug: string;
  product_name: string;
  model_name: string;
  model_year: number | null;
  certification_association: string[] | null;
  product_line_id: string | null;
  manufacturers: { slug: string; name: string; warranty_summary: string | null } | null;
  product_lines: { name: string } | null;
  bat_specifications: {
    weight_oz: number | string | null;
    weighting_type: string;
    endload_oz: number | string | null;
    construction_type: string;
    construction_material: string;
    barrel_length_inches: number | string | null;
    barrel_diameter_inches: number | string | null;
    length_inches: number | string | null;
  }[];
};

const SUMMARY_SELECT =
  "id, slug, product_name, model_name, model_year, certification_association, product_line_id, manufacturers(slug, name, warranty_summary), product_lines(name), bat_specifications(weight_oz, weighting_type, endload_oz, construction_type, construction_material, barrel_length_inches, barrel_diameter_inches, length_inches), product_categories!inner(slug)";

function toSummary(p: ProductRow): BatSummary {
  const specs = p.bat_specifications ?? [];
  const first = specs[0];
  const manufacturerSlug = p.manufacturers?.slug ?? "other";
  return {
    id: p.id,
    slug: p.slug,
    path: batModelPath({ manufacturerSlug, productSlug: p.slug, modelYear: p.model_year }),
    productName: p.product_name,
    modelName: p.model_name,
    modelYear: p.model_year,
    manufacturerSlug,
    manufacturerName: p.manufacturers?.name ?? "Unknown manufacturer",
    productLineId: p.product_line_id,
    productLineName: p.product_lines?.name ?? null,
    stamps: p.certification_association ?? [],
    weights: specs
      .map((s) => num(s.weight_oz))
      .filter((w): w is number => w != null)
      .sort((a, b) => a - b),
    weightingType: first?.weighting_type ?? "unknown",
    endloadOz: num(first?.endload_oz),
    constructionType: first?.construction_type ?? "unknown",
    material: first?.construction_material ?? "unknown",
    barrelLengthInches: num(first?.barrel_length_inches),
    barrelDiameterInches: num(first?.barrel_diameter_inches),
    lengthInches: num(first?.length_inches),
    warrantySummary: p.manufacturers?.warranty_summary ?? null,
  };
}

function fallbackSummaries(): BatSummary[] {
  return fallbackCatalog.bats.map((b) => ({
    id: b.slug,
    slug: b.slug,
    path: batModelPath({ manufacturerSlug: b.manufacturerSlug, productSlug: b.slug, modelYear: b.modelYear }),
    productName: `${b.modelYear} ${b.name}`,
    modelName: b.name.replace(`${b.manufacturer} `, ""),
    modelYear: b.modelYear,
    manufacturerSlug: b.manufacturerSlug,
    manufacturerName: b.manufacturer,
    productLineId: null,
    productLineName: b.productLine,
    stamps: b.certifications,
    weights: [],
    weightingType: b.weightingType,
    endloadOz: null,
    constructionType: b.constructionType,
    material: b.material,
    barrelLengthInches: b.barrelLengthInches,
    barrelDiameterInches: null,
    lengthInches: null,
    warrantySummary: null,
  }));
}

const byYearThenName = (a: BatSummary, b: BatSummary) =>
  (b.modelYear ?? 0) - (a.modelYear ?? 0) || a.manufacturerName.localeCompare(b.manufacturerName) || a.modelName.localeCompare(b.modelName);

/** Every published bat model, newest year first. */
export async function getAllBats(): Promise<BatSummary[]> {
  const supabase = await createClient();
  if (supabase) {
    const { data, error } = await supabase.from("products").select(SUMMARY_SELECT).eq("product_categories.slug", "bats").limit(2000);
    if (!error && data) return (data as unknown as ProductRow[]).map(toSummary).sort(byYearThenName);
  }
  return fallbackSummaries().sort(byYearThenName);
}

/** Resolves /bats/<manufacturer>/<model>/<year> to one product, or null. */
export async function findBatByPath(manufacturerSlug: string, model: string, year: string): Promise<BatSummary | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(manufacturerSlug) || !/^[a-z0-9-]{1,120}$/.test(model) || !/^\d{4}$/.test(year)) return null;
  const y = Number(year);
  const matches = (b: { slug: string; manufacturerSlug: string; modelYear: number | null }) =>
    b.manufacturerSlug === manufacturerSlug && b.modelYear === y && modelSegment(b.slug, b.modelYear) === model;
  const supabase = await createClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("products")
      .select(SUMMARY_SELECT)
      .eq("product_categories.slug", "bats")
      .eq("model_year", y)
      // Slugs normally end in the year; a few (e.g. "…-dual") don't, so also match the bare model segment.
      .or(`slug.like.${productSlugPattern(model, year)},slug.like.%-${model}`)
      .limit(20);
    if (error || !data) return null;
    return (data as unknown as ProductRow[]).map(toSummary).find(matches) ?? null;
  }
  return fallbackSummaries().find(matches) ?? null;
}

export async function getBatSettings(): Promise<BatSettings> {
  const defaults = { price_guide_min_sales: 5, price_guide_full_sales: 10, new_release_window_days: 120, early_report_threshold: 5, durability_min_owners: 3, owner_report_interval_days: 7 };
  const values: Record<string, unknown> = { ...defaults };
  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase.from("site_settings").select("key, value").in("key", Object.keys(defaults));
    for (const row of data ?? []) values[row.key] = row.value;
  }
  const int = (k: keyof typeof defaults) => {
    const n = Number(values[k]);
    return Number.isFinite(n) && n > 0 ? n : defaults[k];
  };
  return {
    minSales: values.price_guide_min_sales,
    fullSales: values.price_guide_full_sales,
    windowDays: int("new_release_window_days"),
    earlyThreshold: int("early_report_threshold"),
    durabilityMinOwners: int("durability_min_owners"),
    intervalDays: int("owner_report_interval_days"),
  };
}

/** Market summary per product id (active-listing counts and asking range, verified sale counts). */
export async function getMarketSummaries(): Promise<Map<string, MarketSummary>> {
  const map = new Map<string, MarketSummary>();
  const supabase = await createClient();
  if (!supabase) return map;
  const { data } = await supabase.from("product_market_summary").select("*").limit(5000);
  for (const r of data ?? []) {
    map.set(r.product_id, {
      activeListings: r.active_listings,
      askingMinCents: r.asking_min_cents,
      askingMaxCents: r.asking_max_cents,
      askingAvgCents: r.asking_avg_cents,
      verifiedSales: r.verified_sales,
      firstSaleDate: r.first_sale_date,
      lastSaleDate: r.last_sale_date,
    });
  }
  return map;
}

export async function getMaturityMap(): Promise<Map<string, { maturity: Maturity; releaseDate: string | null; releaseStatus: string | null; reportingOwners: number; verifiedOwners: number; daysSinceRelease: number | null }>> {
  const map = new Map();
  const supabase = await createClient();
  if (!supabase) return map;
  const { data } = await supabase.from("product_review_maturity").select("*").limit(5000);
  for (const r of data ?? []) {
    map.set(r.product_id, {
      maturity: r.maturity,
      releaseDate: r.release_date,
      releaseStatus: r.release_status,
      reportingOwners: r.reporting_owners,
      verifiedOwners: r.verified_owners,
      daysSinceRelease: r.days_since_release,
    });
  }
  return map;
}

/** Ids of products that have at least one published review, directly or through their line. */
async function reviewedProductIds(supabase: Db, bats: BatSummary[]): Promise<Set<string>> {
  const [direct, lines] = await Promise.all([
    supabase.from("published_review_products").select("product_id").limit(5000),
    supabase.from("published_review_lines").select("product_line_id").limit(5000),
  ]);
  const ids = new Set<string>((direct.data ?? []).map((r) => r.product_id));
  const lineIds = new Set<string>((lines.data ?? []).map((r) => r.product_line_id));
  for (const b of bats) if (b.productLineId && lineIds.has(b.productLineId)) ids.add(b.id);
  return ids;
}

function toReview(r: Record<string, unknown>): PublishedReview {
  return {
    id: String(r.id),
    kind: String(r.kind),
    title: String(r.title),
    url: String(r.url),
    source: String(r.source),
    ratingText: (r.rating_text as string | null) ?? null,
    publishedOn: (r.published_on as string | null) ?? null,
    summary: (r.summary as string | null) ?? null,
  };
}

const REVIEW_COLUMNS = "id, kind, title, url, source, rating_text, published_on, summary";
const reviewOrder = (a: PublishedReview, b: PublishedReview) => {
  const rank: Record<string, number> = { expert: 0, site: 1, retailer: 2, customer: 3, video: 4 };
  return (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || (b.publishedOn ?? "").localeCompare(a.publishedOn ?? "") || a.title.localeCompare(b.title);
};

async function reviewsForProduct(supabase: Db, productId: string): Promise<PublishedReview[]> {
  const { data } = await supabase
    .from("published_reviews")
    .select(`${REVIEW_COLUMNS}, published_review_products!inner(product_id)`)
    .eq("published_review_products.product_id", productId);
  return (data ?? []).map(toReview).sort(reviewOrder);
}

async function reviewsForLine(supabase: Db, lineId: string): Promise<PublishedReview[]> {
  const { data } = await supabase
    .from("published_reviews")
    .select(`${REVIEW_COLUMNS}, published_review_lines!inner(product_line_id)`)
    .eq("published_review_lines.product_line_id", lineId);
  return (data ?? []).map(toReview).sort(reviewOrder);
}

export type BatDetail = {
  bat: BatSummary;
  officialUrl: string | null;
  certificationStatus: string;
  certificationSource: string | null;
  dataSource: string | null;
  listedPrice: { usd: number; typical: boolean } | null;
  specRows: SpecRow[];
  manufacturer: { warrantySummary: string | null; warrantySource: string | null; warrantySourceUrl: string | null; websiteUrl: string | null };
  release: { date: string | null; status: string | null; source: string | null };
  maturity: { maturity: Maturity; reportingOwners: number; verifiedOwners: number; daysSinceRelease: number | null } | null;
  lineageNote: LineageNote | null;
  lineage: LineageLink[];
  reviews: PublishedReview[];
  lineReviews: PublishedReview[];
  predecessorReviews: { predecessor: BatSummary; reviews: PublishedReview[] }[];
  ownerReports: OwnerReport[];
  latestReports: PublicOwnerReport[];
  durability: Durability | null;
  listings: (ListingCard & AskingListing)[];
  sales: SaleRecord[];
  related: BatSummary[];
  alternatives: BatSummary[];
  viewer: {
    signedIn: boolean;
    alerts: string[];
    watch: { targetPriceCents: number | null } | null;
    lastReportAt: string | null;
    /** When the viewer's next check-in opens, if it hasn't yet (the database enforces the interval). */
    nextReportAt: string | null;
  };
};

/** Everything the model page shows beyond the summary. Sections are empty when there is no data. */
export async function getBatDetail(bat: BatSummary, intervalDays = 7): Promise<BatDetail> {
  const empty: BatDetail = {
    bat,
    officialUrl: null,
    certificationStatus: "unverified",
    certificationSource: null,
    dataSource: null,
    listedPrice: null,
    specRows: [],
    manufacturer: { warrantySummary: bat.warrantySummary, warrantySource: null, warrantySourceUrl: null, websiteUrl: null },
    release: { date: null, status: null, source: null },
    maturity: null,
    lineageNote: null,
    lineage: [],
    reviews: [],
    lineReviews: [],
    predecessorReviews: [],
    ownerReports: [],
    latestReports: [],
    durability: null,
    listings: [],
    sales: [],
    related: [],
    alternatives: [],
    viewer: { signedIn: false, alerts: [], watch: null, lastReportAt: null, nextReportAt: null },
  };
  const supabase = await createClient();
  if (!supabase) {
    const all = fallbackSummaries();
    return { ...empty, related: all.filter((b) => b.slug !== bat.slug && b.productLineName && b.productLineName === bat.productLineName && b.manufacturerSlug === bat.manufacturerSlug) };
  }

  const [product, specs, lineageRows, reviews, lineReviews, maturity, reports, durability, listings, sales, allBats, user] = await Promise.all([
    supabase
      .from("products")
      .select("official_product_url, certification_status, certification_source, data_source, product_specifications, release_date, release_status, release_date_source, lineage_note, manufacturers(warranty_summary, warranty_source, warranty_source_url, website_url)")
      .eq("id", bat.id)
      .single(),
    supabase.from("bat_specifications").select("weight_oz, verified, verification_source, manufacturer_part_number").eq("product_id", bat.id).order("weight_oz"),
    supabase
      .from("product_lineage")
      .select("product_id, related_product_id, relation, confidence, basis, source_url, verified")
      .or(`product_id.eq.${bat.id},related_product_id.eq.${bat.id}`),
    reviewsForProduct(supabase, bat.id),
    bat.productLineId ? reviewsForLine(supabase, bat.productLineId) : Promise.resolve([]),
    supabase.from("product_review_maturity").select("*").eq("product_id", bat.id).maybeSingle(),
    supabase
      .from("owner_reports")
      .select("id, user_id, created_at, ownership_verified, weight_oz, hits_so_far, still_breaking_in, typical_temperature_f, ball_type, pop_vs_previous_gamer, previous_gamer_product_id, previous_gamer_text, sting, sound, durability_status, notes")
      .eq("product_id", bat.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("owner_report_durability").select("*").eq("product_id", bat.id).maybeSingle(),
    supabase
      .from("equipment_listings")
      .select("id, title, asking_price_cents, condition_score, location_city, location_state, published_at, attributes, listing_images(image_url, alt_text, display_order)")
      .eq("product_id", bat.id)
      .eq("listing_status", "active")
      .order("published_at", { ascending: false })
      .limit(200),
    supabase
      .from("price_history")
      .select("product_id, sold_price_cents, sale_date, weight_oz, condition_score, verified_transaction")
      .eq("product_id", bat.id)
      .eq("verified_transaction", true)
      .order("sale_date")
      .limit(2000),
    getAllBats(),
    getCurrentUser(),
  ]);

  const p = product.data as Record<string, unknown> | null;
  const mfr = (p?.manufacturers ?? null) as Record<string, string | null> | null;
  const ps = (p?.product_specifications ?? {}) as Record<string, unknown>;
  const byId = new Map(allBats.map((b) => [b.id, b]));

  const lineage: LineageLink[] = [];
  for (const r of lineageRows.data ?? []) {
    const outgoing = r.product_id === bat.id;
    const other = byId.get(outgoing ? r.related_product_id : r.product_id);
    if (!other) continue;
    const direction = r.relation === "predecessor" ? (outgoing ? "predecessor" : "successor") : "sibling";
    lineage.push({ direction, relation: r.relation, confidence: r.confidence, basis: r.basis, sourceUrl: r.source_url, verified: r.verified, other });
  }

  const predecessors = lineage.filter((l) => l.direction === "predecessor").map((l) => l.other);
  const predecessorReviews = (
    await Promise.all(predecessors.map(async (pred) => ({ predecessor: pred, reviews: await reviewsForProduct(supabase, pred.id) })))
  ).filter((x) => x.reviews.length);

  const directIds = new Set(reviews.map((r) => r.id));
  const reportRows = reports.data ?? [];

  const reviewed = await reviewedProductIds(supabase, allBats);
  const related = allBats.filter((b) => b.id !== bat.id && bat.productLineId && b.productLineId === bat.productLineId);
  const relatedIds = new Set(related.map((b) => b.id));
  const alternatives = allBats.filter((b) => !relatedIds.has(b.id) && reviewed.has(b.id) && isSimilar(bat, b)).slice(0, 6);

  let viewer: BatDetail["viewer"] = empty.viewer;
  if (user) {
    const [alerts, watch, mine] = await Promise.all([
      supabase.from("review_alerts").select("notify_on").eq("product_id", bat.id).eq("user_id", user.id),
      supabase.from("product_watchlist").select("target_price_cents").eq("product_id", bat.id).eq("user_id", user.id).maybeSingle(),
      supabase.from("owner_reports").select("created_at").eq("product_id", bat.id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
    ]);
    viewer = {
      signedIn: true,
      alerts: (alerts.data ?? []).map((a) => a.notify_on),
      watch: watch.data ? { targetPriceCents: watch.data.target_price_cents } : null,
      lastReportAt: mine.data?.[0]?.created_at ?? null,
      nextReportAt: null,
    };
    if (viewer.lastReportAt) {
      const next = Date.parse(viewer.lastReportAt) + intervalDays * 864e5;
      if (next > Date.now()) viewer.nextReportAt = new Date(next).toISOString();
    }
  }

  const d = durability.data;
  const m = maturity.data;
  return {
    bat,
    officialUrl: (p?.official_product_url as string | null) ?? null,
    certificationStatus: (p?.certification_status as string) ?? "unverified",
    certificationSource: (p?.certification_source as string | null) ?? null,
    dataSource: (p?.data_source as string | null) ?? null,
    listedPrice: typeof ps.listed_price_usd === "number" ? { usd: ps.listed_price_usd, typical: Boolean(ps.listed_price_is_typical) } : null,
    specRows: (specs.data ?? []).map((s) => ({
      weightOz: num(s.weight_oz),
      verified: s.verified,
      verificationSource: s.verification_source,
      partNumber: s.manufacturer_part_number,
    })),
    manufacturer: {
      warrantySummary: mfr?.warranty_summary ?? null,
      warrantySource: mfr?.warranty_source ?? null,
      warrantySourceUrl: mfr?.warranty_source_url ?? null,
      websiteUrl: mfr?.website_url ?? null,
    },
    release: { date: (p?.release_date as string | null) ?? null, status: (p?.release_status as string | null) ?? null, source: (p?.release_date_source as string | null) ?? null },
    maturity: m ? { maturity: m.maturity, reportingOwners: m.reporting_owners, verifiedOwners: m.verified_owners, daysSinceRelease: m.days_since_release } : null,
    lineageNote: (p?.lineage_note as LineageNote | null) ?? null,
    lineage,
    reviews,
    lineReviews: lineReviews.filter((r) => !directIds.has(r.id)),
    predecessorReviews,
    ownerReports: reportRows.map((r) => ({
      userId: r.user_id,
      createdAt: r.created_at,
      ownershipVerified: r.ownership_verified,
      popVsPreviousGamer: r.pop_vs_previous_gamer,
      sting: r.sting,
      ballType: r.ball_type,
      temperatureF: r.typical_temperature_f,
      durabilityStatus: r.durability_status,
    })),
    // No user ids leave the server: the public list carries only the report itself.
    latestReports: reportRows.slice(0, 10).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      ownershipVerified: r.ownership_verified,
      weightOz: num(r.weight_oz),
      hitsSoFar: r.hits_so_far,
      stillBreakingIn: r.still_breaking_in,
      temperatureF: r.typical_temperature_f,
      ballType: r.ball_type,
      popVsPreviousGamer: r.pop_vs_previous_gamer,
      previousGamer: r.previous_gamer_text ?? (r.previous_gamer_product_id ? (byId.get(r.previous_gamer_product_id)?.productName ?? null) : null),
      sting: r.sting,
      sound: r.sound,
      durabilityStatus: r.durability_status,
      notes: r.notes,
    })),
    durability: d
      ? {
          reportingOwners: d.reporting_owners,
          verifiedOwners: d.verified_owners,
          intact: d.owners_intact,
          dented: d.owners_dented,
          cracked: d.owners_cracked,
          rattle: d.owners_rattle,
          returnedWarranty: d.owners_returned_warranty,
          ownersReportingFailure: d.owners_reporting_failure,
          medianHitsIntact: num(d.median_hits_intact),
          medianHitsAtFailure: num(d.median_hits_at_failure),
          hitsAtFailure: (d.hits_at_failure ?? []).map(Number),
        }
      : null,
    listings: (listings.data ?? []).map((l) => {
      const images = ((l.listing_images as { image_url: string; alt_text: string | null; display_order: number }[]) ?? []).sort((a, b) => a.display_order - b.display_order);
      const attrs = (l.attributes ?? {}) as Record<string, unknown>;
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
        productId: bat.id,
        priceCents: l.asking_price_cents,
        weightOz: num(attrs.weight_oz),
      };
    }),
    sales: (sales.data ?? []).map((s) => ({
      productId: s.product_id,
      priceCents: s.sold_price_cents,
      saleDate: s.sale_date,
      weightOz: num(s.weight_oz),
      conditionScore: s.condition_score,
      verified: s.verified_transaction === true,
    })),
    related: related.sort(byYearThenName),
    alternatives,
    viewer,
  };
}

export type ManufacturerDetail = {
  slug: string;
  name: string;
  websiteUrl: string | null;
  warrantySummary: string | null;
  warrantySource: string | null;
  bats: BatSummary[];
  lines: { id: string | null; name: string; notes: string[] }[];
};

export async function getManufacturerDetail(slug: string): Promise<ManufacturerDetail | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || slug === "other") return null;
  const all = await getAllBats();
  const bats = all.filter((b) => b.manufacturerSlug === slug);
  const supabase = await createClient();
  if (supabase) {
    const [{ data: m }, { data: lines }] = await Promise.all([
      supabase.from("manufacturers").select("id, slug, name, website_url, warranty_summary, warranty_source").eq("slug", slug).eq("active", true).maybeSingle(),
      supabase.from("product_lines").select("id, name, notes, manufacturers!inner(slug)").eq("manufacturers.slug", slug).order("name"),
    ]);
    if (!m) return null;
    return {
      slug: m.slug,
      name: m.name,
      websiteUrl: m.website_url,
      warrantySummary: m.warranty_summary,
      warrantySource: m.warranty_source,
      bats,
      lines: (lines ?? []).map((l) => ({ id: l.id, name: l.name, notes: l.notes ?? [] })),
    };
  }
  const { manufacturers } = await import("@/data/reference");
  const ref = manufacturers.find((x) => x.slug === slug);
  if (!ref) return null;
  return { slug, name: ref.name, websiteUrl: null, warrantySummary: null, warrantySource: null, bats, lines: [] };
}
