import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/EmptyState";
import { AutoRefresh } from "@/components/trust/AutoRefresh";
import { memberNames } from "@/lib/trust/notify";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

type Summary = { conversation_id: string; last_body: string | null; last_sender: string | null; last_at: string | null; unread: number };

export default async function MessagesPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/messages");
  const me = auth.user.id;

  const [{ data: convos }, { data: summaries }] = await Promise.all([
    supabase.from("conversations").select("id, listing_id, buyer_id, seller_id, created_at, last_message_at").order("last_message_at", { ascending: false, nullsFirst: false }).limit(100),
    supabase.rpc("inbox_summary"),
  ]);
  const byId = new Map<string, Summary>(((summaries ?? []) as Summary[]).map((s) => [s.conversation_id, s]));
  const listingIds = [...new Set((convos ?? []).map((c) => c.listing_id).filter(Boolean))] as string[];
  const [{ data: listings }, names] = await Promise.all([
    listingIds.length ? supabase.from("equipment_listings").select("id, title").in("id", listingIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    memberNames((convos ?? []).map((c) => (c.buyer_id === me ? c.seller_id : c.buyer_id))),
  ]);
  const titles = new Map((listings ?? []).map((l) => [l.id, l.title as string]));
  const rows = (convos ?? []).sort((a, b) => new Date(b.last_message_at ?? b.created_at).getTime() - new Date(a.last_message_at ?? a.created_at).getTime());

  return (
    <div className="wrap grid gap-6 py-10">
      <AutoRefresh seconds={10} />
      <div className="grid gap-2">
        <p className="eyebrow">Your account</p>
        <h1 className="display text-5xl font-bold">Messages</h1>
        <p className="text-ink-soft">Conversations about listings. Keep payment on the site; it is the only way you are covered by buyer protection.</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No conversations yet" body="Open a listing and choose Message seller to ask a question." action={{ href: "/shop", label: "Shop equipment" }} />
      ) : (
        <ul className="grid gap-3" data-testid="inbox">
          {rows.map((c) => {
            const other = names.get(c.buyer_id === me ? c.seller_id : c.buyer_id);
            const s = byId.get(c.id);
            return (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className="card grid gap-1 p-4 hover:border-line-strong" data-testid="conversation-row">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold break-words">@{other?.username ?? "member"}</span>
                    {s && s.unread > 0 && (
                      <span className="rounded-sm bg-stamp-red px-2 py-0.5 text-xs font-bold text-white" aria-label={`${s.unread} unread`}>
                        {s.unread} new
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-ink-soft break-words">{c.listing_id ? (titles.get(c.listing_id) ?? "Listing") : "Listing removed"}</span>
                  <span className="break-words text-sm">
                    {s?.last_body ? `${s.last_sender === me ? "You: " : ""}${s.last_body.slice(0, 140)}` : "No messages yet."}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
