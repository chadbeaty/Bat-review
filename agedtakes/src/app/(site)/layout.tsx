import { Analytics } from "@vercel/analytics/next";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { JsonLd } from "@/components/ui";
import { organizationJsonLd } from "@/lib/seo";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <JsonLd data={organizationJsonLd()} />
      {/* Vercel Web Analytics: page views only, no cookies, no personal data. Turn on under Vercel → Analytics. */}
      <Analytics />
    </>
  );
}
