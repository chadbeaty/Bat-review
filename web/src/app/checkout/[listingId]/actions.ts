"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { withFlash } from "@/lib/admin/action";
import { getCurrentUser } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { parseAddressForm, toProviderAddress } from "@/lib/shipping/address";
import { PaymentsError } from "@/lib/payments/deps";
import { closeUnpaidCheckout, createShippingQuote, startCheckout } from "@/lib/payments/checkout";
import { paymentsDeps } from "@/lib/payments/server";
import { TaxNotConfiguredError } from "@/lib/payments/tax";

const uuid = z.string().uuid();

function checkoutPath(listingId: string, params: Record<string, string> = {}) {
  const q = new URLSearchParams(params).toString();
  return `/checkout/${listingId}${q ? `?${q}` : ""}`;
}

function friendly(err: unknown): string {
  if (err instanceof PaymentsError || err instanceof TaxNotConfiguredError) return err.message;
  console.error("checkout error", err);
  return "Something went wrong. Nothing was charged; please try again.";
}

async function requireBuyer(listingId: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(checkoutPath(listingId))}`);
  return user;
}

/** Step 1: save (or pick) the shipping address, then fetch live rates for it. */
export async function chooseAddress(form: FormData) {
  const listingId = uuid.parse(form.get("listingId"));
  const user = await requireBuyer(listingId);
  const deps = paymentsDeps();
  if (!deps) redirect(withFlash(checkoutPath(listingId), "error", "Payments aren't configured yet."));

  let target: string;
  try {
    let addressId = String(form.get("addressId") ?? "");
    if (!addressId || addressId === "new") {
      const parsed = parseAddressForm(form);
      if (!parsed.ok) throw new PaymentsError(parsed.error);
      const a = parsed.value;
      const check = await deps.shipping.validateAddress(
        toProviderAddress({ ...a, apartment: a.apartment ?? null, phone: a.phone ?? null })
      );
      if (!check.valid) throw new PaymentsError(`We couldn't verify that address${check.messages.length ? `: ${check.messages.join(" ")}` : "."} Check it and try again.`);
      const { data: existing } = await deps.db.from("addresses").select("id").eq("user_id", user.id).eq("address_type", "shipping");
      const { data: row, error } = await deps.db
        .from("addresses")
        .insert({
          user_id: user.id,
          address_type: "shipping",
          full_name: a.full_name,
          street_address: a.street_address,
          apartment: a.apartment,
          city: a.city,
          state: a.state,
          postal_code: a.postal_code,
          phone: a.phone,
          is_default: !existing || existing.length === 0,
          validated: !deps.shipping.isTest,
          provider_address_id: check.providerAddressId,
        })
        .select("id")
        .single();
      if (error || !row) throw new PaymentsError("The address couldn't be saved. Check it and try again.");
      addressId = row.id;
    } else if (!uuid.safeParse(addressId).success) {
      throw new PaymentsError("Choose a shipping address.");
    }
    const quote = await createShippingQuote(deps, { buyerId: user.id, listingId, addressId });
    target = checkoutPath(listingId, { quote: quote.id });
  } catch (err) {
    target = withFlash(checkoutPath(listingId), "error", friendly(err));
  }
  redirect(target);
}

/** Step 4: create the order (holding the item) and go to Stripe's hosted payment page. */
export async function startPayment(form: FormData) {
  const listingId = uuid.parse(form.get("listingId"));
  const quoteId = uuid.parse(form.get("quoteId"));
  const rateId = String(form.get("rateId") ?? "").slice(0, 200);
  const back = checkoutPath(listingId, { quote: quoteId, rate: rateId });
  const user = await requireBuyer(listingId);
  if (form.get("acknowledge") !== "yes") {
    redirect(withFlash(back, "error", "Confirm you've read the condition and damage disclosures before paying."));
  }
  const deps = paymentsDeps();
  if (!deps) redirect(withFlash(back, "error", "Payments aren't configured yet."));

  let target: string;
  try {
    const { data: quote } = await deps.db.from("shipping_quotes").select("address_id").eq("id", quoteId).eq("buyer_id", user.id).maybeSingle();
    if (!quote) throw new PaymentsError("Those shipping rates have expired. Get new rates and try again.");
    const taxEnabled = await getSetting<boolean>("tax_collection_enabled", false);
    const result = await startCheckout(deps, {
      buyer: { id: user.id, email: user.email ?? null },
      listingId,
      addressId: quote.address_id,
      quoteId,
      rateId,
      taxEnabled: taxEnabled === true,
    });
    target = result.url;
  } catch (err) {
    target = withFlash(back, "error", friendly(err));
  }
  redirect(target);
}

/** Ends the buyer's own unpaid checkout and releases the item. */
export async function cancelCheckout(form: FormData) {
  const listingId = uuid.parse(form.get("listingId"));
  const orderId = uuid.parse(form.get("orderId"));
  const user = await requireBuyer(listingId);
  const deps = paymentsDeps();
  if (!deps) redirect(checkoutPath(listingId));
  const { data: order } = await deps.db
    .from("orders")
    .select("id, stripe_checkout_session_id, checkout_expires_at, created_at")
    .eq("id", orderId)
    .eq("buyer_id", user.id)
    .eq("order_status", "awaiting_payment")
    .maybeSingle();
  let target = checkoutPath(listingId);
  if (order) {
    const result = await closeUnpaidCheckout(deps, order, "Cancelled by the buyer");
    target =
      result === "paid"
        ? `/account/purchases/${order.id}`
        : withFlash(target, result === "released" ? "notice" : "error", result === "released" ? "Your checkout was cancelled. Nothing was charged." : "That checkout couldn't be cancelled right now. Try again in a minute.");
  }
  redirect(target);
}
