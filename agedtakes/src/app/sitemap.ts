import type { MetadataRoute } from "next";
import { getSitemapData } from "@/lib/data/public";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 3600;

const STATIC = ["/", "/cases", "/people", "/predictions", "/never-sell", "/methodology", "/corrections", "/about", "/submit"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getSitemapData().catch(() => null);
  return [
    ...STATIC.map((p) => ({ url: absoluteUrl(p), changeFrequency: "daily" as const, priority: p === "/" ? 1 : 0.7 })),
    ...(data?.cases ?? []).map((c) => ({ url: absoluteUrl(`/cases/${c.slug}`), lastModified: c.updated_at, changeFrequency: "weekly" as const, priority: 0.9 })),
    ...(data?.people ?? []).map((p) => ({ url: absoluteUrl(`/people/${p.slug}`), lastModified: p.updated_at, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
