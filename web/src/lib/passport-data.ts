import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { normalizeThresholds, type SaleRecord } from "@/lib/price-stats";
import { buildPassport, type PassportInput } from "@/lib/passport";
import type { ListingDetail } from "@/lib/listings";

/** Reads the public data behind a bat listing's passport (all as the visitor, so RLS applies). Null when not a catalog bat. */
export async function getPassport(listing: ListingDetail) {
  const productId = listing.product?.id;
  if (!productId || listing.category?.slug !== "bats") return null;
  const supabase = await createClient();
  if (!supabase) return null;

  const [product, sales, durability, reports, minSales, minOwners] = await Promise.all([
    supabase.from("products").select("certification_association, certification_status, certification_source, certification_verified_at").eq("id", productId).maybeSingle(),
    supabase.from("price_history").select("sold_price_cents, sale_date, weight_oz, condition_score, verified_transaction").eq("product_id", productId).eq("verified_transaction", true).limit(2000),
    supabase.from("owner_report_durability").select("reporting_owners, owners_reporting_failure, owners_cracked, median_hits_intact").eq("product_id", productId).maybeSingle(),
    supabase.from("owner_reports").select("id", { count: "exact", head: true }).eq("product_id", productId).eq("status", "published"),
    getSetting<number>("price_guide_min_sales", 5),
    getSetting<number>("durability_min_owners", 3),
  ]);
  if (!product.data) return null;
  const p = product.data;
  const t = normalizeThresholds(minSales, null);
  const saleRecords: SaleRecord[] = (sales.data ?? []).map((s) => ({
    priceCents: s.sold_price_cents,
    saleDate: s.sale_date,
    weightOz: s.weight_oz == null ? null : Number(s.weight_oz),
    conditionScore: s.condition_score,
    verified: s.verified_transaction === true,
  }));
  const d = durability.data;
  const input: PassportInput = {
    stamp: {
      associations: p.certification_association ?? [],
      status: p.certification_status,
      verifiedAt: p.certification_verified_at,
      source: p.certification_source,
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
    publishedReports: reports.count ?? 0,
    minOwners: Number(minOwners) || 3,
    listing: {
      conditionScore: listing.conditionScore,
      conditionLabel: listing.conditionLabel,
      structuralDisclosure: listing.structuralDisclosure,
      damageAnswers: Object.values(listing.damage),
      photoCount: listing.images.length,
    },
  };
  return buildPassport(input);
}
