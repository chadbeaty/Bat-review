import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { DisputeForm } from "@/components/trust/DisputeForms";

export const metadata: Metadata = { title: "Report a problem", robots: { index: false } };

const OPENABLE = ["paid", "processing", "shipped", "delivered", "completed"];

export default async function NewDisputePage({ searchParams }: PageProps<"/disputes/new">) {
  const sp = await searchParams;
  const orderId = typeof sp.order === "string" ? sp.order : "";
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound();
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/sign-in?next=${encodeURIComponent(`/disputes/new?order=${orderId}`)}`);

  const { data: order } = await supabase.from("orders").select("id, order_number, buyer_id, seller_id, order_status").eq("id", orderId).maybeSingle();
  if (!order || ![order.buyer_id, order.seller_id].includes(auth.user.id)) notFound();
  const { data: existing } = await supabase.from("disputes").select("id, status").eq("order_id", orderId).order("created_at", { ascending: false });

  return (
    <div className="wrap grid max-w-2xl gap-6 py-10">
      <div className="grid gap-2">
        <p className="eyebrow">Order {order.order_number}</p>
        <h1 className="display text-4xl font-bold">Report a problem</h1>
        <p className="text-ink-soft">
          Tell us what went wrong and attach photos if you can. The other member is notified and can reply. Our team reviews the case; refunds are decided by a person, not automatically.
        </p>
      </div>
      {existing?.length ? (
        <p role="status" className="rounded-md border border-line-strong bg-surface px-3 py-2">
          There {existing.length === 1 ? "is already a case" : "are already cases"} on this order:{" "}
          {existing.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <Link href={`/disputes/${d.id}`} className="font-semibold underline">
                view case {i + 1}
              </Link>
            </span>
          ))}
          .
        </p>
      ) : null}
      {OPENABLE.includes(order.order_status) ? (
        <DisputeForm orderId={orderId} userId={auth.user.id} disputeId={randomUUID()} />
      ) : (
        <p role="status" className="rounded-md border border-line-strong bg-surface px-3 py-2">
          A case can be opened once the order has been paid.
        </p>
      )}
    </div>
  );
}
