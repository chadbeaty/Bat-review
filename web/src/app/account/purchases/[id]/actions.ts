"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { withFlash } from "@/lib/admin/action";
import { getCurrentUser } from "@/lib/supabase/server";
import { paymentsDeps } from "@/lib/payments/server";
import { completeOrder } from "@/lib/payments/completion";

/** The buyer confirms the item arrived as described. The seller is paid straight away instead of after the window. */
export async function confirmReceived(form: FormData) {
  const orderId = z.string().uuid().parse(form.get("orderId"));
  const path = `/account/purchases/${orderId}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  const deps = paymentsDeps();
  if (!deps) redirect(withFlash(path, "error", "Payments aren't configured."));
  const { error } = await deps.db.rpc("orders_buyer_confirm_received", { p_buyer: user.id, p_order: orderId });
  if (error) redirect(withFlash(path, "error", error.message));
  const result = await completeOrder(deps, orderId);
  redirect(
    withFlash(
      path,
      "notice",
      result.outcome === "completed" || result.outcome === "already_completed"
        ? "Thanks for confirming. The order is complete and the seller is being paid."
        : "Thanks for confirming. We'll finish the order shortly."
    )
  );
}
