import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { ContentPage, RelatedLinks, Section } from "@/components/content/Content";
import { marketplaceFacts } from "@/lib/content";

export const metadata: Metadata = {
  title: "Seller guide",
  description: `How to list, photograph, describe, price and ship a used slow-pitch bat on ${brand.name}, and what it costs.`,
  alternates: { canonical: "/seller-guide" },
};

export default async function SellerGuidePage() {
  const facts = await marketplaceFacts();
  return (
    <ContentPage eyebrow="Seller guide" title="Sell your bat the right way" intro="Honest listings sell faster and avoid problem reports. Here is what a good one looks like.">
      <Section title="What it costs">
        <ul>
          <li>Listing is free.</li>
          <li>
            When an item sells, the marketplace commission is {facts.commission} of the item price. Shipping and tax aren&apos;t included in it.
          </li>
          <li>Stripe&apos;s payment processing cost is shown on the order once the payment settles.</li>
          {facts.featuredFee && <li>Featuring a listing is optional and costs {facts.featuredFee} when it&apos;s offered.</li>}
        </ul>
        {facts.example && (
          <p className="card p-4 text-sm">
            On a {facts.example.price} sale: commission {facts.example.commission}, you receive {facts.example.seller} before payment processing.
          </p>
        )}
      </Section>

      <Section title="Photos">
        <p>For bats, the listing asks for these photos. Use daylight and a plain background:</p>
        <ul>
          <li>The full bat</li>
          <li>The barrel, turned so any wear or marks show</li>
          <li>The end cap and the knob</li>
          <li>The model and certification markings (stamps), close enough to read</li>
          <li>Any damage, up close</li>
        </ul>
      </Section>

      <Section title="Condition and damage">
        <p>
          Give a cosmetic condition score from 1 to 10 (10 is like new) and answer every damage question: cracks, rattles, a loose end cap, repairs,
          alterations, and any other significant damage. If you answer yes to any of them, the listing must say damage is disclosed and describe it.
        </p>
        <p>If you aren&apos;t sure, say so in the description. Undisclosed damage is the most common reason a buyer gets a refund.</p>
      </Section>

      <Section title="What you can't sell">
        <ul>
          <li>Counterfeit items, or items you can&apos;t confirm are genuine</li>
          <li>Stolen items, or items you don&apos;t own</li>
          <li>Items described as something they aren&apos;t (wrong model, year, weight, stamp or condition)</li>
          <li>Items whose sale is against the law</li>
        </ul>
        <p>You also can&apos;t ask buyers to pay outside the site. Listings that break these rules are removed and the account may be suspended.</p>
      </Section>

      <Section title="Pricing">
        <p>
          Look at what the same model has actually sold for on the price guide, once there are enough verified sales. Asking prices on other listings are
          a guide too, but they aren&apos;t sales. You can accept offers; they expire after {facts.offerHours} hours.
        </p>
      </Section>

      <Section title="Shipping">
        <ul>
          <li>Ship within the time shown on the order. Buy the label from the order page so tracking is attached.</li>
          <li>Measure the packed box. A bat box is usually around 36 × 5 × 5 inches, which some carriers price as a long package.</li>
          <li>Wrap the barrel and fill gaps so the bat can&apos;t move. Photograph the item and the packed box before you seal it.</li>
        </ul>
      </Section>

      <Section title="Getting paid">
        <p>
          Payouts are made through Stripe to the bank account you connect in your seller settings. Stripe asks for identity details to set up payouts;
          we never see your bank details. Payouts are released once the order is complete.
        </p>
      </Section>

      <RelatedLinks
        links={[
          { href: "/sell", label: "Start selling" },
          { href: "/shipping-policy", label: "Shipping policy" },
          { href: "/terms", label: "Terms of service" },
        ]}
      />
    </ContentPage>
  );
}
