import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readFlash } from "@/lib/admin/action";
import { getListing, isUuid } from "@/lib/listings";
import { listingPath } from "@/lib/paths";
import { formatPrice } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/settings";
import { formatAddressLines, US_STATES } from "@/lib/shipping/address";
import { TEST_DATA_NOTICE } from "@/lib/shipping/provider";
import { selectRate, sortRates } from "@/lib/shipping/rates";
import type { Rate } from "@/lib/shipping/types";
import { isLiveKey, stripeConfigured } from "@/lib/payments/stripe-client";
import { taxProviderFromEnv } from "@/lib/payments/tax";
import { checkOfferForCheckout, type OfferForCheckout } from "@/lib/payments/offer";
import { Disclosures } from "@/components/listing/Disclosures";
import { cancelCheckout, chooseAddress, startPayment } from "./actions";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

type Address = {
  id: string;
  full_name: string;
  street_address: string;
  apartment: string | null;
  city: string;
  state: string;
  postal_code: string;
  phone: string | null;
  is_default: boolean;
};

type Quote = { id: string; address_id: string; rates: Rate[]; is_test: boolean; expires_at: string; package: { weightOz: number; lengthIn: number; widthIn: number; heightIn: number } };

function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="card grid gap-2 p-5" data-testid="checkout-blocked">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function CheckoutPage({ params, searchParams }: PageProps<"/checkout/[listingId]">) {
  const { listingId } = await params;
  const sp = await searchParams;
  if (!isUuid(listingId)) notFound();
  const supabase = await createClient();
  if (!supabase) notFound();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/sign-in?next=${encodeURIComponent(`/checkout/${listingId}`)}`);
  const user = auth.user;

  const listing = await getListing(listingId);
  if (!listing) notFound();
  const flash = readFlash(sp);
  const back = (
    <Link href={listingPath(listing.id)} className="text-sm underline">
      Back to the listing
    </Link>
  );

  const shell = (body: React.ReactNode) => (
    <div className="wrap grid max-w-3xl gap-6 py-10">
      <div className="grid gap-1">
        <p className="eyebrow">Checkout</p>
        <h1 className="display text-4xl font-bold">{listing.title}</h1>
      </div>
      {flash && (
        <p role={flash.kind === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${flash.kind === "error" ? "border-danger/30 bg-danger/5 text-danger" : "border-success/30 bg-success/5 text-success"}`}>
          {flash.message}
        </p>
      )}
      {body}
    </div>
  );

  const [checkoutEnabled, taxEnabled] = await Promise.all([getSetting<boolean>("checkout_enabled", false), getSetting<boolean>("tax_collection_enabled", false)]);
  if (checkoutEnabled !== true) return shell(<Notice title="Checkout opens soon">{back}</Notice>);
  if (!stripeConfigured()) return shell(<Notice title="Payments aren't connected yet">{back}</Notice>);
  if (taxEnabled === true && !taxProviderFromEnv())
    return shell(<Notice title="Checkout is paused">Sales tax collection is switched on, but no tax provider is connected yet. {back}</Notice>);
  if (listing.sellerId === user.id) return shell(<Notice title="This is your listing">You can&apos;t buy your own item. {back}</Notice>);

  // An accepted offer (?offer=): checked here for a clear message, and again by the database when the order is created.
  const offerParamValue = typeof sp.offer === "string" ? sp.offer : null;
  const offerId = offerParamValue && isUuid(offerParamValue) ? offerParamValue : null;
  let offerAmountCents: number | null = null;
  let offerExpiresAt: string | null = null;
  if (offerParamValue !== null) {
    const { data: offerRow } = offerId
      ? await supabase.from("offers").select("id, listing_id, buyer_id, status, amount_cents, expires_at").eq("id", offerId).maybeSingle<OfferForCheckout>()
      : { data: null };
    const check = checkOfferForCheckout(offerRow, { buyerId: user.id, listingId: listing.id });
    if (!check.ok) {
      return shell(
        <Notice title={check.code === "expired" ? "This offer's payment window has ended" : "This offer can't be paid for"}>
          <p className="text-sm">{check.message}</p>
          {back}
        </Notice>
      );
    }
    offerAmountCents = check.amountCents;
    offerExpiresAt = offerRow?.expires_at ?? null;
  }
  const itemCents = offerAmountCents ?? listing.askingPriceCents;
  const offerQuery = offerId ? `?offer=${offerId}` : "";

  // The buyer's own unpaid checkout for this item, if any.
  const { data: open } = await supabase
    .from("orders")
    .select("id, stripe_checkout_url, checkout_expires_at, order_items!inner(listing_id)")
    .eq("buyer_id", user.id)
    .eq("order_status", "awaiting_payment")
    .eq("order_items.listing_id", listing.id)
    .maybeSingle();
  if (open) {
    return shell(
      <Notice title="You have a checkout in progress">
        <p className="text-sm">The item is held for you until {new Date(open.checkout_expires_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.</p>
        <div className="flex flex-wrap gap-3">
          {open.stripe_checkout_url && (
            <a href={open.stripe_checkout_url} className="btn btn-primary">
              Continue to payment
            </a>
          )}
          <form action={cancelCheckout}>
            <input type="hidden" name="listingId" value={listing.id} />
            <input type="hidden" name="orderId" value={open.id} />
            <button type="submit" className="btn btn-outline">
              Cancel this checkout
            </button>
          </form>
        </div>
      </Notice>
    );
  }

  if (listing.status !== "active") {
    return shell(<Notice title={listing.status === "sold" ? "This item has sold" : listing.status === "reserved" ? "This item is reserved for another buyer" : "This listing isn't for sale right now"}>{back}</Notice>);
  }
  const { data: sellerReady } = await supabase.rpc("seller_can_accept_payments", { p_seller: listing.sellerId });
  if (!sellerReady) return shell(<Notice title="The seller is still setting up payouts">You can save the listing and check back soon. {back}</Notice>);

  // An accepted offer reserves the item for its buyer while they pay.
  const { data: reservation } = await supabase.rpc("listing_offer_reservation", { p_listing: listing.id });
  const reservedRow = Array.isArray(reservation) ? reservation[0] : null;
  if (reservedRow?.reserved && !reservedRow.held_by_me) {
    return shell(
      <Notice title="This item is reserved for another buyer">
        The seller accepted another buyer&apos;s offer, and they have a limited time to pay. If they don&apos;t, the item becomes available again. {back}
      </Notice>
    );
  }

  // Someone else's checkout holds the item (checked with the service role; buyers can't see others' orders).
  const admin = createAdminClient();
  if (admin) {
    const { data: held } = await admin.from("order_items").select("id, orders!inner(buyer_id)").eq("listing_id", listing.id).eq("holds_listing", true).neq("orders.buyer_id", user.id).limit(1);
    if (held && held.length) {
      return shell(<Notice title="Someone else is checking out this item">If they don&apos;t finish within about 30 minutes, it becomes available again. {back}</Notice>);
    }
  }

  const { data: addresses } = await supabase
    .from("addresses")
    .select("id, full_name, street_address, apartment, city, state, postal_code, phone, is_default")
    .eq("user_id", user.id)
    .eq("address_type", "shipping")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<Address[]>();

  const quoteId = typeof sp.quote === "string" && isUuid(sp.quote) ? sp.quote : null;
  const { data: quote } = quoteId
    ? await supabase.from("shipping_quotes").select("id, address_id, rates, is_test, expires_at, package").eq("id", quoteId).eq("listing_id", listing.id).maybeSingle<Quote>()
    : { data: null };
  const quoteExpired = quote ? isPast(quote.expires_at) : false;
  const address = quote ? (addresses ?? []).find((a) => a.id === quote.address_id) : null;
  const rateParam = typeof sp.rate === "string" ? sp.rate : null;
  const rate = quote && !quoteExpired && rateParam ? selectRate(quote.rates, rateParam) : null;

  const testMode = !isLiveKey();

  return shell(
    <>
      {testMode && (
        <p className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm" data-testid="test-mode">
          Test mode: payments use Stripe test keys. No real money moves.
        </p>
      )}

      <ol className="grid gap-6">
        {/* Step 1: address */}
        <li className="card grid gap-4 p-5">
          <h2 className="text-xl font-semibold">1. Shipping address</h2>
          {address && !quoteExpired ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <address className="text-sm not-italic" data-testid="chosen-address">
                {formatAddressLines(address).map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
              </address>
              <Link href={`/checkout/${listing.id}${offerQuery}`} className="text-sm underline">
                Change
              </Link>
            </div>
          ) : (
            <form action={chooseAddress} className="grid gap-4">
              <input type="hidden" name="listingId" value={listing.id} />
              {offerId && <input type="hidden" name="offerId" value={offerId} />}
              {quoteExpired && <p className="text-sm text-danger">Those shipping rates expired. Choose the address again for fresh rates.</p>}
              {(addresses ?? []).length > 0 && (
                <fieldset className="grid gap-2">
                  <legend className="text-sm font-medium">Saved addresses</legend>
                  {(addresses ?? []).map((a, i) => (
                    <label key={a.id} className="flex items-start gap-2 text-sm">
                      <input type="radio" name="addressId" value={a.id} defaultChecked={i === 0} className="mt-1" />
                      <span>{formatAddressLines(a).join(", ")}</span>
                    </label>
                  ))}
                  <label className="flex items-start gap-2 text-sm">
                    <input type="radio" name="addressId" value="new" className="mt-1" />
                    <span>A new address (fill in below)</span>
                  </label>
                </fieldset>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="field sm:col-span-2">
                  Full name
                  <input name="full_name" className="input" autoComplete="name" maxLength={100} />
                </label>
                <label className="field sm:col-span-2">
                  Street address
                  <input name="street_address" className="input" autoComplete="address-line1" maxLength={200} />
                </label>
                <label className="field sm:col-span-2">
                  Apartment, suite (optional)
                  <input name="apartment" className="input" autoComplete="address-line2" maxLength={100} />
                </label>
                <label className="field">
                  City
                  <input name="city" className="input" autoComplete="address-level2" maxLength={80} />
                </label>
                <label className="field">
                  State
                  <select name="state" className="input" autoComplete="address-level1" defaultValue="">
                    <option value="" disabled>
                      Choose
                    </option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  ZIP code
                  <input name="postal_code" className="input" inputMode="numeric" autoComplete="postal-code" maxLength={10} />
                </label>
                <label className="field">
                  Phone (optional, for the carrier)
                  <input name="phone" className="input" type="tel" autoComplete="tel" maxLength={20} />
                </label>
              </div>
              <p className="text-xs text-ink-soft">We ship to US addresses only. The seller sees this address only after you pay.</p>
              <button type="submit" className="btn btn-primary justify-self-start">
                Get shipping rates
              </button>
            </form>
          )}
        </li>

        {/* Step 2: rates */}
        {quote && !quoteExpired && (
          <li className="card grid gap-4 p-5">
            <h2 className="text-xl font-semibold">2. Shipping</h2>
            <p className="text-sm text-ink-soft">
              Package: {quote.package.lengthIn}&Prime; × {quote.package.widthIn}&Prime; × {quote.package.heightIn}&Prime;, {Math.round(quote.package.weightOz)} oz. Long bat boxes are often
              charged by size (dimensional weight) rather than weight.
            </p>
            {quote.is_test && (
              <p className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm" data-testid="test-rates">
                {TEST_DATA_NOTICE}
              </p>
            )}
            <form method="get" className="grid gap-3">
              {offerId && <input type="hidden" name="offer" value={offerId} />}
              <input type="hidden" name="quote" value={quote.id} />
              <fieldset className="grid gap-2">
                <legend className="sr-only">Shipping options</legend>
                {sortRates(quote.rates).map((r) => (
                  <label key={r.id} className={`flex items-start justify-between gap-3 rounded-md border p-3 text-sm ${r.available ? "border-line" : "border-line opacity-70"}`}>
                    <span className="flex items-start gap-2">
                      <input type="radio" name="rate" value={r.id} disabled={!r.available} defaultChecked={r.id === (rate?.id ?? selectRate(quote.rates)?.id)} className="mt-1" />
                      <span>
                        <span className="font-medium">
                          {r.carrier} {r.service}
                        </span>
                        {r.available ? (
                          <span className="block text-ink-soft">
                            {r.estimatedDays ? `About ${r.estimatedDays} business days` : "Delivery time varies"}
                            {r.billableWeightOz ? ` · billed as ${Math.ceil(r.billableWeightOz / 16)} lb` : ""}
                          </span>
                        ) : (
                          <span className="block text-danger">Unavailable: {r.unavailableReason}</span>
                        )}
                      </span>
                    </span>
                    {r.available && <span className="font-mono">{formatPrice(r.amountCents)}</span>}
                  </label>
                ))}
              </fieldset>
              {quote.rates.every((r) => !r.available) ? (
                <p className="text-sm text-danger">No carrier can take this package. Message the seller about shipping.</p>
              ) : (
                <button type="submit" className="btn btn-outline justify-self-start">
                  Review order
                </button>
              )}
            </form>
          </li>
        )}

        {/* Step 3: review and pay */}
        {quote && rate && (
          <li className="card grid gap-4 p-5" data-testid="review">
            <h2 className="text-xl font-semibold">3. Review and pay</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
              <dt>{offerAmountCents !== null ? "Item (your accepted offer)" : "Item"}</dt>
              <dd className="text-right font-mono" data-testid="checkout-item">
                {formatPrice(itemCents)}
              </dd>
              <dt>
                Shipping ({rate.carrier} {rate.service})
              </dt>
              <dd className="text-right font-mono">{formatPrice(rate.amountCents)}</dd>
              <dt>{taxEnabled === true ? "Sales tax" : "Sales tax not collected"}</dt>
              <dd className="text-right font-mono">{formatPrice(0)}</dd>
              <dt className="border-t border-line pt-2 font-semibold">Total</dt>
              <dd className="border-t border-line pt-2 text-right font-mono font-semibold" data-testid="checkout-total">
                {formatPrice(itemCents + rate.amountCents)}
              </dd>
            </dl>
            <p className="text-xs text-ink-soft">
              {taxEnabled === true ? "Tax is calculated on the payment page." : "The marketplace doesn't collect sales tax yet. You may owe use tax in your state."}
            </p>

            {offerAmountCents !== null && offerExpiresAt && (
              <p className="text-sm" data-testid="offer-note">
                Your offer of {formatPrice(offerAmountCents)} was accepted (asking price {formatPrice(listing.askingPriceCents)}). The item is reserved for you until{" "}
                {new Date(offerExpiresAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC.
              </p>
            )}

            <Disclosures listing={listing} />

            <div className="grid gap-1 text-sm">
              <p>
                <strong>How you&apos;re protected:</strong> your payment is held by the marketplace, not sent to the seller. The seller is paid after
                tracking shows delivery and you&apos;ve had time to check the item. If it doesn&apos;t arrive or isn&apos;t as described, report a
                problem from your order page. See{" "}
                <Link href="/buyer-protection" className="underline">
                  buyer protection
                </Link>{" "}
                and the{" "}
                <Link href="/returns-policy" className="underline">
                  returns policy
                </Link>
                .
              </p>
            </div>

            <form action={startPayment} className="grid gap-3">
              <input type="hidden" name="listingId" value={listing.id} />
              {offerId && <input type="hidden" name="offerId" value={offerId} />}
              <input type="hidden" name="quoteId" value={quote.id} />
              <input type="hidden" name="rateId" value={rate.id} />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="acknowledge" value="yes" required className="mt-1" />
                <span>I&apos;ve read the seller&apos;s condition and damage answers above.</span>
              </label>
              <button type="submit" className="btn btn-primary justify-self-start py-3 text-base">
                Continue to secure payment
              </button>
              <p className="text-xs text-ink-soft">
                You&apos;ll pay on Stripe&apos;s secure page (cards, Apple Pay, Google Pay). The item is held for you for 30 minutes.
              </p>
            </form>
          </li>
        )}
      </ol>
    </>
  );
}
