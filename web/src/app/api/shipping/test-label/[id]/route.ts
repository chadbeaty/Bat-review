import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fakeLabelPdf } from "@/lib/shipping/fake";

// The PDF for a test label from the fake shipping provider. It says "TEST DATA - NOT A REAL LABEL" in large
// type. Only the order's buyer, seller or support staff can open it (RLS on shipping_shipments decides).

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/shipping/test-label/[id]">) {
  const { id } = await ctx.params;
  if (!/^fake_tx_[a-f0-9]{32}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  if (!supabase) return new NextResponse("Not found", { status: 404 });
  const { data: shipment } = await supabase
    .from("shipping_shipments")
    .select("carrier, service_level, tracking_number, is_test, orders(order_number)")
    .eq("provider_transaction_id", id)
    .maybeSingle();
  if (!shipment || !shipment.is_test) return new NextResponse("Not found", { status: 404 });
  const orderNumber = (shipment.orders as unknown as { order_number: string } | null)?.order_number ?? "";
  const pdf = fakeLabelPdf([
    `Order ${orderNumber}`,
    `${shipment.carrier ?? ""} ${shipment.service_level ?? ""}`,
    `Tracking (test): ${shipment.tracking_number ?? ""}`,
  ]);
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="test-label-${orderNumber}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
