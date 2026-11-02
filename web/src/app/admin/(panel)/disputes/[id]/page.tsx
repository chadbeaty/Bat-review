import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { readFlash } from "@/lib/admin/action";
import { AdminTitle, Badge, Flash, ReturnTo, SubmitButton, dateTime } from "@/components/admin/ui";
import { EvidenceList } from "@/components/trust/EvidenceList";
import { DISPUTE_STATUS_LABELS, DISPUTE_TYPES } from "@/lib/trust/disputes";
import { signedEvidence } from "@/lib/trust/disputes-server";
import { formatPrice } from "@/lib/format";
import { addDisputeMessage, updateDispute } from "../actions";

export const metadata: Metadata = { title: "Case" };

export default async function AdminDisputePage({ params, searchParams }: PageProps<"/admin/disputes/[id]">) {
  const { id } = await params;
  await requireStaff(["support"], `/admin/disputes/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const db = adminDb();
  const { data: d } = await db.from("disputes").select("*").eq("id", id).maybeSingle();
  if (!d) notFound();
  const [{ data: order }, { data: messages }] = await Promise.all([
    db.from("orders").select("id, order_number, buyer_id, seller_id, order_status, total_amount_cents, refunded_amount_cents").eq("id", d.order_id).maybeSingle(),
    db.from("dispute_messages").select("id, author_id, author_role, body, created_at").eq("dispute_id", id).order("created_at", { ascending: true }),
  ]);
  const ids = [order?.buyer_id, order?.seller_id].filter(Boolean) as string[];
  const { data: profiles } = ids.length ? await db.from("profiles").select("id, username").in("id", ids) : { data: [] };
  const name = new Map((profiles ?? []).map((p) => [p.id, p.username as string]));
  const evidence = await signedEvidence(d.evidence_urls ?? []);
  const here = `/admin/disputes/${id}`;

  return (
    <>
      <AdminTitle title={`Case: order ${order?.order_number ?? ""}`} intro={DISPUTE_TYPES[d.dispute_type] ?? d.dispute_type}>
        <Link href="/admin/disputes" className="underline">
          All cases
        </Link>
      </AdminTitle>
      <Flash flash={readFlash(sp)} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card grid content-start gap-2 p-4">
          <h2 className="font-semibold">Case</h2>
          <p>
            <Badge tone="neutral">{DISPUTE_STATUS_LABELS[d.status] ?? d.status}</Badge> opened {dateTime(d.created_at)}
          </p>
          {order && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-soft">Buyer</dt>
              <dd>
                <Link href={`/admin/users/${order.buyer_id}`} className="underline">
                  @{name.get(order.buyer_id)}
                </Link>
              </dd>
              <dt className="text-ink-soft">Seller</dt>
              <dd>
                <Link href={`/admin/users/${order.seller_id}`} className="underline">
                  @{name.get(order.seller_id)}
                </Link>
              </dd>
              <dt className="text-ink-soft">Order</dt>
              <dd>
                {order.order_status} · {formatPrice(order.total_amount_cents)} (refunded {formatPrice(order.refunded_amount_cents)})
              </dd>
            </dl>
          )}
          <p className="whitespace-pre-line break-words">{d.description}</p>
          <EvidenceList items={evidence} />
          <p className="text-sm">
            To refund the buyer, use the{" "}
            <Link href="/admin/refunds" className="font-semibold underline">
              Refunds
            </Link>{" "}
            page. Resolving a case does not move money.
          </p>
        </section>

        <section className="card grid content-start gap-3 p-4">
          <h2 className="font-semibold">Decide</h2>
          <form action={updateDispute} className="grid gap-2">
            <ReturnTo path={here} />
            <input type="hidden" name="disputeId" value={id} />
            <label className="field" htmlFor="status">
              <span>Status</span>
              <select id="status" name="status" defaultValue={d.status} className="input">
                {Object.entries(DISPUTE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="adminNotes">
              <span>Internal notes (members never see these)</span>
              <textarea id="adminNotes" name="adminNotes" rows={3} maxLength={3000} defaultValue={d.admin_notes ?? ""} className="input" />
            </label>
            <label className="field" htmlFor="resolution">
              <span>Resolution (shown to both members; required to close)</span>
              <textarea id="resolution" name="resolution" rows={3} maxLength={3000} defaultValue={d.resolution ?? ""} className="input" />
            </label>
            <SubmitButton>Save case</SubmitButton>
          </form>
        </section>
      </div>

      <section className="grid gap-3">
        <h2 className="display text-2xl font-bold">Messages</h2>
        <ol className="grid gap-2">
          {(messages ?? []).length === 0 && <li className="text-ink-soft">No messages.</li>}
          {(messages ?? []).map((m) => (
            <li key={m.id} className="rounded-lg border border-line p-3">
              <p className="whitespace-pre-line break-words">{m.body}</p>
              <p className="text-xs text-ink-soft">
                {m.author_role === "support" ? "Support" : `@${name.get(m.author_id) ?? "member"} (${m.author_role})`} · {dateTime(m.created_at)}
              </p>
            </li>
          ))}
        </ol>
        <form action={addDisputeMessage} className="grid gap-2">
          <ReturnTo path={here} />
          <input type="hidden" name="disputeId" value={id} />
          <label className="field" htmlFor="admin-reply">
            <span>Message to both members</span>
            <textarea id="admin-reply" name="body" rows={3} maxLength={4000} required className="input" />
          </label>
          <SubmitButton tone="outline">Send message</SubmitButton>
        </form>
      </section>
    </>
  );
}
