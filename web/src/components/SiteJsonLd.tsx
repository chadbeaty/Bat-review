import { brand } from "@/config/brand";
import { siteUrl } from "@/lib/env";

/** Organization and WebSite structured data (with a site search action) for the homepage. */
export function SiteJsonLd() {
  const base = siteUrl.replace(/\/$/, "");
  const sameAs = Object.values(brand.social).filter(Boolean);
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: brand.name,
      url: base,
      logo: `${base}/favicon.ico`,
      email: brand.email.supportAddress,
      ...(sameAs.length ? { sameAs } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: brand.name,
      url: base,
      description: brand.description,
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${base}/shop?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ];
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
