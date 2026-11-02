import type { Metadata } from "next";
import { requireStaff } from "@/lib/admin/auth";
import { AdminLater } from "@/components/admin/Later";

export const metadata: Metadata = { title: "Refunds" };

export default async function RefundsPage() {
  await requireStaff(["support"], "/admin/refunds");
  return (
    <AdminLater
      title="Refunds"
      arrives="checkout"
      what={[
        "Find an order and see what was paid, the commission and the seller's payout",
        "Issue a full or partial refund through Stripe, with a confirmation step and a reason",
        "See every refund in the audit log",
      ]}
    />
  );
}
