import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { ContentPage, Decide, RelatedLinks, Section } from "@/components/content/Content";

export const metadata: Metadata = {
  title: "Buyer protection",
  description: `What happens on ${brand.name} if an item doesn't arrive, isn't as described, arrives damaged or isn't genuine.`,
  alternates: { canonical: "/buyer-protection" },
};

export default function BuyerProtectionPage() {
  return (
    <ContentPage
      eyebrow="Buyer protection"
      title="If something goes wrong with an order"
      intro="Pay through the site and you can report a problem from your order page. Here is what that covers and how it works."
      legal
      updated="November 2026"
    >
      <Section title="What it covers">
        <p>Orders paid through the site&apos;s checkout, when:</p>
        <ul>
          <li>
            <strong>It didn&apos;t arrive.</strong> Tracking doesn&apos;t show delivery, or shows delivery to the wrong address.
          </li>
          <li>
            <strong>It isn&apos;t as described.</strong> The item has damage the seller didn&apos;t disclose (for example a crack or rattle when the seller
            answered &ldquo;no&rdquo;), is a different model, year, weight or stamp than listed, or its condition is clearly worse than the score given.
          </li>
          <li>
            <strong>It was damaged in transit.</strong> Photograph the box and the item before you throw the packaging away.
          </li>
          <li>
            <strong>It isn&apos;t genuine.</strong> The item is counterfeit.
          </li>
        </ul>
      </Section>

      <Section title="What it doesn't cover">
        <ul>
          <li>Anything paid for outside the site, including payment apps, cash, wire transfers or gift cards.</li>
          <li>Damage or wear the seller disclosed in the listing.</li>
          <li>Changing your mind, or a bat not suiting your swing. See the <a href="/returns-policy">returns policy</a>.</li>
          <li>
            Whether a bat is approved for your league. We don&apos;t certify used equipment, and associations can change their lists after you buy.
          </li>
          <li>Normal performance changes in a used composite bat.</li>
        </ul>
      </Section>

      <Section title="How to report a problem">
        <ol>
          <li>
            Open the order and choose &ldquo;Report a problem&rdquo; within <Decide>3</Decide> days of delivery (or, for non-delivery, after the expected
            delivery date has passed).
          </li>
          <li>Describe what&apos;s wrong and add photos. For damage, include the box and packing.</li>
          <li>The seller has <Decide>3</Decide> days to respond. Most problems are settled between buyer and seller at this stage.</li>
          <li>
            If you can&apos;t agree, our team reviews the listing&apos;s condition answers and photos, the messages on the order, the tracking history and
            the photos from both sides, and decides.
          </li>
          <li>
            If the decision is for you, the refund goes back to your card through Stripe. We may ask you to return the item first, with a prepaid label{" "}
            <Decide>who pays return shipping in each case</Decide>.
          </li>
        </ol>
        <p>
          While a problem report is open, the seller&apos;s payout for that order is held <Decide>confirm payout hold rules once Stripe setup is decided</Decide>.
        </p>
      </Section>

      <Section title="Card disputes">
        <p>
          You can also dispute a charge with your card issuer. If you do, the card network&apos;s process takes over and we respond with the order&apos;s
          records. Reporting the problem on the site first is usually faster.
        </p>
      </Section>

      <Section title="This isn't escrow or insurance">
        <p>
          {brand.name} isn&apos;t an escrow service or an insurer. Payments are processed by Stripe and paid out to sellers under the marketplace terms. This
          page describes how the marketplace handles problems with orders paid through the site.
        </p>
      </Section>

      <RelatedLinks
        links={[
          { href: "/returns-policy", label: "Returns policy" },
          { href: "/shipping-policy", label: "Shipping policy" },
          { href: "/terms", label: "Terms of service" },
        ]}
      />
    </ContentPage>
  );
}
