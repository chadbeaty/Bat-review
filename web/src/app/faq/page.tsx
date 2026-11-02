import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { ContentPage, RelatedLinks } from "@/components/content/Content";
import { marketplaceFacts } from "@/lib/content";

export const metadata: Metadata = {
  title: "FAQ",
  description: `Answers about buying, selling, fees, payments, shipping and bat certification on ${brand.name}.`,
  alternates: { canonical: "/faq" },
};

export default async function FaqPage() {
  const facts = await marketplaceFacts();
  const groups: { title: string; items: { q: string; a: string }[] }[] = [
    {
      title: "Buying",
      items: [
        {
          q: "How do I know the condition of a used bat?",
          a: "Every listing has a cosmetic condition score from 1 to 10 and the seller's answers to six damage questions (cracks, rattles, loose end cap, repairs, alterations and other significant damage). Ask the seller through the site if anything is unclear.",
        },
        {
          q: "How do I pay?",
          a: "By card on a checkout page hosted by Stripe. Your card details go to Stripe, not to us or the seller. Don't pay a seller any other way: payments outside the site aren't covered if something goes wrong.",
        },
        {
          q: "What if the bat isn't as described?",
          a: "Report a problem from the order page soon after delivery. The seller can respond, and if you can't agree our team reviews the listing, photos, messages and tracking and decides. See the buyer protection page for details.",
        },
        {
          q: "Can I make an offer?",
          a: `Yes, if the seller accepts offers. The seller can accept, decline or counter. Offers expire after ${facts.offerHours} hours.`,
        },
      ],
    },
    {
      title: "Selling",
      items: [
        { q: "What does it cost to sell?", a: `Listing is free. When an item sells, the marketplace commission is ${facts.commission} of the item price. Shipping and tax aren't included in it. Stripe's payment processing cost is shown on the order.` },
        { q: "How do I get paid?", a: "Through Stripe, to the bank account you connect. Payouts are released once the order is complete." },
        { q: "How long does a listing stay up?", a: `${facts.listingDays} days. You can relist it after that.` },
        { q: "What can't I sell?", a: "Counterfeit, stolen or misrepresented items, and anything whose sale is illegal. Listings that break the rules are removed." },
      ],
    },
    {
      title: "Bats and certification",
      items: [
        {
          q: "Will this bat be legal in my league?",
          a: "We can't promise that. The catalog shows the stamps a model was made with (for example USSSA or USA) and, where we've checked, its listing status. Associations update their approved and banned lists, so check with your league or association before you buy. We don't certify used equipment.",
        },
        {
          q: "Where do the catalog specs come from?",
          a: "From manufacturer and retailer information. Specs we haven't checked against the manufacturer are marked unverified.",
        },
      ],
    },
    {
      title: "Shipping",
      items: [
        { q: "Who pays for shipping?", a: "The buyer pays the shipping cost shown at checkout. The seller buys the label through the site so tracking is attached to the order." },
        { q: "Do you ship outside the US?", a: "Not yet. Buyers and sellers need US addresses." },
      ],
    },
    {
      title: "Your account",
      items: [
        { q: "How do I make my account more secure?", a: "Turn on two-step sign-in with an authenticator app from your account's security page." },
        { q: "How do I contact you?", a: `Email ${brand.email.supportAddress}, or sign in and use the contact page.` },
      ],
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((g) => g.items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } }))),
  };

  return (
    <ContentPage eyebrow="FAQ" title="Frequently asked questions">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {groups.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          <div className="grid gap-2">
            {g.items.map((i) => (
              <details key={i.q} className="card px-4 py-3">
                <summary className="cursor-pointer font-medium">{i.q}</summary>
                <p className="mt-2 text-ink-soft">{i.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      <RelatedLinks
        links={[
          { href: "/how-it-works", label: "How it works" },
          { href: "/contact", label: "Contact us" },
        ]}
      />
    </ContentPage>
  );
}
