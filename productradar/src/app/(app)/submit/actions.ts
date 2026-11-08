"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertMember } from "@/lib/auth/member";
import { detectPlatform } from "@/lib/connectors/manual";
import { friendlyDbError, withFlash } from "@/lib/flash";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { deadlineFrom } from "@/lib/jobs/lock";
import { processSubmission } from "@/lib/jobs/manual";
import { rateLimit } from "@/lib/security";

const schema = z.object({
  url: z.string().trim().url().max(2000),
  notes: z.string().max(4000).transform((s) => s.trim()),
});

/** Saves a submitted URL and analyses it straight away (usually 10-40 seconds). */
export async function submitUrl(form: FormData) {
  const m = await assertMember();
  const parsed = schema.safeParse({ url: form.get("url"), notes: form.get("notes") ?? "" });
  if (!parsed.success) redirect(withFlash("/submit", "error", "Enter a full web address starting with https://"));
  const detected = detectPlatform(parsed.data.url);
  if (!detected) redirect(withFlash("/submit", "error", "That isn't a public web address."));
  if (!(await rateLimit(`submit:${m.user.id}`, 40, 3600))) redirect(withFlash("/submit", "error", "That's a lot of submissions in an hour. Please wait a little."));

  const { data: sub, error } = await m.db
    .from("manual_submissions")
    .insert({ url: detected.url.toString(), platform: detected.platform, notes: parsed.data.notes || null, submitted_by: m.user.id })
    .select("id")
    .single();
  if (error || !sub) redirect(withFlash("/submit", "error", friendlyDbError(error?.message ?? "Couldn't save it.")));

  const service = createAdminClient();
  if (!service) redirect(withFlash("/submit", "error", "Saved, but the server can't process it (service key missing)."));
  const outcome = await processSubmission(service, sub.id as string, await loadSettings(service), deadlineFrom(240_000));
  revalidatePath("/submit");
  revalidatePath("/");
  if (outcome.productIds.length === 1) {
    const { data: p } = await service.from("products").select("slug").eq("id", outcome.productIds[0]).maybeSingle();
    if (p) redirect(withFlash(`/products/${p.slug}`, "notice", outcome.message));
  }
  redirect(withFlash("/submit", outcome.status === "failed" ? "error" : "notice", outcome.message));
}
