import type { Metadata } from "next";
import { requireStaff } from "@/lib/admin/auth";
import { AdminLater } from "@/components/admin/Later";

export const metadata: Metadata = { title: "Shipping exceptions" };

export default async function ShippingExceptionsPage() {
  await requireStaff(["support"], "/admin/shipping");
  return (
    <AdminLater
      title="Shipping exceptions"
      arrives="shipping labels"
      what={[
        "See paid orders that haven't shipped on time",
        "See packages with failed deliveries, returns to sender or no tracking movement",
        "Contact the buyer or seller and note what was done",
      ]}
    />
  );
}
