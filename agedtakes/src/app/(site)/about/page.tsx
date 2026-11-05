import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { BRAND, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "About Aged Takes",
  description: "Aged Takes is an evidence-backed public accountability archive of what influential people said, what they did, and how their claims held up.",
  path: "/about",
});

export default function AboutPage() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <div className="wrap max-w-3xl py-12">
      <PageHeader kicker="About" title={BRAND.tagline} />
      <div className="prose-case">
        <p className="!text-2xl !leading-snug !text-ink">
          Aged Takes is a searchable historical record of public claims, predictions and promises — and of how they held up.
        </p>
        <p>
          Influential people make confident public statements every day: price targets, promises never to sell, assurances about their own trading,
          commitments made on behalf of companies. Most are forgotten by the time the outcome is known. We write them down, word for word, with the
          date and the source, and then we check what happened.
        </p>
        <h2>What we ask</h2>
        <ul>
          <li>Did they actually sell?</li>
          <li>Did their prediction come true?</li>
          <li>Did they follow their own advice?</li>
          <li>Did they keep their promise?</li>
          <li>What did they say before the outcome was known?</li>
        </ul>
        <p>We start with markets — crypto personalities, stock commentators, investors and financial influencers — because their claims are often specific and measurable. The archive is built to extend to politicians, executives, athletes and entertainers.</p>

        <h2>Editorial independence</h2>
        <p>Aged Takes is free to read and supported by advertising and, in future, newsletter sponsorships and data licensing. Sponsored material is always labeled. No sponsor, advertiser or subject has any say over who we cover, how evidence is classified, how predictions are scored, or what we conclude.</p>
        <p>Being listed on this site is not an accusation. A profile means we track what someone says publicly. Many of the predictions we record turn out to be right, and we report those too.</p>

        <h2>How we work</h2>
        <p>Every case goes through research, evidence gathering, drafting, a legal checklist, editorial approval and an explicit publishing step. We use AI tools to help with research, but nothing reaches the public without a human editor checking the sources. Read the full <Link href="/methodology">methodology</Link> and our <Link href="/corrections">corrections log</Link>.</p>

        <h2 id="demo">About demonstration content</h2>
        <p>While the archive is being built, the site may include records marked <strong>“Demo only — fictional”</strong>. These people, quotes, sources and numbers are invented to demonstrate how the archive works. Their links point to the reserved example.com domain. They are not investigations and are not indexed by search engines.</p>

        <h2 id="contact">Contact and right of reply</h2>
        <p>
          If you are the subject of a case and want to respond, or you believe we got something wrong, {contact ? <>email <a href={`mailto:${contact}`}>{contact}</a></> : <>use our <Link href="/submit">submission form</Link></>}. We publish responses and corrections promptly.
          To send us a receipt — an original statement and its source — use the <Link href="/submit">submission form</Link>.
        </p>
      </div>
    </div>
  );
}
