import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { ContentPage, RelatedLinks, Section } from "@/components/content/Content";
import { marketplaceFacts } from "@/lib/content";

export const metadata: Metadata = {
  title: "How it works",
  description: `How buying and selling used slow-pitch bats and gear works on ${brand.name}: listings with condition disclosures, card payments through Stripe and prepaid shipping labels.`,
  alternates: { canonical: "/how-it-works" },
};

export default async function HowItWorksPage() {
  const facts = await marketplaceFacts();
  return (
    <ContentPage
      eyebrow="How it works"
      title="Buy and sell slow-pitch gear without the guesswork"
      intro={`${brand.name} connects players who want to sell used bats and equipment with players who want to buy them, anywhere in the US.`}
    >
      <Section title="For buyers">
        <ol>
          <li>
            <strong>Find it.</strong> Search by brand, model, year, weight and stamp. Each listing is tied to a model in our catalog, so you can compare
            like with like.
          </li>
          <li>
            <strong>Check the condition.</strong> Every listing shows a cosmetic condition score from 1 to 10 and the seller&apos;s answers to six damage
            questions: cracks, rattles, a loose end cap, repairs, alterations and other significant damage. Sellers must answer all six before a listing
            goes live.
          </li>
          <li>
            <strong>Ask or offer.</strong> Message the seller through the site, or make an offer. Offers expire after {facts.offerHours} hours if the seller
            doesn&apos;t answer.
          </li>
          <li>
            <strong>Pay on the site.</strong> You pay by card on a checkout page hosted by Stripe. Your card details go to Stripe, never to us or the seller.
          </li>
          <li>
            <strong>Track it.</strong> The seller ships with a prepaid label bought through the site, so tracking is attached to your order from the start.
          </li>
          <li>
            <strong>Check it and confirm.</strong> When it arrives, check it against the listing. If it isn&apos;t as described, report a problem from the
            order page. See <a href="/buyer-protection">buyer protection</a>.
          </li>
        </ol>
      </Section>

      <Section title="For sellers">
        <ol>
          <li>
            <strong>List it for free.</strong> Pick the model, add clear photos (for bats: the full bat, barrel, end cap, knob and markings), answer the damage
            questions honestly and set your price. Listings stay up for {facts.listingDays} days.
          </li>
          <li>
            <strong>Get an order.</strong> When a buyer pays, the item is reserved for them so it can&apos;t sell twice.
          </li>
          <li>
            <strong>Ship it.</strong> Buy a label from the order page at live carrier rates. Bat boxes are long, so enter the real package size.
          </li>
          <li>
            <strong>Get paid.</strong> Payouts go to your bank through Stripe once the order is complete, minus the marketplace commission of{" "}
            {facts.commission} of the item price.
          </li>
        </ol>
        {facts.example && (
          <p className="card p-4 text-sm">
            Example: on a {facts.example.price} sale, the commission is {facts.example.commission}, so you receive {facts.example.seller} before Stripe&apos;s
            payment processing cost. Shipping and tax are never part of the commission.
          </p>
        )}
      </Section>

      <Section title="What we don't do">
        <ul>
          <li>We don&apos;t own, inspect or store the items. Each item ships straight from the seller to the buyer.</li>
          <li>
            We don&apos;t certify that a used bat is safe or legal for your league. The catalog shows the stamps a model was made with and, where checked,
            its listing status, but associations change their rules. Check with your league before you buy.
          </li>
          <li>We don&apos;t support payments outside the site. If someone asks you to pay by app, wire or gift card, report it.</li>
        </ul>
      </Section>

      <RelatedLinks
        links={[
          { href: "/buyer-protection", label: "Buyer protection" },
          { href: "/seller-guide", label: "Seller guide" },
          { href: "/faq", label: "FAQ" },
        ]}
      />
    </ContentPage>
  );
}
