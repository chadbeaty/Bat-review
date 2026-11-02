import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { ContentPage, Decide, RelatedLinks, Section } from "@/components/content/Content";
import { getCatalogStats } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "About",
  description: `Why ${brand.name} exists: a marketplace and bat database built only for slow-pitch softball players.`,
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const stats = await getCatalogStats();
  return (
    <ContentPage eyebrow="About" title={`About ${brand.name}`} intro={brand.description}>
      <Section title="Why a slow-pitch marketplace">
        <p>
          Slow-pitch bats are expensive, they come in dozens of near-identical versions, and the details that matter (year, weight, end-load, stamp,
          condition) are easy to get wrong in a general listing site. {brand.name} is built around those details.
        </p>
        <ul>
          <li>
            A catalog of {stats.batModels} bat models from {stats.manufacturers} manufacturers, so every listing points at an exact model.
          </li>
          <li>Required condition scores and damage answers on every listing.</li>
          <li>Payment through Stripe and prepaid tracked shipping, instead of meetups and payment apps.</li>
          <li>Prices from completed sales on the site, not guesses.</li>
        </ul>
      </Section>

      <Section title="Who runs it">
        <p>
          {brand.name} is operated by {brand.legalEntity}. <Decide>Add the business&apos;s registered address and a sentence about the team before launch.</Decide>
        </p>
        <p>
          Manufacturer names and models are used only to identify products. {brand.name} isn&apos;t affiliated with or endorsed by any manufacturer or
          association.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Email <a href={`mailto:${brand.email.supportAddress}`}>{brand.email.supportAddress}</a> or use the <a href="/contact">contact page</a>.
        </p>
      </Section>

      <RelatedLinks
        links={[
          { href: "/how-it-works", label: "How it works" },
          { href: "/faq", label: "FAQ" },
        ]}
      />
    </ContentPage>
  );
}
