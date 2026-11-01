import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { categories } from "@/data/reference";

// Static pages for now. Product, manufacturer and listing pages are added with the catalog (Phases 2 and 6).
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", "/shop", "/bats", "/sell", "/price-guide", "/manufacturers", "/how-it-works", "/buyer-protection", "/seller-guide", "/about", "/faq"];
  return [
    ...pages.map((p) => ({ url: `${siteUrl}${p}`, changeFrequency: "daily" as const })),
    ...categories.filter((c) => c.slug !== "bats").map((c) => ({ url: `${siteUrl}/shop/${c.slug}`, changeFrequency: "daily" as const })),
  ];
}
