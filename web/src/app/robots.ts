import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { PRIVATE_PREFIXES } from "@/lib/routes";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PREFIXES, "/shop?", "/bats?"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
