import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { ContentPage, Decide, Section } from "@/components/content/Content";

export const metadata: Metadata = {
  title: "Shipping policy",
  description: `Draft shipping policy for ${brand.name}: who pays, how fast sellers ship, prepaid tracked labels and packing long bat boxes.`,
  alternates: { canonical: "/shipping-policy" },
};

export default function ShippingPolicyPage() {
  return (
    <ContentPage eyebrow="Legal" title="Shipping policy" legal updated="November 2026">
      <Section title="Where we ship">
        <p>Buyers and sellers need addresses in the United States. International shipping isn&apos;t offered.</p>
      </Section>

      <Section title="Shipping cost">
        <p>
          The buyer pays the shipping cost shown at checkout, which comes from live carrier rates for the package size and weight the seller entered and
          the distance between the seller&apos;s ZIP code and the buyer&apos;s address. <Decide>Whether sellers can offer free shipping</Decide>.
        </p>
      </Section>

      <Section title="Labels and tracking">
        <ul>
          <li>Each order is from one seller and ships as one package from that seller.</li>
          <li>
            The seller buys a prepaid label from the order page. Labels are provided through Shippo at the carrier&apos;s rates, and the tracking number
            is attached to the order automatically.
          </li>
          <li>Buyers get emails as tracking updates arrive and when the package is delivered.</li>
          <li>Shipping with a label bought outside the site isn&apos;t supported, because the order would have no tracking for problem reports.</li>
        </ul>
      </Section>

      <Section title="How fast sellers ship">
        <p>
          Sellers ship within <Decide>3</Decide> business days of payment. If an order hasn&apos;t shipped by then, the buyer can cancel for a full refund{" "}
          <Decide>confirm cancellation rule</Decide>.
        </p>
      </Section>

      <Section title="Packing">
        <ul>
          <li>Use a bat box or a sturdy box that fits snugly. Bat boxes are usually around 36 × 5 × 5 inches; enter the real size, as long packages can cost more.</li>
          <li>Wrap the barrel and fill gaps so nothing moves. Protect the end cap and knob.</li>
          <li>Photograph the item and the packed box before sealing. The photos help if the package is damaged.</li>
        </ul>
      </Section>

      <Section title="Lost or damaged packages">
        <p>
          If tracking shows no delivery, or the item arrives damaged, the buyer reports it from the order page (see{" "}
          <a href="/buyer-protection">buyer protection</a>). <Decide>Shipping insurance: whether it is included, optional or required above a value, and who files carrier claims</Decide>.
        </p>
      </Section>
    </ContentPage>
  );
}
