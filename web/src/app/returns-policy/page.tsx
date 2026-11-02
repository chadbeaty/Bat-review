import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { ContentPage, Decide, Section } from "@/components/content/Content";

export const metadata: Metadata = {
  title: "Returns policy",
  description: `Draft returns policy for ${brand.name}: when a used item can be returned or refunded, and how.`,
  alternates: { canonical: "/returns-policy" },
};

export default function ReturnsPolicyPage() {
  return (
    <ContentPage eyebrow="Legal" title="Returns policy" legal updated="November 2026">
      <Section title="Used items are sold as described">
        <p>
          Everything on {brand.name} is sold by individual members, usually used. The listing&apos;s photos, condition score and damage answers are the
          description you buy against.
        </p>
      </Section>

      <Section title="When you can get a refund">
        <ul>
          <li>The item didn&apos;t arrive.</li>
          <li>It isn&apos;t as described: undisclosed damage, the wrong model, year, weight or stamp, or a condition clearly worse than the score given.</li>
          <li>It was damaged in transit.</li>
          <li>It is counterfeit.</li>
        </ul>
        <p>
          Report the problem from the order page within <Decide>3</Decide> days of delivery. The process is explained on the{" "}
          <a href="/buyer-protection">buyer protection</a> page. You may be asked to return the item before a refund is issued.
        </p>
      </Section>

      <Section title="Change-of-mind returns">
        <p>
          <Decide>Decide whether change-of-mind returns are allowed: never, or only when the seller&apos;s listing says so, and who pays shipping both ways</Decide>.
        </p>
      </Section>

      <Section title="Sending an item back">
        <ul>
          <li>Use the return label provided on the order, so the return is tracked.</li>
          <li>Pack it as well as it was packed when it came to you, and send it within <Decide>5</Decide> days of the return being approved.</li>
          <li>The refund is issued once tracking shows the return delivered, or once the seller confirms receipt.</li>
          <li>Who pays for return shipping: <Decide>seller when the item wasn&apos;t as described; otherwise to be decided</Decide>.</li>
        </ul>
      </Section>

      <Section title="How refunds are paid">
        <p>
          Refunds go back to the card used to pay, through Stripe. When they appear depends on your bank, usually within 5 to 10 business days. When a
          refund is for the full order, the marketplace commission on that order isn&apos;t charged to the seller <Decide>confirm commission treatment on full and partial refunds</Decide>.
        </p>
      </Section>
    </ContentPage>
  );
}
