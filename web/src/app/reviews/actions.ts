"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import * as trustTemplates from "@/lib/email/trust-templates";
import { friendlyDbError } from "@/lib/trust/errors";
import { memberNames, notify } from "@/lib/trust/notify";
import type { FormState } from "@/components/trust/StatefulForm";

const uuid = z.string().uuid();

/** Leaves the signed-in member's review of the other party of a completed order. The database checks everything. */
export async function submitReview(_prev: FormState, form: FormData): Promise<FormState> {
  const orderId = String(form.get("orderId") ?? "");
  const rating = Number(form.get("rating"));
  const text = String(form.get("text") ?? "").trim();
  if (!uuid.safeParse(orderId).success) return { error: "That order could not be found." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Choose a rating from 1 to 5 stars." };
  if (text.length > 2000) return { error: "Reviews can be up to 2,000 characters." };
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { error: "Sign in to leave a review." };

  const { data: order } = await supabase.from("orders").select("id, buyer_id, seller_id, order_status").eq("id", orderId).maybeSingle();
  if (!order || ![order.buyer_id, order.seller_id].includes(user.id)) return { error: "That order could not be found." };
  if (order.order_status !== "completed") return { error: "You can review an order once it is completed." };
  const reviewed = order.buyer_id === user.id ? order.seller_id : order.buyer_id;

  const { error } = await supabase
    .from("reviews")
    .insert({ order_id: orderId, reviewer_id: user.id, reviewed_user_id: reviewed, reviewer_role: order.buyer_id === user.id ? "buyer" : "seller", rating, review_text: text || null });
  if (error) {
    if (error.code === "23505") return { error: "You already reviewed this order." };
    return { error: friendlyDbError(error, "Your review could not be saved.") };
  }
  const names = await memberNames([user.id, reviewed]);
  const from = names.get(user.id)?.username ?? "a member";
  const to = names.get(reviewed)?.username;
  await notify({
    userId: reviewed,
    type: "review_received",
    title: `@${from} left you a ${rating}-star review`,
    message: text ? text.slice(0, 140) : null,
    link: to ? `/sellers/${encodeURIComponent(to)}#reviews-heading` : "/account/notifications",
    entityId: orderId,
    email: (name) => trustTemplates.reviewReceived({ name, fromUsername: from, rating, reviewsPath: to ? `/sellers/${encodeURIComponent(to)}#reviews-heading` : "/account" }),
  });
  revalidatePath("/reviews/new");
  if (to) revalidatePath(`/sellers/${to}`);
  return { ok: "Thanks. Your review is published on their profile.", nonce: Date.now() };
}

/** The reviewed member adds one public response to a review of them. */
export async function respondToReview(_prev: FormState, form: FormData): Promise<FormState> {
  const reviewId = String(form.get("reviewId") ?? "");
  const response = String(form.get("response") ?? "").trim();
  if (!uuid.safeParse(reviewId).success) return { error: "That review could not be found." };
  if (response.length < 2 || response.length > 1000) return { error: "Write a response of up to 1,000 characters." };
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { error: "Sign in first." };
  const { data, error } = await supabase
    .from("reviews")
    .update({ response_text: response })
    .eq("id", reviewId)
    .eq("reviewed_user_id", user.id)
    .is("response_text", null)
    .select("id")
    .maybeSingle();
  if (error) return { error: friendlyDbError(error, "Your response could not be saved.") };
  if (!data) return { error: "You can only respond once to a review of you." };
  const names = await memberNames([user.id]);
  const name = names.get(user.id)?.username;
  if (name) revalidatePath(`/sellers/${name}`);
  return { ok: "Response posted.", nonce: Date.now() };
}

export async function reportReview(_prev: FormState, form: FormData): Promise<FormState> {
  const reviewId = String(form.get("reviewId") ?? "");
  const details = String(form.get("details") ?? "").trim().slice(0, 2000);
  if (!uuid.safeParse(reviewId).success) return { error: "That review could not be found." };
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { error: "Sign in to report a review." };
  const { error } = await supabase
    .from("reports")
    .insert({ reporter_id: user.id, entity_type: "review", entity_id: reviewId, reason: "other", details: details || "Reported review" });
  if (error) return { error: friendlyDbError(error, "Your report could not be sent.") };
  return { ok: "Thanks. Our moderators will look at this review.", nonce: Date.now() };
}
