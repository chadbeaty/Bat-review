import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReviewForm } from "@/components/trust/ReviewForms";
import { memberNames } from "@/lib/trust/notify";
import { sellerPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Leave a review", robots: { index: false } };

export default async function NewReviewPage({ searchParams }: PageProps<"/reviews/new">) {
  const sp = await searchParams;
  const orderId = typeof sp.order === "string" ? sp.order : "";
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound();
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/sign-in?next=${encodeURIComponent(`/reviews/new?order=${orderId}`)}`);
  const me = auth.user.id;

  const { data: order } = await supabase.from("orders").select("id, order_number, buyer_id, seller_id, order_status").eq("id", orderId).maybeSingle();
  if (!order || ![order.buyer_id, order.seller_id].includes(me)) notFound();
  const otherId = order.buyer_id === me ? order.seller_id : order.buyer_id;
  const [names, { data: existing }, { data: items }] = await Promise.all([
    memberNames([otherId]),
    supabase.from("reviews").select("id, rating, review_text").eq("order_id", orderId).eq("reviewer_id", me).maybeSingle(),
    supabase.from("order_items").select("product_title_snapshot").eq("order_id", orderId),
  ]);
  const other = names.get(otherId)?.username ?? "member";

  return (
    <div className="wrap grid max-w-2xl gap-6 py-10">
      <div className="grid gap-2">
        <p className="eyebrow">Order {order.order_number}</p>
        <h1 className="display text-4xl font-bold break-words">Review @{other}</h1>
        {items?.length ? <p className="text-ink-soft break-words">{items.map((i) => i.product_title_snapshot).join(", ")}</p> : null}
      </div>
      {order.order_status !== "completed" ? (
        <p role="status" className="rounded-md border border-line-strong bg-surface px-3 py-2">
          You can leave a review once this order is completed.
        </p>
      ) : existing ? (
        <div className="card grid gap-2 p-4" data-testid="existing-review">
          <p className="font-semibold">You already reviewed this order.</p>
          <p aria-label={`${existing.rating} out of 5`}>{"★".repeat(existing.rating)}</p>
          {existing.review_text && <p className="whitespace-pre-line break-words">{existing.review_text}</p>}
          <Link href={sellerPath(other)} className="text-sm font-semibold underline">
            View @{other}&apos;s profile
          </Link>
        </div>
      ) : (
        <ReviewForm orderId={orderId} otherUsername={other} />
      )}
    </div>
  );
}
