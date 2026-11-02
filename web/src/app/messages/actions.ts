"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { templates } from "@/lib/email";
import { friendlyDbError } from "@/lib/trust/errors";
import { detectOffPlatformPayment } from "@/lib/trust/flags";
import { memberNames, notify } from "@/lib/trust/notify";
import type { FormState } from "@/components/trust/StatefulForm";

const uuid = z.string().uuid();

/** Starts (or reopens) the signed-in member's conversation with the seller of a listing. */
export async function startConversation(form: FormData): Promise<void> {
  const listingId = String(form.get("listingId") ?? "");
  if (!uuid.safeParse(listingId).success) redirect("/shop");
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/listings/${listingId}`)}`);
  const supabase = await createClient();
  if (!supabase) redirect(`/listings/${listingId}`);

  const { data: listing } = await supabase.from("equipment_listings").select("id, seller_id").eq("id", listingId).maybeSingle();
  if (!listing) redirect("/shop");
  if (listing.seller_id === user.id) redirect(`/listings/${listingId}`);

  const { data: existing } = await supabase.from("conversations").select("id").eq("listing_id", listingId).eq("buyer_id", user.id).maybeSingle();
  if (existing) redirect(`/messages/${existing.id}`);

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ listing_id: listingId, buyer_id: user.id, seller_id: listing.seller_id })
    .select("id")
    .single();
  if (error || !created) redirect(`/listings/${listingId}?message=unavailable`);
  redirect(`/messages/${created.id}`);
}

/** Sends a message in a conversation the member belongs to. The database enforces blocks and the rate limit. */
export async function sendMessage(_prev: FormState, form: FormData): Promise<FormState> {
  const conversationId = String(form.get("conversationId") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!uuid.safeParse(conversationId).success) return { error: "That conversation could not be found." };
  if (!body) return { error: "Write a message first." };
  if (body.length > 4000) return { error: "Messages can be up to 4,000 characters." };
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { error: "Sign in to send messages." };

  const { data: message, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, recipient_id: user.id, message_text: body })
    .select("id, recipient_id, conversation_id")
    .single();
  if (error || !message) return { error: friendlyDbError(error, "Your message could not be sent.") };

  // Side effects run with the service role and never fail the send.
  const db = createAdminClient();
  const terms = detectOffPlatformPayment(body);
  if (db && terms.length) {
    await db.from("reports").insert({
      reporter_id: user.id,
      entity_type: "message",
      entity_id: message.id,
      reason: "off_platform_payment",
      details: `Automatically flagged: the message mentions ${terms.join(", ")}. Conversation ${conversationId}.`,
      source: "auto",
    });
  }
  const { data: convo } = await supabase.from("conversations").select("listing_id").eq("id", conversationId).maybeSingle();
  const [{ data: listing }, names] = await Promise.all([
    db && convo?.listing_id ? db.from("equipment_listings").select("title").eq("id", convo.listing_id).maybeSingle() : Promise.resolve({ data: null }),
    memberNames([user.id]),
  ]);
  const from = names.get(user.id)?.username ?? "a member";
  const title = listing?.title ?? "a listing";
  await notify({
    userId: message.recipient_id,
    type: "new_message",
    title: `New message from @${from}`,
    message: body.slice(0, 140),
    link: `/messages/${conversationId}`,
    entityId: conversationId,
    dedupe: true,
    email: (name) => templates.newMessage({ name, fromUsername: from, listingTitle: title, preview: body, conversationPath: `/messages/${conversationId}` }),
  });
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/messages");
  return { ok: "", nonce: Date.now() };
}

export async function blockMember(_prev: FormState, form: FormData): Promise<FormState> {
  const userId = String(form.get("userId") ?? "");
  const conversationId = String(form.get("conversationId") ?? "");
  if (!uuid.safeParse(userId).success) return { error: "Unknown member." };
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { error: "Sign in first." };
  if (userId === user.id) return { error: "You can't block yourself." };
  const { error } = await supabase.from("user_blocks").upsert({ blocker_id: user.id, blocked_id: userId }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
  if (error) return { error: friendlyDbError(error) };
  if (uuid.safeParse(conversationId).success) revalidatePath(`/messages/${conversationId}`);
  return { ok: "Member blocked. They can no longer message you or make offers.", nonce: Date.now() };
}

export async function unblockMember(_prev: FormState, form: FormData): Promise<FormState> {
  const userId = String(form.get("userId") ?? "");
  const conversationId = String(form.get("conversationId") ?? "");
  if (!uuid.safeParse(userId).success) return { error: "Unknown member." };
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { error: "Sign in first." };
  const { error } = await supabase.from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", userId);
  if (error) return { error: friendlyDbError(error) };
  if (uuid.safeParse(conversationId).success) revalidatePath(`/messages/${conversationId}`);
  return { ok: "Member unblocked.", nonce: Date.now() };
}

const REPORT_REASONS = ["harassment", "spam", "off_platform_payment", "counterfeit", "other"] as const;

export async function reportConversation(_prev: FormState, form: FormData): Promise<FormState> {
  const conversationId = String(form.get("conversationId") ?? "");
  const reason = String(form.get("reason") ?? "");
  const details = String(form.get("details") ?? "").trim().slice(0, 2000);
  if (!uuid.safeParse(conversationId).success || !(REPORT_REASONS as readonly string[]).includes(reason)) return { error: "Choose a reason for the report." };
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { error: "Sign in first." };
  // The conversation must be one the member belongs to (row level security hides it otherwise).
  const { data: convo } = await supabase.from("conversations").select("id").eq("id", conversationId).maybeSingle();
  if (!convo) return { error: "That conversation could not be found." };
  const { error } = await supabase
    .from("reports")
    .insert({ reporter_id: user.id, entity_type: "conversation", entity_id: conversationId, reason, details: details || null });
  if (error) return { error: friendlyDbError(error, "Your report could not be sent.") };
  return { ok: "Thanks. Our moderators will review this conversation.", nonce: Date.now() };
}
