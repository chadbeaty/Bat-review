import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Email updates", robots: { index: false } };

const RESULTS: Record<string, { title: string; body: string }> = {
  confirmed: { title: "You're subscribed", body: `Thanks for confirming. We'll email you marketplace news and new-bat updates from ${brand.name}.` },
  "already-confirmed": { title: "You're already subscribed", body: "This address was confirmed earlier. Nothing else to do." },
  unsubscribed: { title: "You're unsubscribed", body: "You won't get marketing emails from us any more. Emails about your orders and account still arrive." },
  "already-unsubscribed": { title: "You're already unsubscribed", body: "This address is off the list. Nothing else to do." },
  invalid: { title: "That link doesn't work", body: "It may be old or incomplete. To change your email preferences, contact us." },
  unavailable: { title: "Something went wrong", body: "We couldn't update your preferences just now. Try the link again in a few minutes." },
};

export default async function NewsletterPage({ searchParams }: PageProps<"/newsletter">) {
  const { result } = await searchParams;
  const r = (typeof result === "string" && RESULTS[result]) || RESULTS.invalid;
  return (
    <div className="wrap grid max-w-2xl gap-4 py-16">
      <p className="eyebrow">Email updates</p>
      <h1 className="display text-5xl font-bold">{r.title}</h1>
      <p className="text-lg text-ink-soft">{r.body}</p>
      <p className="text-sm text-ink-soft">
        Questions? Write to <a href={`mailto:${brand.email.supportAddress}`} className="underline">{brand.email.supportAddress}</a>.
      </p>
      <p>
        <Link href="/" className="btn btn-outline">
          Back to the homepage
        </Link>
      </p>
    </div>
  );
}
