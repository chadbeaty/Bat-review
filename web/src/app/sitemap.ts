import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { categories, manufacturers as referenceManufacturers } from "@/data/reference";
import { getAllBats } from "@/lib/bats";
import { getManufacturers } from "@/lib/catalog";
import { getBatsOnlyMode } from "@/lib/launch";

// Static pages, category pages, and the bat database: every bat model page and manufacturer page. Models come from
// the database, or from the built-in catalog (src/data/catalog-fallback.json) when the database isn't connected.
// Listing pages are added with the listings pages.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const batsOnly = await getBatsOnlyMode().catch(() => true);
  const pages = ["/", ...(batsOnly ? [] : ["/shop"]), "/bats", "/sell", "/price-guide", "/compare", "/manufacturers", "/how-it-works", "/buyer-protection", "/seller-guide", "/about", "/faq"];
  const [bats, manufacturers] = await Promise.all([
    getAllBats().catch(() => []),
    getManufacturers().catch(() => referenceManufacturers.filter((m) => m.slug !== "other")),
  ]);
  return [
    ...pages.map((p) => ({ url: `${siteUrl}${p}`, changeFrequency: "daily" as const })),
    ...categories.filter((c) => !batsOnly && c.slug !== "bats").map((c) => ({ url: `${siteUrl}/shop/${c.slug}`, changeFrequency: "daily" as const })),
    ...manufacturers.map((m) => ({ url: `${siteUrl}/manufacturers/${m.slug}`, changeFrequency: "weekly" as const })),
    ...bats.map((b) => ({ url: `${siteUrl}${b.path}`, changeFrequency: "daily" as const })),
  ];
}
