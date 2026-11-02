"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { withFlash } from "@/lib/admin/action";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { parseAddressForm, toProviderAddress } from "@/lib/shipping/address";
import { buyLabel } from "@/lib/shipping/labels";
import { PaymentsError } from "@/lib/payments/deps";
import { paymentsDeps } from "@/lib/payments/server";

const uuid = z.string().uuid();

/** Saves the seller's return (ship-from) address, needed on every label. */
export async function saveReturnAddress(form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  const path = `/seller/orders/${orderId}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  const parsed = parseAddressForm(form);
  if (!parsed.ok) redirect(withFlash(path, "error", parsed.error));
  const supabase = (await createClient())!;
  const { error } = await supabase.from("addresses").insert({ user_id: user.id, address_type: "return", ...parsed.value, is_default: true });
  redirect(withFlash(path, error ? "error" : "notice", error ? "The address couldn't be saved." : "Return address saved."));
}

/** Buys the label after the seller's explicit click. Paid by the marketplace from the buyer's shipping payment. */
export async function buyLabelAction(form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  const path = `/seller/orders/${orderId}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  if (form.get("confirm") !== "yes") redirect(withFlash(path, "error", "Confirm the package details before buying the label."));
  const deps = paymentsDeps();
  if (!deps) redirect(withFlash(path, "error", "Shipping isn't configured."));
  const supabase = (await createClient())!;
  const { data: from } = await supabase
    .from("addresses")
    .select("full_name, street_address, apartment, city, state, postal_code, phone")
    .eq("user_id", user.id)
    .eq("address_type", "return")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!from) redirect(withFlash(path, "error", "Add your return address first."));

  let message: string;
  let kind: "notice" | "error" = "notice";
  try {
    const label = await buyLabel(deps, { sellerId: user.id, orderId, from: { ...toProviderAddress(from), email: user.email ?? null } });
    message = `Label bought. Tracking number ${label.trackingNumber}.`;
  } catch (err) {
    kind = "error";
    message = err instanceof PaymentsError ? err.message : "The label couldn't be bought. Nothing was charged to you; try again.";
  }
  redirect(withFlash(path, kind, message));
}
