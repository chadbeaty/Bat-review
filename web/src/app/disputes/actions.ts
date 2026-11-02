"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { templates } from "@/lib/email";
import * as trustTemplates from "@/lib/email/trust-templates";
import { friendlyDbError } from "@/lib/trust/errors";
import { memberNames, notify } from "@/lib/trust/notify";
import { DISPUTE_TYPES, validEvidencePaths } from "@/lib/trust/disputes";
import type { FormState } from "@/components/trust/StatefulForm";

const uuid = z.string().uuid();

/**
 * Opens a case on an order. Photos were already uploaded by the browser to <user id>/<dispute id>/ in the private
 * evidence bucket; this checks the paths and creates the case (row level security checks the member is a party).
 */
export async function openDispute(_prev: FormState, form: FormData): Promise<FormState> {
  const orderId = String(form.get("orderId") ?? "");
  const disputeId = String(form.get("disputeId") ?? "");
  const type = String(form.get("type") ?? "");
  const description = String(form.get("description") ?? "").trim();
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(disputeId).success) return { error: "That order could not be found." };
  if (!(type in DISPUTE_TYPES)) return { error: "Choose what went wrong." };
  if (description.length < 10 || description.length > 5000) return { error: "Describe what happened in 10 to 5,000 characters." };
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { error: "Sign in to open a case." };

  let paths: string[] = [];
  try {
    const parsed = validEvidencePaths(JSON.parse(String(form.get("evidence") || "[]")), user.id, disputeId);
    if (!parsed) return { error: "One of the photos could not be attached. Try uploading it again." };
    paths = parsed;
  } catch {
    return { error: "One of the photos could not be attached. Try uploading it again." };
  }

  const { data: order } = await supabase.from("orders").select("id, order_number, buyer_id, seller_id").eq("id", orderId).maybeSingle();
  if (!order || ![order.buyer_id, order.seller_id].includes(user.id)) return { error: "That order could not be found." };

  const { error } = await supabase
    .from("disputes")
    .insert({ id: disputeId, order_id: orderId, opened_by: user.id, dispute_type: type, description, evidence_urls: paths });
  if (error) {
    if (error.code === "23505") redirect(`/disputes/${disputeId}`);
    return { error: /row-level security/i.test(error.message) ? "A case can only be opened on an order that has been paid." : friendlyDbError(error, "Your case could not be opened.") };
  }

  const role = user.id === order.buyer_id ? "buyer" : "seller";
  const otherId = role === "buyer" ? order.seller_id : order.buyer_id;
  const names = await memberNames([user.id]);
  const respondBy = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
  await notify({
    userId: otherId,
    type: "dispute_opened",
    title: `A problem was reported on order ${order.order_number}`,
    message: `${DISPUTE_TYPES[type]}. Respond by ${respondBy}.`,
    link: `/disputes/${disputeId}`,
    entityId: disputeId,
    email: (name) =>
      templates.disputeNotification({ name, orderNumber: order.order_number, disputeType: DISPUTE_TYPES[type], role: role === "buyer" ? "seller" : "buyer", respondBy, disputePath: `/disputes/${disputeId}` }),
  });
  await notify({
    userId: user.id,
    type: "dispute_opened",
    title: `You opened a case on order ${order.order_number}`,
    message: `Support will review it. Opened by @${names.get(user.id)?.username ?? "you"}.`,
    link: `/disputes/${disputeId}`,
    entityId: disputeId,
  });
  redirect(`/disputes/${disputeId}`);
}

/** A reply from the buyer or seller on their case. */
export async function postDisputeMessage(_prev: FormState, form: FormData): Promise<FormState> {
  const disputeId = String(form.get("disputeId") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!uuid.safeParse(disputeId).success) return { error: "That case could not be found." };
  if (!body) return { error: "Write a message first." };
  if (body.length > 4000) return { error: "Messages can be up to 4,000 characters." };
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { error: "Sign in first." };

  const { data: dispute } = await supabase.from("disputes").select("id, order_id").eq("id", disputeId).maybeSingle();
  if (!dispute) return { error: "That case could not be found." };
  const { data: order } = await supabase.from("orders").select("order_number, buyer_id, seller_id").eq("id", dispute.order_id).maybeSingle();
  const { error } = await supabase.from("dispute_messages").insert({ dispute_id: disputeId, author_id: user.id, author_role: "buyer", body });
  if (error) return { error: friendlyDbError(error, "Your message could not be sent.") };
  if (order) {
    const otherId = user.id === order.buyer_id ? order.seller_id : order.buyer_id;
    await notify({
      userId: otherId,
      type: "dispute_updated",
      title: `New reply on the case for order ${order.order_number}`,
      message: body.slice(0, 140),
      link: `/disputes/${disputeId}`,
      entityId: disputeId,
      email: (name) => trustTemplates.disputeUpdated({ name, orderNumber: order.order_number, summary: "The other party replied on your case.", disputePath: `/disputes/${disputeId}` }),
    });
  }
  revalidatePath(`/disputes/${disputeId}`);
  return { ok: "", nonce: Date.now() };
}
