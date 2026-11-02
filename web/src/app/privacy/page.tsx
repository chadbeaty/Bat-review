import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { ContentPage, Decide, Section } from "@/components/content/Content";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `Draft privacy policy for ${brand.name}: what we collect, why, who we share it with and your choices. For attorney review before launch.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <ContentPage eyebrow="Legal" title="Privacy policy" legal updated="November 2026">
      <Section title="Who we are">
        <p>
          {brand.name} is operated by {brand.legalEntity}. This policy explains what personal information the marketplace collects and how it is used.
        </p>
      </Section>

      <Section title="What we collect">
        <ul>
          <li>
            <strong>Account:</strong> email address, username, password (stored by our authentication provider as a hash, never readable by us), and
            optional display name, photo, bio, city and state.
          </li>
          <li>
            <strong>Two-step sign-in:</strong> if you turn it on, a secret shared with your authenticator app, held by our authentication provider.
          </li>
          <li>
            <strong>Listings:</strong> photos, descriptions, condition answers, and the ZIP code you ship from. Only your city and state are shown publicly;
            your ship-from ZIP code is used for shipping rates and is never shown to other members.
          </li>
          <li>
            <strong>Orders:</strong> shipping address, items bought and sold, amounts, and tracking. A seller sees the buyer&apos;s shipping address only after
            the order is paid.
          </li>
          <li>
            <strong>Payments:</strong> card details are collected by Stripe on its own checkout page. We receive the payment status and amounts, never your full card
            number. Sellers&apos; identity and bank details are collected by Stripe for payouts; we see only whether payouts are enabled.
          </li>
          <li>
            <strong>Messages, offers, reviews and reports</strong> you send through the site.
          </li>
          <li>
            <strong>Technical data:</strong> sign-in cookies that keep you signed in, and basic server logs (IP address, browser, pages requested) used for
            security. <Decide>Analytics provider and cookies, if any are added</Decide>.
          </li>
        </ul>
      </Section>

      <Section title="How we use it">
        <ul>
          <li>To run your account, show your listings, process orders, arrange shipping and pay sellers.</li>
          <li>To send emails about your account and orders, and marketing emails only if you opted in and confirmed.</li>
          <li>To prevent fraud and abuse, review reported content, and resolve disputes.</li>
          <li>To build the price guide from completed sales. Sale prices are shown without buyer or seller names.</li>
        </ul>
      </Section>

      <Section title="Who we share it with">
        <p>We share information only as needed to run the marketplace:</p>
        <ul>
          <li>
            <strong>The other member in an order</strong>: username, and the shipping address for the seller once paid.
          </li>
          <li>
            <strong>Service providers</strong>: Supabase (database, sign-in and photo storage), Stripe (payments, identity checks and payouts), Shippo and
            the carriers it uses (shipping labels and tracking), Resend (email delivery) and our hosting provider <Decide>confirm the final list and add
            any others</Decide>.
          </li>
          <li>
            <strong>When the law requires it</strong>, or to protect members from fraud or harm.
          </li>
        </ul>
        <p>
          <Decide>Confirm the position: we don&apos;t sell personal information or share it for cross-context behavioral advertising.</Decide>
        </p>
      </Section>

      <Section title="Your choices">
        <ul>
          <li>Edit your profile from your account page.</li>
          <li>Unsubscribe from marketing emails with the link in any of them.</li>
          <li>
            Ask for a copy of your information, a correction, or deletion of your account by emailing{" "}
            <a href={`mailto:${brand.email.supportAddress}`}>{brand.email.supportAddress}</a>. Some order records must be kept for tax and accounting{" "}
            <Decide>retention periods</Decide>.
          </li>
          <li>
            <Decide>State-specific rights (for example California, Virginia, Colorado) and how to exercise them</Decide>.
          </li>
        </ul>
      </Section>

      <Section title="Security">
        <p>
          Data is protected by access rules in the database, so members can only see what they&apos;re allowed to. Staff access to the admin area needs
          two-step sign-in, and staff actions are recorded in a log that can&apos;t be edited.
        </p>
      </Section>

      <Section title="Children">
        <p>
          The marketplace isn&apos;t for children under <Decide>13 / the minimum age chosen in the terms</Decide>, and we don&apos;t knowingly collect their
          information.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          We&apos;ll post changes here and tell members about material changes. Questions:{" "}
          <a href={`mailto:${brand.email.supportAddress}`}>{brand.email.supportAddress}</a>.
        </p>
      </Section>
    </ContentPage>
  );
}
