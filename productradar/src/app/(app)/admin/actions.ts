"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertMember } from "@/lib/auth/member";
import { parseYoutubeInput } from "@/lib/connectors/youtube";
import { sendEmail } from "@/lib/email/send";
import { friendlyDbError, withFlash } from "@/lib/flash";
import { analyzeVideos } from "@/lib/jobs/analyze";
import { deadlineFrom, recordUsage } from "@/lib/jobs/lock";
import { recipients, sendDigest } from "@/lib/jobs/notify";
import { runDaily, runIngestCycle } from "@/lib/jobs/runner";
import { scoreProducts } from "@/lib/jobs/score";
import { pollYoutubeCreators, youtubeClient } from "@/lib/jobs/youtube-ingest";
import { loadSettings, SETTING_KEYS, validateSetting, type SettingKey } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

const uuid = z.string().uuid();

function go(path: string, kind: "notice" | "error", message: string): never {
  revalidatePath(path);
  redirect(withFlash(path, kind, message));
}

function service() {
  const db = createAdminClient();
  if (!db) throw new Error("The server isn't connected to the database (SUPABASE_SERVICE_ROLE_KEY missing).");
  return db;
}

// ---------------------------------------------------------------- creators

export async function addCreator(form: FormData) {
  const m = await assertMember(true);
  const name = String(form.get("display_name") ?? "").trim().slice(0, 120);
  const channel = String(form.get("channel") ?? "").trim().slice(0, 300);
  if (name.length < 2) go("/admin/creators", "error", "Enter the creator's name.");
  if (!channel) {
    const { error } = await m.db.from("creators").insert({ display_name: name, verification_status: "unresolved", verification_notes: "Added without a channel link. Paste the channel URL to verify." });
    if (error) go("/admin/creators", "error", friendlyDbError(error.message));
    go("/admin/creators", "notice", `Added ${name}. Paste their channel link to verify it.`);
  }
  const res = await resolveInto(m.db, null, name, channel);
  go("/admin/creators", res.ok ? "notice" : "error", res.message);
}

export async function setCreatorChannel(form: FormData) {
  const m = await assertMember(true);
  const id = uuid.parse(form.get("id"));
  const { data: c } = await m.db.from("creators").select("display_name").eq("id", id).single();
  const res = await resolveInto(m.db, id, (c?.display_name as string) ?? "", String(form.get("channel") ?? "").trim());
  go("/admin/creators", res.ok ? "notice" : "error", res.message);
}

type MemberDb = Awaited<ReturnType<typeof assertMember>>["db"];

/** Looks the channel up through the YouTube API and stores it as a candidate for the owner to confirm. */
async function resolveInto(db: MemberDb, id: string | null, name: string, channel: string): Promise<{ ok: boolean; message: string }> {
  const parsed = parseYoutubeInput(channel);
  if (parsed.kind === "unsupported") return { ok: false, message: "That doesn't look like a YouTube channel link. Use youtube.com/@handle or youtube.com/channel/UC…" };
  const yt = youtubeClient();
  if (!yt) {
    const row = { display_name: name, channel_url: channel, channel_id: parsed.kind === "channel_id" ? parsed.value : null, handle: parsed.kind === "handle" ? `@${parsed.value}` : null, verification_status: "unresolved", verification_notes: "Saved. Add the YouTube API key (Settings) so the channel can be looked up and verified." };
    const { error } = id ? await db.from("creators").update(row).eq("id", id) : await db.from("creators").insert(row);
    return error ? { ok: false, message: friendlyDbError(error.message) } : { ok: true, message: `Saved ${name}. It will be verified once the YouTube API key is set.` };
  }
  try {
    const info = await yt.resolveChannel(channel);
    const svc = createAdminClient();
    if (svc) await recordUsage(svc, "youtube", "resolve_channel", yt.unitsUsed);
    if (!info) return { ok: false, message: "YouTube couldn't find that channel. Check the link." };
    const row = {
      display_name: name || info.title, channel_id: info.channelId, channel_url: info.url, handle: info.handle, channel_title: info.title, subscriber_count: info.subscriberCount,
      uploads_playlist_id: info.uploadsPlaylistId, verification_status: "candidate", is_active: false,
      verification_notes: `Found "${info.title}"${info.subscriberCount !== null ? ` (${info.subscriberCount.toLocaleString()} subscribers)` : ""}. ${info.description ? `About: ${info.description.slice(0, 160)}` : ""} Check it is the right person, then confirm.`,
    };
    const { error } = id ? await db.from("creators").update(row).eq("id", id) : await db.from("creators").insert(row);
    return error ? { ok: false, message: friendlyDbError(error.message) } : { ok: true, message: `Found "${info.title}". Check it's the right channel, then click Confirm & activate.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "YouTube lookup failed." };
  }
}

export async function creatorAction(form: FormData) {
  const m = await assertMember(true);
  const id = uuid.parse(form.get("id"));
  const op = z.enum(["confirm", "activate", "deactivate", "reject", "delete", "poll"]).parse(form.get("op"));
  const now = new Date().toISOString();
  if (op === "poll") {
    const db = service();
    const settings = await loadSettings(db);
    const deadline = deadlineFrom(240_000);
    const r = await pollYoutubeCreators(db, settings, deadline, { creatorId: id, force: true });
    const a = await analyzeVideos(db, settings, deadline);
    if (a.productsTouched.length) await scoreProducts(db, settings, a.productsTouched, deadline, { allowAssess: true, competitionSnapshot: true });
    go("/admin/creators", r.errors.length ? "error" : "notice", r.errors.length ? r.errors[0].error : `Checked: ${r.newVideos} new video(s), ${r.statsRefreshed} refreshed; ${a.videosAnalyzed} analysed, ${a.productsTouched.length} product(s) found.${a.stoppedBy ? ` (${a.stoppedBy})` : ""}`);
  }
  const updates: Record<string, Record<string, unknown>> = {
    confirm: { verification_status: "verified", verified_at: now, is_active: true },
    activate: { is_active: true },
    deactivate: { is_active: false },
    reject: { verification_status: "rejected", is_active: false },
  };
  const { error } = op === "delete" ? await m.db.from("creators").delete().eq("id", id) : await m.db.from("creators").update(updates[op]).eq("id", id);
  if (error) go("/admin/creators", "error", friendlyDbError(error.message));
  go("/admin/creators", "notice", { confirm: "Verified and activated. It will be checked on the next run.", activate: "Activated.", deactivate: "Paused.", reject: "Marked as the wrong channel.", delete: "Removed." }[op]);
}

// ---------------------------------------------------------------- sources

export async function addSource(form: FormData) {
  const m = await assertMember(true);
  const parsed = z.object({ name: z.string().trim().min(2).max(120), url: z.string().trim().url().max(1000), kind: z.enum(["web", "reddit", "tiktok", "instagram", "amazon", "aliexpress", "google_shopping"]), notes: z.string().max(1000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) go("/admin/sources", "error", "Enter a name and a full URL.");
  const { error } = await m.db.from("sources").insert({ ...parsed.data, status: "planned", notes: parsed.data.notes || "Saved for monitoring once this source type has a permitted connector." });
  if (error) go("/admin/sources", "error", friendlyDbError(error.message));
  go("/admin/sources", "notice", "Source saved.");
}

export async function sourceAction(form: FormData) {
  const m = await assertMember(true);
  const id = uuid.parse(form.get("id"));
  const op = z.enum(["pause", "activate", "delete"]).parse(form.get("op"));
  const { data: src } = await m.db.from("sources").select("kind").eq("id", id).single();
  if (op === "activate" && !["youtube", "manual"].includes(src?.kind as string)) go("/admin/sources", "error", "This source type has no permitted connector yet, so it can't be switched on.");
  const { error } = op === "delete" ? await m.db.from("sources").delete().eq("id", id) : await m.db.from("sources").update({ status: op === "pause" ? "paused" : "active" }).eq("id", id);
  if (error) go("/admin/sources", "error", friendlyDbError(error.message));
  go("/admin/sources", "notice", "Updated.");
}

// ---------------------------------------------------------------- products & matching

export async function resolveSuggestion(form: FormData) {
  const m = await assertMember(true);
  const id = uuid.parse(form.get("id"));
  const op = z.enum(["merge", "dismiss"]).parse(form.get("op"));
  const { data: s } = await m.db.from("match_suggestions").select("product_id, candidate_product_id").eq("id", id).single();
  if (!s) go("/admin/products", "error", "Suggestion not found.");
  if (op === "dismiss") {
    const { error } = await m.db.from("match_suggestions").update({ status: "dismissed", resolved_at: new Date().toISOString() }).eq("id", id);
    if (error) go("/admin/products", "error", friendlyDbError(error.message));
    go("/admin/products", "notice", "Kept as separate products.");
  }
  const { error } = await m.db.rpc("merge_products", { p_from: s.product_id, p_into: s.candidate_product_id });
  if (error) go("/admin/products", "error", friendlyDbError(error.message));
  const db = service();
  await scoreProducts(db, await loadSettings(db), [s.candidate_product_id as string], deadlineFrom(40_000), { allowAssess: false });
  go("/admin/products", "notice", "Merged into one product.");
}

export async function mergeBySlug(form: FormData) {
  const m = await assertMember(true);
  const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim().replace(/^.*\/products\//, "").replace(/[/?#].*$/, "");
  const [from, into] = [clean(form.get("from")), clean(form.get("into"))];
  const { data: rows } = await m.db.from("products").select("id, slug").in("slug", [from, into]);
  const a = rows?.find((r) => r.slug === from);
  const b = rows?.find((r) => r.slug === into);
  if (!a || !b) go("/admin/products", "error", "Couldn't find both products. Paste their page links.");
  const { error } = await m.db.rpc("merge_products", { p_from: a.id, p_into: b.id });
  if (error) go("/admin/products", "error", friendlyDbError(error.message));
  const db = service();
  await scoreProducts(db, await loadSettings(db), [b.id as string], deadlineFrom(40_000), { allowAssess: false });
  go("/admin/products", "notice", "Merged.");
}

// ---------------------------------------------------------------- jobs

export async function runJobNow(form: FormData) {
  await assertMember(true);
  const op = z.enum(["ingest", "daily", "retry_failed", "digest", "test_email"]).parse(form.get("op"));
  const db = service();
  if (op === "ingest") {
    const r = await runIngestCycle(db, "manual", { force: true });
    go("/admin/jobs", "skipped" in r ? "error" : "notice", "skipped" in r ? (r.reason ?? "Skipped.") : "Ingestion cycle finished. See the job below for details.");
  }
  if (op === "daily") {
    const r = await runDaily(db, "manual");
    go("/admin/jobs", "skipped" in r ? "error" : "notice", "skipped" in r ? (r.reason ?? "Skipped.") : "Daily job finished.");
  }
  if (op === "retry_failed") {
    const { data } = await db.from("creator_videos").update({ analysis_status: "pending", analysis_attempts: 0 }).eq("analysis_status", "failed").select("id");
    go("/admin/jobs", "notice", `${data?.length ?? 0} video(s) queued for analysis on the next run.`);
  }
  if (op === "digest") {
    const r = await sendDigest(db, await loadSettings(db), { force: true });
    go("/admin/jobs", r.status === "sent" ? "notice" : "error", r.status === "sent" ? `Digest sent with ${r.products} product(s).` : `Digest not sent: ${r.status.replace(/_/g, " ")}.`);
  }
  const to = await recipients(db, "alerts");
  const sent = await sendEmail({ to, subject: "Product Radar test email", text: "Email delivery works. Alerts and the daily digest will arrive at this address.", html: "<p>Email delivery works. Alerts and the daily digest will arrive at this address.</p>" });
  go("/admin/jobs", sent.ok ? "notice" : "error", sent.ok ? `Test email sent to ${to.join(", ")}.` : `Test email failed: ${sent.reason === "not_configured" ? "Resend isn't configured" : sent.message}`);
}

// ---------------------------------------------------------------- settings

const PERCENT_KEYS = new Set(["payment_pct", "refund_reserve_pct", "other_pct"]);

export async function saveSetting(form: FormData) {
  const m = await assertMember(true);
  const key = String(form.get("key")) as SettingKey;
  if (!SETTING_KEYS.includes(key)) go("/admin/settings", "error", "Unknown setting.");
  const value: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (k === "key" || k.startsWith("$")) continue;
    const s = String(v).trim();
    if (s === "true" || s === "false") value[k] = s === "true";
    else if (s !== "" && !Number.isNaN(Number(s)) && k !== "model") value[k] = PERCENT_KEYS.has(k) ? Number(s) / 100 : Number(s);
    else value[k] = s;
  }
  if (key === "digest") value.enabled = form.get("enabled") === "on" || form.get("enabled") === "true";
  const checked = validateSetting(key, value);
  if (!checked.ok) go("/admin/settings", "error", checked.error);
  const { error } = await m.db.from("app_settings").upsert({ key, value: checked.value, updated_at: new Date().toISOString(), updated_by: m.user.id });
  if (error) go("/admin/settings", "error", friendlyDbError(error.message));
  go("/admin/settings", "notice", "Saved.");
}

export async function addMember(form: FormData) {
  await assertMember(true);
  const email = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!email.success) go("/admin/settings", "error", "Enter a valid email address.");
  const db = service();
  const { data: created, error } = await db.auth.admin.createUser({ email: email.data, email_confirm: true });
  let userId = created?.user?.id;
  if (error && !userId) {
    // Already has an auth account (e.g. from another invitation): look it up.
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email.data)?.id;
  }
  if (!userId) go("/admin/settings", "error", "Couldn't create the account.");
  const { error: insErr } = await db.from("users").upsert({ id: userId, email: email.data, role: "member" }, { onConflict: "id", ignoreDuplicates: true });
  if (insErr) go("/admin/settings", "error", friendlyDbError(insErr.message));
  go("/admin/settings", "notice", `${email.data} can now sign in with an emailed link.`);
}

export async function memberAction(form: FormData) {
  const m = await assertMember(true);
  const id = uuid.parse(form.get("id"));
  const op = z.enum(["remove", "toggle_alerts", "toggle_digest"]).parse(form.get("op"));
  if (id === m.user.id && op === "remove") go("/admin/settings", "error", "You can't remove yourself.");
  const { data: u } = await m.db.from("users").select("receives_alerts, receives_digest").eq("id", id).single();
  const { error } =
    op === "remove" ? await m.db.from("users").delete().eq("id", id)
    : op === "toggle_alerts" ? await m.db.from("users").update({ receives_alerts: !u?.receives_alerts }).eq("id", id)
    : await m.db.from("users").update({ receives_digest: !u?.receives_digest }).eq("id", id);
  if (error) go("/admin/settings", "error", friendlyDbError(error.message));
  go("/admin/settings", "notice", "Updated.");
}
