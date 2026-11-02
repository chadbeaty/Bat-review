import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { ContentPage, Section } from "@/components/content/Content";
import { ContactForm } from "@/components/content/ContactForm";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Contact",
  description: `How to reach the ${brand.name} support team about an order, a listing or your account.`,
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const user = await getCurrentUser();
  return (
    <ContentPage eyebrow="Contact" title="Contact us" intro="Questions about an order, a listing or your account? We're glad to help.">
      <Section title="Email">
        <p>
          Write to <a href={`mailto:${brand.email.supportAddress}`}>{brand.email.supportAddress}</a>. Include your username and, for an order, the order
          number.
        </p>
      </Section>
      <Section title="Send a message">
        {user ? (
          <ContactForm />
        ) : (
          <p>
            <Link href="/sign-in?next=/contact">Sign in</Link> to send a message from here, so we can see which account it&apos;s about. Or email us at the
            address above.
          </p>
        )}
      </Section>
      <Section title="Before you write">
        <ul>
          <li>
            Problem with an item you bought? Report it from the order page so the seller sees it too. See <a href="/buyer-protection">buyer protection</a>.
          </li>
          <li>Suspicious listing or message? Use the report button on it.</li>
          <li>
            Many questions are answered in the <a href="/faq">FAQ</a>.
          </li>
        </ul>
      </Section>
    </ContentPage>
  );
}
