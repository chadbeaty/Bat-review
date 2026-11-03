import type { Metadata } from "next";
import { siteUrl } from "@/lib/env";

export const BRAND = {
  name: "Aged Takes",
  wordmark: "AGED TAKES",
  tagline: "The internet has a long memory.",
  secondary: "Some predictions age better than others.",
  description:
    "Some predictions age better than others. We track what influential people said, what they did, and how their claims held up — with the original sources.",
  newsletter: "The Weekly Aged Takes",
  newsletterTagline: "The claims worth remembering. The receipts worth reading.",
} as const;

export function absoluteUrl(path = "/"): string {
  return new URL(path, siteUrl).toString();
}

/** Page metadata with canonical URL, Open Graph and X/Twitter cards. */
export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article" | "profile";
  publishedTime?: string;
  modifiedTime?: string;
  noindex?: boolean;
  image?: string;
}): Metadata {
  const url = absoluteUrl(opts.path);
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    robots: opts.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      siteName: BRAND.name,
      type: opts.type ?? "website",
      locale: "en_US",
      ...(opts.image ? { images: [{ url: opts.image, width: 1200, height: 630 }] } : {}),
      ...(opts.type === "article" ? { publishedTime: opts.publishedTime, modifiedTime: opts.modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      ...(opts.image ? { images: [opts.image] } : {}),
    },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    name: BRAND.name,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon.svg"),
    slogan: BRAND.tagline,
    publishingPrinciples: absoluteUrl("/methodology"),
    correctionsPolicy: absoluteUrl("/corrections"),
    ethicsPolicy: absoluteUrl("/about"),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: absoluteUrl(item.path) })),
  };
}

export function articleJsonLd(opts: { title: string; description: string; path: string; publishedAt: string; modifiedAt: string; personName: string; personPath: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: opts.title.slice(0, 110),
    description: opts.description,
    mainEntityOfPage: absoluteUrl(opts.path),
    url: absoluteUrl(opts.path),
    datePublished: opts.publishedAt,
    dateModified: opts.modifiedAt,
    image: [absoluteUrl(`/api/og/${opts.path.split("/").pop()}`)],
    author: { "@type": "Organization", name: BRAND.name, url: absoluteUrl("/") },
    publisher: { "@type": "Organization", name: BRAND.name, logo: { "@type": "ImageObject", url: absoluteUrl("/icon.svg") } },
    about: { "@type": "Person", name: opts.personName, url: absoluteUrl(opts.personPath) },
  };
}

export function personJsonLd(opts: { name: string; path: string; jobTitle?: string | null; organization?: string | null; sameAs?: string | null }) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: opts.name,
      url: absoluteUrl(opts.path),
      ...(opts.jobTitle ? { jobTitle: opts.jobTitle } : {}),
      ...(opts.organization ? { worksFor: { "@type": "Organization", name: opts.organization } } : {}),
      ...(opts.sameAs ? { sameAs: [opts.sameAs] } : {}),
    },
  };
}
