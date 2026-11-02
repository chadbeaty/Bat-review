import type { Metadata } from "next";
import { requireStaff } from "@/lib/admin/auth";
import { AdminLater } from "@/components/admin/Later";

export const metadata: Metadata = { title: "Disputes" };

export default async function DisputesPage() {
  await requireStaff(["support"], "/admin/disputes");
  return (
    <AdminLater
      title="Disputes"
      arrives="checkout"
      what={[
        "Work the queue of problem reports (not received, not as described, damaged, counterfeit) and card chargebacks",
        "Read both sides, the listing's condition answers and photos, and the tracking history",
        "Decide for the buyer or the seller, with notes, and trigger a refund when needed",
      ]}
    />
  );
}
