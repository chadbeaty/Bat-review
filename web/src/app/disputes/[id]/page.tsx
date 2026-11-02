import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DisputeReply } from "@/components/trust/DisputeForms";
import { EvidenceList } from "@/components/trust/EvidenceList";
import { AutoRefresh } from "@/components/trust/AutoRefresh";
import { CLOSED_DISPUTE_STATUSES, DISPUTE_STATUS_LABELS, DISPUTE_TYPES } from "@/lib/trust/disputes";
import { signedEvidence } from "@/lib/trust/disputes-server";
import { memberNames } from "@/lib/trust/notify";

export const metadata: Metadata = { title: "Case", robots: { index: false } };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

export default async function DisputePage({ params }: PageProps<"/disputes/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/sign-in?next=${encodeURIComponent(`/disputes/${id}`)}`);

  // Row level security only returns cases on orders the member is a party to.
  const { data: dispute } = await supabase
    .from("disputes")
    .select("id, order_id, opened_by, dispute_type, description, evidence_urls, status, resolution, created_at, resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (!dispute) notFound();
  const [{ data: order }, { data: messages }] = await Promise.all([
    supabase.from("orders").select("order_number, buyer_id, seller_id").eq("id", dispute.order_id).maybeSingle(),
    supabase.from("dispute_messages").select("id, author_id, author_role, body, created_at").eq("dispute_id", id).order("created_at", { ascending: true }),
  ]);
  const names = await memberNames([dispute.opened_by, ...(messages ?? []).map((m) => m.author_id)]);
  const evidence = await signedEvidence(dispute.evidence_urls ?? []);
  const closed = CLOSED_DISPUTE_STATUSES.includes(dispute.status);
  const isParty = order && [order.buyer_id, order.seller_id].includes(auth.user.id);

  return (
    <div className="wrap grid max-w-3xl gap-6 py-10">
      <AutoRefresh seconds={10} />
      <div className="grid gap-2">
        <p className="eyebrow">Order {order?.order_number}</p>
        <h1 className="display text-4xl font-bold">{DISPUTE_TYPES[dispute.dispute_type] ?? "Case"}</h1>
        <p>
          <span className="rounded-sm border border-line-strong px-2 py-0.5 text-sm font-medium" data-testid="dispute-status">
            {DISPUTE_STATUS_LABELS[dispute.status] ?? dispute.status}
          </span>{" "}
          <span className="text-sm text-ink-soft">
            Opened {when(dispute.created_at)} by @{names.get(dispute.opened_by)?.username ?? "member"}
          </span>
        </p>
      </div>

      <section className="card grid gap-3 p-4" aria-label="Description">
        <p className="whitespace-pre-line break-words">{dispute.description}</p>
        <EvidenceList items={evidence} />
      </section>

      {dispute.resolution && (
        <section className="rounded-lg border border-success/30 bg-success/5 p-4" aria-label="Resolution" data-testid="resolution">
          <h2 className="font-semibold">Resolution</h2>
          <p className="whitespace-pre-line break-words">{dispute.resolution}</p>
          <p className="mt-2 text-sm text-ink-soft">
            Refunds, if any, are issued by our team and appear on your order.
          </p>
        </section>
      )}

      <section className="grid gap-3" aria-label="Messages">
        <h2 className="display text-2xl font-bold">Messages</h2>
        <ol className="grid gap-3" data-testid="dispute-thread">
          {(messages ?? []).length === 0 && <li className="text-ink-soft">No replies yet.</li>}
          {(messages ?? []).map((m) => (
            <li key={m.id} className={`grid gap-1 rounded-lg border p-3 ${m.author_role === "support" ? "border-line-strong bg-surface" : "border-line"}`}>
              <p className="whitespace-pre-line break-words">{m.body}</p>
              <p className="text-xs text-ink-soft">
                {m.author_role === "support" ? "Support team" : `@${names.get(m.author_id)?.username ?? "member"} (${m.author_role})`} · {when(m.created_at)}
              </p>
            </li>
          ))}
        </ol>
        {isParty && !closed ? <DisputeReply disputeId={id} /> : null}
        {closed && <p className="text-sm text-ink-soft">This case is closed.</p>}
      </section>
      <Link href="/account" className="text-sm font-semibold underline">
        Back to your account
      </Link>
    </div>
  );
}
