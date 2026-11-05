import type { Metadata } from "next";
import Link from "next/link";
import { LegalNotice } from "@/components/site/LegalNotice";
import { PageHeader } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Terms of use", description: "The terms for using Aged Takes.", path: "/terms" });

export default function TermsPage() {
  return (
    <div className="wrap max-w-3xl py-12">
      <PageHeader kicker="Legal" title="Terms of use" />
      <LegalNotice />
      <div className="prose-case">
        <p><em>Last updated: November 3, 2026.</em> By using Aged Takes you agree to these terms.</p>
        <h2>Not investment advice</h2>
        <p>Aged Takes reports on public statements and documented activity. Nothing on the site is financial, investment, legal or tax advice, and nothing is a recommendation to buy or sell anything.</p>
        <h2>Our content</h2>
        <p>Investigations represent our reporting and, where labeled, our editorial interpretation of the evidence at the time of publication. We follow the standards in our <Link href="/methodology">methodology</Link> and correct errors in our <Link href="/corrections">corrections log</Link>. Quotations and excerpts of third-party material are included for reporting, criticism and commentary, with links to the original sources, which remain the property of their owners.</p>
        <h2>Submissions</h2>
        <p>When you submit material, you confirm it is publicly available and that you have the right to share it, and you give us permission to use it in our reporting. Don&apos;t submit private messages, confidential documents or personal information about private individuals. We may decline any submission.</p>
        <h2>Acceptable use</h2>
        <p>Don&apos;t attempt to disrupt the site, access non-public areas, scrape it at a volume that degrades service, or use it to harass anyone.</p>
        <h2>Disclaimers and liability</h2>
        <p>The site is provided &quot;as is&quot;. To the extent permitted by law, we are not liable for indirect or consequential losses arising from its use.</p>
        <h2>Changes</h2>
        <p>We may update these terms; the date above shows the latest version.</p>
      </div>
    </div>
  );
}
