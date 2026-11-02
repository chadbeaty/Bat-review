"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { listingPath } from "@/lib/paths";
import { safeNextPath } from "@/lib/routes";

const listingId = z.string().uuid();

/** Adds or removes a favorite for the signed-in member. Signed-out visitors are sent to sign in first. */
export async function toggleFavorite(formData: FormData) {
  const parsed = listingId.safeParse(formData.get("listingId"));
  if (!parsed.success) return;
  const id = parsed.data;
  const back = safeNextPath(String(formData.get("next") ?? ""), listingPath(id));

  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  const supabase = (await createClient())!;

  const { data: existing } = await supabase.from("favorites").select("id").eq("user_id", user.id).eq("listing_id", id).maybeSingle();
  if (existing) {
    await supabase.from("favorites").delete().eq("id", existing.id);
  } else {
    // Only listings the member can actually see (RLS hides other people's drafts) can be saved.
    const { data: visible } = await supabase.from("equipment_listings").select("id").eq("id", id).maybeSingle();
    if (!visible) return;
    const { error } = await supabase.from("favorites").insert({ user_id: user.id, listing_id: id });
    if (error && error.code !== "23505") console.error("favorite insert failed", error.message);
  }
  revalidatePath(listingPath(id));
  revalidatePath("/account/favorites");
}

export type ReportState = { ok?: boolean; error?: string };

const reportSchema = z.object({
  listingId,
  reason: z.enum(["counterfeit", "stolen", "misrepresented", "prohibited", "off_platform_payment", "spam", "other"], {
    message: "Choose a reason.",
  }),
  details: z.string().trim().max(2000, "Keep the details under 2,000 characters.").optional(),
});

/** Files a moderation report about a listing. Signed-in members only; RLS checks the reporter again. */
export async function reportListing(_state: ReportState, formData: FormData): Promise<ReportState> {
  const parsed = reportSchema.safeParse({
    listingId: formData.get("listingId"),
    reason: formData.get("reason"),
    details: formData.get("details") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to report a listing." };
  const supabase = (await createClient())!;

  const { data: listing } = await supabase.from("equipment_listings").select("id, seller_id").eq("id", parsed.data.listingId).maybeSingle();
  if (!listing) return { error: "This listing is no longer available." };
  if (listing.seller_id === user.id) return { error: "You can't report your own listing." };

  const { data: already } = await supabase
    .from("reports")
    .select("id")
    .eq("reporter_id", user.id)
    .eq("entity_type", "listing")
    .eq("entity_id", listing.id)
    .in("status", ["open", "reviewing"])
    .limit(1);
  if (already?.length) return { ok: true };

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    entity_type: "listing",
    entity_id: listing.id,
    reason: parsed.data.reason,
    details: parsed.data.details ?? null,
  });
  if (error) {
    console.error("report insert failed", error.message);
    return { error: "We couldn't send your report. Try again in a minute." };
  }
  return { ok: true };
}
