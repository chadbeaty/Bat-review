import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { ContentPage, Decide, Section } from "@/components/content/Content";
import { marketplaceFacts } from "@/lib/content";

export const metadata: Metadata = {
  title: "Terms of service",
  description: `Draft terms for using the ${brand.name} marketplace, prepared for review by a qualified attorney before launch.`,
  alternates: { canonical: "/terms" },
};

const TOC = [
  { id: "about", label: "Who we are and what we do" },
  { id: "accounts", label: "Accounts" },
  { id: "listing", label: "Listing and selling" },
  { id: "prohibited", label: "Prohibited items and conduct" },
  { id: "buying", label: "Buying and payment" },
  { id: "fees", label: "Fees" },
  { id: "shipping", label: "Shipping" },
  { id: "problems", label: "Problems with orders and disputes" },
  { id: "certification", label: "Equipment certification and safety" },
  { id: "reviews", label: "Reviews, messages and content" },
  { id: "enforcement", label: "Suspension and removal" },
  { id: "liability", label: "Disclaimers and limits of liability" },
  { id: "general", label: "General" },
];

export default async function TermsPage() {
  const f = await marketplaceFacts();
  return (
    <ContentPage eyebrow="Legal" title="Terms of service" legal updated="November 2026" toc={TOC}>
      <Section id="about" title="1. Who we are and what we do">
        <p>
          {brand.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is operated by {brand.legalEntity}. It is an online marketplace where members list used
          slow-pitch softball equipment for sale and other members buy it. Sellers are the sellers of their items. We don&apos;t own, inspect, store or
          ship the items, and we aren&apos;t a party to the sale except as described in these terms.
        </p>
        <p>By creating an account or using the site you agree to these terms and to the <a href="/privacy">privacy policy</a>.</p>
      </Section>

      <Section id="accounts" title="2. Accounts">
        <ul>
          <li>
            You must be at least <Decide>18</Decide> years old and live in the United States to buy or sell.
          </li>
          <li>One person, one account. Keep your password private and tell us if you think someone else has used your account.</li>
          <li>Give accurate information. Sellers complete Stripe&apos;s identity and payout checks before they can be paid.</li>
        </ul>
      </Section>

      <Section id="listing" title="3. Listing and selling">
        <ul>
          <li>You may only list items you own and have the right to sell, and you confirm this and the item&apos;s authenticity on every listing.</li>
          <li>
            Each listing must have real photos of the item, a cosmetic condition score, and honest answers to every damage question (cracks, rattles, loose
            end cap, repairs, alterations and other significant damage). Describe any damage you know about.
          </li>
          <li>Each order is from one seller. When a buyer pays, the item is reserved for that order and can&apos;t be sold again.</li>
          <li>
            Listings stay up for {f.listingDays} days unless they sell or you remove them. Offers expire after {f.offerHours} hours unless answered.
          </li>
          <li>You are responsible for any taxes on your sales <Decide>marketplace facilitator tax collection: confirm with a tax advisor</Decide>.</li>
        </ul>
      </Section>

      <Section id="prohibited" title="4. Prohibited items and conduct">
        <p>You may not list or sell:</p>
        <ul>
          <li>counterfeit items, or items you can&apos;t confirm are genuine;</li>
          <li>stolen items, or items you don&apos;t own;</li>
          <li>misrepresented items, including the wrong model, year, weight, certification stamp or condition, or undisclosed damage;</li>
          <li>anything whose sale is illegal.</li>
        </ul>
        <p>You may not:</p>
        <ul>
          <li>ask for or accept payment outside the site for an item found here;</li>
          <li>harass other members, send spam, or use another member&apos;s information for anything but the order;</li>
          <li>post fake reviews, or try to manipulate prices, search results or reviews;</li>
          <li>get around a suspension or a block.</li>
        </ul>
      </Section>

      <Section id="buying" title="5. Buying and payment">
        <ul>
          <li>Payments are taken by card on a checkout page hosted by Stripe, our payment processor. Card details go to Stripe; we don&apos;t store them.</li>
          <li>
            The price you pay is the item price, plus the shipping cost and any sales tax shown at checkout. The total is shown before you pay.
          </li>
          <li>
            We don&apos;t hold payments in escrow. Stripe processes the payment and the seller&apos;s share is paid out to the seller through Stripe Connect
            once the order is complete <Decide>define &ldquo;complete&rdquo; and any payout delay once the Stripe funds flow is decided</Decide>.
          </li>
          <li>Payments made outside the site aren&apos;t covered by these terms or by the problem-report process.</li>
        </ul>
      </Section>

      <Section id="fees" title="6. Fees">
        <ul>
          <li>Listing is free.</li>
          <li>
            Sellers pay a marketplace commission of {f.commission} of the item price on each completed sale. It isn&apos;t charged on shipping or tax.
            {f.example && ` For example, on a ${f.example.price} sale the commission is ${f.example.commission}.`}
          </li>
          <li>Payment processing costs are recorded from the actual payment and shown on the order.</li>
          {f.featuredFee && <li>Optional featured placement, when offered, costs {f.featuredFee}.</li>}
          <li>We may change fees. Changes apply only to orders placed after the change takes effect; each order keeps the fees in force when it was placed.</li>
        </ul>
      </Section>

      <Section id="shipping" title="7. Shipping">
        <p>
          Sellers ship using a label bought through the site (provided through Shippo) so the order has tracking. See the{" "}
          <a href="/shipping-policy">shipping policy</a> for timing and packaging.
        </p>
      </Section>

      <Section id="problems" title="8. Problems with orders and disputes">
        <ul>
          <li>
            A buyer can report that an item didn&apos;t arrive, isn&apos;t as described, was damaged in transit, or is counterfeit, from the order page within{" "}
            <Decide>3</Decide> days of delivery.
          </li>
          <li>The seller can respond. If the buyer and seller can&apos;t agree, our team reviews the evidence and decides.</li>
          <li>
            The evidence includes the listing&apos;s condition answers and photos, the messages on the order, tracking history, and photos from both sides.
          </li>
          <li>
            Outcomes may be a full or partial refund, a refund after the item is returned, or closing the report in the seller&apos;s favor. Refunds go back to
            the original card through Stripe.
          </li>
          <li>If a buyer disputes the charge with their card issuer, the card network&apos;s process applies and we provide the order records.</li>
          <li>
            Disputes between you and us: <Decide>dispute resolution clause (for example informal resolution first, then arbitration or courts) and governing law</Decide>.
          </li>
        </ul>
      </Section>

      <Section id="certification" title="9. Equipment certification and safety">
        <p>
          We don&apos;t test, inspect or certify any equipment, and we don&apos;t guarantee that a used bat is safe, performs a certain way, or is approved for
          any league, association or tournament. Catalog information about stamps and certification comes from manufacturers, associations and retailers
          and may be out of date. Associations change their approved and banned lists. Check with your league before you buy or use a bat.
        </p>
      </Section>

      <Section id="reviews" title="10. Reviews, messages and content">
        <ul>
          <li>Only the buyer and seller of a completed order can review each other. Reviews must be honest and about the transaction.</li>
          <li>
            You keep ownership of the photos and text you post, and you give us permission to display them on the site and in marketing of the listing
            while it is live <Decide>scope and duration of the content licence</Decide>.
          </li>
          <li>Messages between members may be reviewed by our staff when they are reported or needed to resolve a dispute.</li>
        </ul>
      </Section>

      <Section id="enforcement" title="11. Suspension and removal">
        <p>
          We may remove listings, hide reviews, or suspend or close accounts that break these terms. We tell sellers why a listing was removed. Suspended
          members can still see their orders. Banned accounts can&apos;t sell or buy.
        </p>
      </Section>

      <Section id="liability" title="12. Disclaimers and limits of liability">
        <p>
          <Decide>Disclaimer of warranties, limitation of liability, and indemnity clauses to be drafted by counsel.</Decide>
        </p>
      </Section>

      <Section id="general" title="13. General">
        <ul>
          <li>We may update these terms. We&apos;ll post the new version here and tell members about material changes before they take effect.</li>
          <li>
            Questions: <a href={`mailto:${brand.email.supportAddress}`}>{brand.email.supportAddress}</a>. Postal address: <Decide>registered address of {brand.legalEntity}</Decide>.
          </li>
        </ul>
      </Section>
    </ContentPage>
  );
}
