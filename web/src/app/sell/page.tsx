import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentFee } from "@/lib/settings";
import { sellerProceedsBeforeProcessing } from "@/lib/fees";
import { formatPrice } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sell your bat",
  description: "List a used slow-pitch bat in about three minutes. Free to list; you pay a commission only when it sells.",
};

const STEPS = [
  { title: "Pick your model", body: "Choose the brand and model from our catalog. We fill in the specs we know, and you confirm them." },
  { title: "Add photos and details", body: "Fill the labeled photo slots, score the cosmetic condition and answer the damage questions honestly." },
  { title: "Set your price", body: "See exactly what you'll receive before payment processing, and compare with verified sales when there are any." },
  { title: "Ship it when it sells", body: "Enter your box size once. When a buyer pays, you pack the item and ship it to them." },
];

const PHOTOS = [
  { title: "Full bat", body: "The whole bat on a plain background, barrel to knob." },
  { title: "Barrel", body: "Close up, in good light, so buyers can see the finish and any marks." },
  { title: "End cap", body: "Straight on, showing it's seated and undamaged." },
  { title: "Knob", body: "Both the knob and the grip." },
  { title: "Certification stamp", body: "Every stamp on the barrel (USSSA, USA, NSA, ISA, SSUSA), sharp enough to read. Strongly encouraged." },
  { title: "Damage / wear", body: "Every crack, dent or flat spot, close up. Add as many as you need." },
];

export default async function SellPage() {
  const [fee, user] = await Promise.all([getCurrentFee("seller_commission"), getCurrentUser()]);
  const example = fee ? sellerProceedsBeforeProcessing(20000, fee) : null;
  const rate = fee ? (fee.fee_type === "percentage" ? `${fee.fee_value}%` : formatPrice(fee.fee_value)) : null;
  const start = user ? "/sell/new" : "/sign-in?next=/sell/new";

  return (
    <div className="wrap grid gap-14 py-10 md:py-16">
      <section className="grid gap-5 md:max-w-3xl">
        <p className="eyebrow">Sell on the marketplace</p>
        <h1 className="display text-5xl font-bold md:text-7xl">Sell your bat</h1>
        <p className="text-lg text-ink-soft">
          List a used slow-pitch bat in about three minutes with your photos ready. Listing is free.
          {rate ? ` You pay a ${rate} commission on the item price only when it sells.` : " You pay a commission only when it sells."}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={start} className="btn btn-primary px-6 py-3 text-base">
            Start a listing
          </Link>
          {user && (
            <Link href="/seller/listings" className="btn btn-outline px-6 py-3 text-base">
              Your listings
            </Link>
          )}
        </div>
        {!user && <p className="text-sm text-ink-soft">You&apos;ll sign in or create a free account first.</p>}
      </section>

      <section className="grid gap-6" aria-labelledby="how">
        <h2 id="how" className="display text-3xl font-bold">
          How selling works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card grid content-start gap-2 p-5">
              <span className="font-mono text-sm text-ink-soft">0{i + 1}</span>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-sm text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 md:grid-cols-[1fr_1fr] md:gap-8" aria-labelledby="fees">
        <div className="grid content-start gap-3">
          <h2 id="fees" className="display text-3xl font-bold">
            What it costs
          </h2>
          <p className="text-ink-soft">
            Free to list, free to edit, free to take down. The commission comes out of the item price when the sale completes. It never
            applies to shipping.
          </p>
        </div>
        {example && fee ? (
          <div className="card grid gap-3 p-5">
            <p className="font-semibold">Example: a bat sells for {formatPrice(example.itemPriceCents)}</p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
              <dt>Sale price</dt>
              <dd className="text-right font-mono">{formatPrice(example.itemPriceCents)}</dd>
              <dt>Commission ({rate})</dt>
              <dd className="text-right font-mono">−{formatPrice(example.commissionCents)}</dd>
              <dt className="font-semibold">You receive before payment processing</dt>
              <dd className="text-right font-mono font-semibold">{formatPrice(example.beforeProcessingCents)}</dd>
            </dl>
            <p className="text-xs text-ink-soft">
              Payment processing fees are calculated when the buyer pays, from the actual charge, and are shown in your sale details.
            </p>
          </div>
        ) : (
          <div className="card p-5 text-sm text-ink-soft">The current commission rate is shown here once the marketplace database is connected.</div>
        )}
      </section>

      <section className="grid gap-6" aria-labelledby="photos">
        <div className="grid gap-2 md:max-w-3xl">
          <h2 id="photos" className="display text-3xl font-bold">
            Photos to take for a bat
          </h2>
          <p className="text-ink-soft">Buyers can&apos;t hold the bat, so photos do the work. Shoot in daylight, on a plain background, without filters.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PHOTOS.map((p) => (
            <li key={p.title} className="rounded-md border border-line p-4">
              <p className="font-semibold">{p.title}</p>
              <p className="text-sm text-ink-soft">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 md:max-w-3xl" aria-labelledby="packing">
        <h2 id="packing" className="display text-3xl font-bold">
          Packing a bat
        </h2>
        <ul className="grid list-disc gap-2 pl-5 text-ink-soft">
          <li>Use a long bat box. Most single bats fit a box about 36 × 5 × 5 inches; bike shops and sporting goods stores often have spares.</li>
          <li>Wrap the barrel and end cap in bubble wrap or packing paper so the bat can&apos;t slide or rattle inside the box.</li>
          <li>Fill empty space at both ends, and tape the ends shut so they can&apos;t open in transit.</li>
          <li>Weigh and measure the packed box. That&apos;s what shipping is priced on, and you enter it once when you list.</li>
          <li>Ship only after the buyer has paid through the marketplace. Never accept payment outside it.</li>
        </ul>
      </section>

      <section className="grid gap-3 rounded-lg border border-line bg-surface p-6 md:max-w-3xl">
        <h2 className="text-xl font-bold">Be upfront about condition</h2>
        <p className="text-ink-soft">
          Every bat listing asks about cracks, rattles, loose end caps, repairs, alterations and other damage. Altered or rolled bats are
          disclosed as such. The marketplace doesn&apos;t inspect used equipment or certify that it&apos;s safe or legal for play, so buyers
          rely on your answers.
        </p>
        <p>
          <Link href={start} className="btn btn-primary">
            Start a listing
          </Link>
        </p>
      </section>
    </div>
  );
}
