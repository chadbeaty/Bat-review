import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { batSpecFrom } from "@/lib/bat-drawing";
import { buildPassport } from "@/lib/passport";
import { normalizeThresholds, type SaleRecord } from "@/lib/price-stats";
import type { CardExtra, ListingCard } from "@/lib/catalog";

type Row = {
  id: string;
  attributes: Record<string, unknown> | null;
  product_id: string | null;
  condition_score: number | null;
  structural_disclosure: "no_known_damage" | "damage_disclosed" | "unknown";
  has_cracks: boolean | null;
  has_rattle: boolean | null;
  has_loose_end_cap: boolean | null;
  has_repairs: boolean | null;
  has_alterations: boolean | null;
  has_significant_damage: boolean | null;
  manufacturers: { name: string } | null;
  product_categories: { slug: string } | null;
  listing_images: { id: string }[] | null;
};

const asNumber = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Adds the facts a card needs to draw and describe a bat (real length, barrel, build, stamps, passport progress) with
 * a few batched reads. Never throws: when anything fails the cards simply come back without extras.
 */
export async function withCardExtras<T extends ListingCard>(cards: T[]): Promise<T[]> {
  if (!cards.length) return cards;
  try {
    const supabase = await createClient();
    if (!supabase) return cards;
    const ids = cards.map((c) => c.id);
    const { data, error } = await supabase
      .from("equipment_listings")
      .select(
        "id, attributes, product_id, condition_score, structural_disclosure, has_cracks, has_rattle, has_loose_end_cap, has_repairs, has_alterations, has_significant_damage, manufacturers(name), product_categories(slug), listing_images(id)"
      )
      .in("id", ids);
    if (error || !data) return cards;
    const rows = new Map((data as unknown as Row[]).map((r) => [r.id, r]));

    const productIds = [...new Set([...rows.values()].filter((r) => r.product_categories?.slug === "bats" && r.product_id).map((r) => r.product_id!))];
    const [products, sales, durability, reports, minSales, minOwners] = productIds.length
      ? await Promise.all([
          supabase.from("products").select("id, certification_association, certification_status, certification_source, certification_verified_at").in("id", productIds),
          supabase.from("price_history").select("product_id, sold_price_cents, sale_date, weight_oz, condition_score, verified_transaction").in("product_id", productIds).eq("verified_transaction", true).limit(5000),
          supabase.from("owner_report_durability").select("product_id, reporting_owners, owners_reporting_failure, owners_cracked, median_hits_intact").in("product_id", productIds),
          supabase.from("owner_reports").select("product_id").in("product_id", productIds).eq("status", "published").limit(5000),
          getSetting<number>("price_guide_min_sales", 5),
          getSetting<number>("durability_min_owners", 3),
        ])
      : [null, null, null, null, 5, 3];
    const productById = new Map((products?.data ?? []).map((p) => [p.id, p]));
    const durabilityById = new Map((durability?.data ?? []).map((d) => [d.product_id, d]));
    const t = normalizeThresholds(minSales, null);

    return cards.map((card) => {
      const r = rows.get(card.id);
      if (!r) return card;
      const attrs = r.attributes ?? {};
      const isBat = r.product_categories?.slug === "bats";
      const product = r.product_id ? productById.get(r.product_id) : undefined;
      const listedStamps = Array.isArray(attrs.certification) ? attrs.certification.map(String) : [];
      const stamps = listedStamps.length ? listedStamps : (product?.certification_association ?? []);
      let passportFilled: number | null = null;
      if (isBat && r.product_id && product) {
        const saleRecords: SaleRecord[] = (sales?.data ?? [])
          .filter((s) => s.product_id === r.product_id)
          .map((s) => ({
            priceCents: s.sold_price_cents,
            saleDate: s.sale_date,
            weightOz: s.weight_oz == null ? null : Number(s.weight_oz),
            conditionScore: s.condition_score,
            verified: s.verified_transaction === true,
          }));
        const d = durabilityById.get(r.product_id);
        passportFilled = buildPassport({
          stamp: {
            associations: product.certification_association ?? [],
            status: product.certification_status,
            verifiedAt: product.certification_verified_at,
            source: product.certification_source,
          },
          sales: saleRecords,
          thresholds: { minSales: t.minSales },
          durability: d
            ? {
                reportingOwners: Number(d.reporting_owners),
                ownersReportingFailure: Number(d.owners_reporting_failure),
                ownersCracked: Number(d.owners_cracked),
                medianHitsIntact: d.median_hits_intact == null ? null : Number(d.median_hits_intact),
              }
            : null,
          publishedReports: (reports?.data ?? []).filter((x) => x.product_id === r.product_id).length,
          minOwners: Number(minOwners) || 3,
          listing: {
            conditionScore: r.condition_score,
            conditionLabel: null,
            structuralDisclosure: r.structural_disclosure,
            damageAnswers: [r.has_cracks, r.has_rattle, r.has_loose_end_cap, r.has_repairs, r.has_alterations, r.has_significant_damage],
            photoCount: r.listing_images?.length ?? 0,
          },
        }).filledCount;
      }
      const extra: CardExtra = {
        categorySlug: r.product_categories?.slug ?? null,
        brand: r.manufacturers?.name ?? null,
        bat: isBat ? batSpecFrom(attrs, r.manufacturers?.name) : null,
        stamps,
        weightOz: asNumber(attrs.weight_oz),
        approxHits: asNumber(attrs.approx_hits),
        passportFilled,
      };
      return { ...card, extra };
    });
  } catch (err) {
    console.error("withCardExtras failed", err);
    return cards;
  }
}
