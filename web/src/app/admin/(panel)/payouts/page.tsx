import type { Metadata } from "next";
import { requireStaff } from "@/lib/admin/auth";
import { AdminLater } from "@/components/admin/Later";

export const metadata: Metadata = { title: "Payouts" };

export default async function PayoutsPage() {
  await requireStaff(["admin"], "/admin/payouts");
  return (
    <AdminLater
      title="Payouts"
      arrives="checkout"
      what={[
        "See each seller's Stripe onboarding status and whether payouts are enabled",
        "See transfers to sellers for completed orders, and any that failed",
        "Hold payouts for a seller under review",
      ]}
    />
  );
}
