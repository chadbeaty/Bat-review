"use server";

import { z } from "zod";
import { refresh } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { HIT_BUCKETS, ownerReportErrorMessage } from "@/lib/owner-reports";

// Member actions on a bat model page: First Swings reports, review alerts and the watchlist.
// Each one checks the signed-in user and writes through the RLS-scoped client, so the database rules
// (one check-in per 7 days, own rows only, published products only) are enforced there too.

export type ActionState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string> };

const uuid = z.string().uuid();
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), schema.optional());
const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v), z.string().max(max).optional());

const reportSchema = z.object({
  productId: uuid,
  weightOz: optionalNumber(z.number().min(18, "Weight must be between 18 and 40 oz").max(40, "Weight must be between 18 and 40 oz")),
  hitsSoFar: z.coerce
    .number()
    .refine((v) => HIT_BUCKETS.some((b) => b.value === v), "Choose how many hits it has"),
  stillBreakingIn: z.enum(["yes", "no", "not_sure"]).default("not_sure"),
  temperatureF: optionalNumber(z.number().int("Use a whole number").min(-20, "Enter a temperature between -20 and 120 °F").max(120, "Enter a temperature between -20 and 120 °F")),
  ballType: z.enum(["52/300", "44/375", "40/325", "other", "unknown"]),
  popVsPreviousGamer: z.enum(["better", "same", "worse", "not_sure"]),
  previousGamer: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v),
    z.string().min(2, "Name your previous bat in at least 2 characters").max(120, "Keep it under 120 characters").optional()
  ),
  sting: optionalNumber(z.number().int().min(1).max(5)),
  sound: optionalText(40),
  durabilityStatus: z.enum(["intact", "dented", "cracked", "rattle", "returned_warranty"]),
  notes: optionalText(1000),
});

async function intervalDays(): Promise<number> {
  const supabase = await createClient();
  const { data } = (await supabase?.from("site_settings").select("value").eq("key", "owner_report_interval_days").maybeSingle()) ?? { data: null };
  const n = Number(data?.value);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

export async function fileOwnerReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { error: "Sign in to file a report." };

  const parsed = reportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { error: "Check the highlighted answers.", fieldErrors };
  }
  const r = parsed.data;
  const { error } = await supabase.from("owner_reports").insert({
    product_id: r.productId,
    user_id: user.id,
    weight_oz: r.weightOz ?? null,
    hits_so_far: r.hitsSoFar,
    still_breaking_in: r.stillBreakingIn === "not_sure" ? null : r.stillBreakingIn === "yes",
    typical_temperature_f: r.temperatureF ?? null,
    ball_type: r.ballType,
    pop_vs_previous_gamer: r.popVsPreviousGamer,
    previous_gamer_text: r.previousGamer ?? null,
    sting: r.sting ?? null,
    sound: r.sound ?? null,
    durability_status: r.durabilityStatus,
    notes: r.notes ?? null,
  });
  if (error) return { error: ownerReportErrorMessage(error, await intervalDays()) };
  refresh();
  return { ok: true, message: "Thanks. Your check-in is published. Come back after another week of swings to update it." };
}

const alertSchema = z.object({
  productId: uuid,
  notifyOn: z.array(z.enum(["first_published_review", "early_reports_threshold", "first_listing"])).max(3),
});

export async function saveReviewAlerts(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { error: "Sign in to set alerts." };
  const parsed = alertSchema.safeParse({ productId: formData.get("productId"), notifyOn: formData.getAll("notifyOn") });
  if (!parsed.success) return { error: "Choose which alerts you want." };
  const { productId, notifyOn } = parsed.data;

  const { data: current, error: readError } = await supabase.from("review_alerts").select("notify_on").eq("product_id", productId).eq("user_id", user.id);
  if (readError) return { error: "That didn't go through. Try again in a minute." };
  const have = new Set((current ?? []).map((a) => a.notify_on as string));
  const want = new Set<string>(notifyOn);
  const toAdd = [...want].filter((n) => !have.has(n));
  const toRemove = [...have].filter((n) => !want.has(n));
  if (toAdd.length) {
    const { error } = await supabase.from("review_alerts").insert(toAdd.map((n) => ({ user_id: user.id, product_id: productId, notify_on: n })));
    if (error) return { error: "That didn't go through. Try again in a minute." };
  }
  if (toRemove.length) {
    const { error } = await supabase.from("review_alerts").delete().eq("product_id", productId).eq("user_id", user.id).in("notify_on", toRemove);
    if (error) return { error: "That didn't go through. Try again in a minute." };
  }
  refresh();
  return { ok: true, message: want.size ? "Alerts saved for this bat." : "Alerts turned off for this bat." };
}

const watchSchema = z.object({
  productId: uuid,
  intent: z.enum(["save", "remove"]),
  targetPrice: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(String(v).replace(/[$,\s]/g, ""))),
    z.number({ message: "Enter a price in dollars" }).min(1, "Enter a price of at least $1").max(25000, "Enter a price under $25,000").optional()
  ),
});

export async function saveWatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { error: "Sign in to use your watchlist." };
  const parsed = watchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the target price." };
  const { productId, intent, targetPrice } = parsed.data;
  if (intent === "remove") {
    const { error } = await supabase.from("product_watchlist").delete().eq("product_id", productId).eq("user_id", user.id);
    if (error) return { error: "That didn't go through. Try again in a minute." };
    refresh();
    return { ok: true, message: "Removed from your watchlist." };
  }
  const { error } = await supabase
    .from("product_watchlist")
    .upsert(
      { user_id: user.id, product_id: productId, target_price_cents: targetPrice != null ? Math.round(targetPrice * 100) : null },
      { onConflict: "user_id,product_id" }
    );
  if (error) return { error: "That didn't go through. Try again in a minute." };
  refresh();
  return { ok: true, message: targetPrice != null ? `On your watchlist with a target price of $${targetPrice}.` : "On your watchlist." };
}
