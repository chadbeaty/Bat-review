import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "@/components/trust/AutoRefresh";
import { BlockControl, Composer, ReportConversation } from "@/components/trust/ThreadTools";
import { markConversationRead } from "@/lib/trust/inbox";
import { memberNames } from "@/lib/trust/notify";
import { formatPrice } from "@/lib/format";
import { listingPath, sellerPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Conversation", robots: { index: false } };

export default async function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/sign-in?next=${encodeURIComponent(`/messages/${id}`)}`);
  const me = auth.user.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: convo } = await supabase.from("conversations").select("id, listing_id, buyer_id, seller_id").eq("id", id).maybeSingle();
  if (!convo || ![convo.buyer_id, convo.seller_id].includes(me)) notFound();
  const otherId = convo.buyer_id === me ? convo.seller_id : convo.buyer_id;

  await markConversationRead(id, me);
  const [{ data: messages }, { data: listing }, names, { data: myBlock }, { data: blockedMe }] = await Promise.all([
    supabase.from("messages").select("id, sender_id, message_text, created_at, read_at").eq("conversation_id", id).order("created_at", { ascending: true }).limit(500),
    convo.listing_id ? supabase.from("equipment_listings").select("id, title, asking_price_cents, listing_status").eq("id", convo.listing_id).maybeSingle() : Promise.resolve({ data: null }),
    memberNames([otherId]),
    supabase.from("user_blocks").select("blocked_id").eq("blocker_id", me).eq("blocked_id", otherId).maybeSingle(),
    supabase.from("user_blocks").select("blocker_id").eq("blocker_id", otherId).eq("blocked_id", me).maybeSingle(),
  ]);
  const other = names.get(otherId);
  const username = other?.username ?? "member";
  const iBlocked = Boolean(myBlock);
  const disabledReason = iBlocked
    ? `You blocked @${username}. Unblock them to send messages.`
    : blockedMe
      ? "This member is not accepting messages from you."
      : undefined;

  return (
    <div className="wrap grid max-w-3xl gap-5 py-8">
      <AutoRefresh seconds={5} />
      <div className="grid gap-1">
        <Link href="/messages" className="text-sm font-semibold underline">
          All messages
        </Link>
        <h1 className="display text-4xl font-bold break-words">@{username}</h1>
        {listing && (
          <p className="text-ink-soft break-words">
            About{" "}
            <Link href={listingPath(listing.id)} className="font-semibold underline">
              {listing.title}
            </Link>{" "}
            · {formatPrice(listing.asking_price_cents)}
          </p>
        )}
        {other && (
          <Link href={sellerPath(other.username)} className="text-sm underline">
            View profile
          </Link>
        )}
      </div>

      <ol className="grid gap-3" aria-label="Messages" data-testid="thread">
        {(messages ?? []).length === 0 && <li className="text-ink-soft">No messages yet. Say hello.</li>}
        {(messages ?? []).map((m) => {
          const mine = m.sender_id === me;
          return (
            <li key={m.id} className={`grid max-w-[85%] gap-1 rounded-lg border p-3 ${mine ? "justify-self-end border-line-strong bg-surface" : "justify-self-start border-line bg-paper"}`}>
              <p className="whitespace-pre-line break-words">{m.message_text}</p>
              <p className="text-xs text-ink-soft">
                {mine ? "You" : `@${username}`} ·{" "}
                {new Date(m.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
                {mine && m.read_at ? " · Read" : ""}
              </p>
            </li>
          );
        })}
      </ol>

      <Composer conversationId={id} disabledReason={disabledReason} />

      <div className="grid gap-3 border-t border-line pt-4">
        <BlockControl conversationId={id} userId={otherId} username={username} blocked={iBlocked} />
        <ReportConversation conversationId={id} />
      </div>
    </div>
  );
}
