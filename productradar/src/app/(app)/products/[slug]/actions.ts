"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertMember } from "@/lib/auth/member";
import { friendlyDbError, withFlash } from "@/lib/flash";
import { normalizeName } from "@/lib/engine/names";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { deadlineFrom } from "@/lib/jobs/lock";
import { scoreProducts } from "@/lib/jobs/score";

const uuid = z.string().uuid();
const back = (form: FormData) => {
  const slug = String(form.get("slug") ?? "");
  return /^[a-z0-9-]{1,80}$/.test(slug) ? `/products/${slug}` : "/opportunities";
};
function done(form: FormData, kind: "notice" | "error", msg: string): never {
  const path = back(form);
  revalidatePath(path);
  redirect(withFlash(path, kind, msg));
}

const WATCH = ["saved", "following", "testing", "tested", "launched", "rejected"] as const;

export async function setWatchStatus(form: FormData) {
  const m = await assertMember();
  const productId = uuid.parse(form.get("product_id"));
  const status = String(form.get("status"));
  if (status === "remove") {
    const { error } = await m.db.from("watchlists").delete().eq("user_id", m.user.id).eq("product_id", productId);
    if (error) done(form, "error", friendlyDbError(error.message));
    done(form, "notice", "Removed from your watchlist.");
  }
  const s = z.enum(WATCH).parse(status);
  const notes = String(form.get("notes") ?? "").trim().slice(0, 2000) || null;
  const { error } = await m.db.from("watchlists").upsert({ user_id: m.user.id, product_id: productId, status: s, ...(notes !== null ? { notes } : {}) }, { onConflict: "user_id,product_id" });
  if (error) done(form, "error", friendlyDbError(error.message));
  revalidatePath("/watchlist");
  done(form, "notice", `Watchlist status: ${s}.`);
}

const money = z.preprocess((v) => (v === "" || v === null ? null : Number(v)), z.number().min(0).max(10_000_000).nullable());
const int = z.preprocess((v) => (v === "" || v === null ? null : Number(v)), z.number().int().min(0).max(1_000_000_000).nullable());
const dateStr = z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());

export async function addTestResult(form: FormData) {
  const m = await assertMember();
  const parsed = z
    .object({
      product_id: uuid,
      kind: z.enum(["test_result", "sales", "note"]),
      period_start: dateStr,
      period_end: dateStr,
      ad_spend: money,
      revenue: money,
      orders: int,
      units_cost: money,
      video_views: int,
      verdict: z.preprocess((v) => (v === "" ? null : v), z.enum(["winner", "promising", "loser", "inconclusive"]).nullable()),
      notes: z.string().max(4000).transform((s) => s.trim() || null),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) done(form, "error", `Check the form: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  const { error } = await m.db.from("user_feedback").insert({ ...parsed.data, user_id: m.user.id });
  if (error) done(form, "error", friendlyDbError(error.message));
  if (parsed.data.kind !== "note") await m.db.from("watchlists").upsert({ user_id: m.user.id, product_id: parsed.data.product_id, status: "tested" }, { onConflict: "user_id,product_id" });
  revalidatePath("/watchlist");
  done(form, "notice", "Result recorded.");
}

export async function addAlias(form: FormData) {
  const m = await assertMember(true);
  const productId = uuid.parse(form.get("product_id"));
  const alias = String(form.get("alias") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (alias.length < 3) done(form, "error", "Enter a name of at least 3 characters.");
  const { error } = await m.db.from("product_aliases").insert({ product_id: productId, alias, alias_normalized: normalizeName(alias), source: "manual", confidence: 1 });
  if (error) done(form, "error", friendlyDbError(error.message));
  done(form, "notice", `Added "${alias}" as another name for this product.`);
}

export async function removeAlias(form: FormData) {
  const m = await assertMember(true);
  const { error } = await m.db.from("product_aliases").delete().eq("id", uuid.parse(form.get("alias_id")));
  if (error) done(form, "error", friendlyDbError(error.message));
  done(form, "notice", "Name removed.");
}

export async function renameProduct(form: FormData) {
  const m = await assertMember(true);
  const productId = uuid.parse(form.get("product_id"));
  const name = String(form.get("canonical_name") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (name.length < 3) done(form, "error", "Enter a name of at least 3 characters.");
  const { error } = await m.db.from("products").update({ canonical_name: name }).eq("id", productId);
  if (error) done(form, "error", friendlyDbError(error.message));
  await m.db.from("product_aliases").upsert({ product_id: productId, alias: name, alias_normalized: normalizeName(name), source: "manual", confidence: 1 }, { onConflict: "product_id,alias_normalized", ignoreDuplicates: true });
  done(form, "notice", "Renamed.");
}

export async function setProductStatus(form: FormData) {
  const m = await assertMember(true);
  const productId = uuid.parse(form.get("product_id"));
  const status = z.enum(["tracking", "saturated", "not_a_product"]).parse(form.get("status"));
  const { error } = await m.db.from("products").update({ status }).eq("id", productId);
  if (error) done(form, "error", friendlyDbError(error.message));
  done(form, "notice", status === "not_a_product" ? "Marked as not a product. It no longer appears in lists or alerts." : `Status set to ${status}.`);
}

export async function mergeInto(form: FormData) {
  const m = await assertMember(true);
  const fromId = uuid.parse(form.get("product_id"));
  const target = String(form.get("target") ?? "").trim();
  const slug = target.replace(/^.*\/products\//, "").replace(/[/?#].*$/, "");
  const { data: into } = await m.db.from("products").select("id, slug, canonical_name").eq("slug", slug).maybeSingle();
  if (!into) done(form, "error", "Couldn't find that product. Paste its page link or its address name (slug).");
  const { error } = await m.db.rpc("merge_products", { p_from: fromId, p_into: into.id });
  if (error) done(form, "error", friendlyDbError(error.message));
  const service = createAdminClient();
  if (service) await scoreProducts(service, await loadSettings(service), [into.id], deadlineFrom(40_000), { allowAssess: false });
  revalidatePath(`/products/${into.slug}`);
  redirect(withFlash(`/products/${into.slug}`, "notice", "Merged. All mentions, names and history now belong to this product."));
}

export async function rescoreNow(form: FormData) {
  await assertMember(true);
  const productId = uuid.parse(form.get("product_id"));
  const assess = form.get("assess") === "1";
  const service = createAdminClient();
  if (!service) done(form, "error", "The server isn't connected to the database (service key missing).");
  const res = await scoreProducts(service, await loadSettings(service), [productId], deadlineFrom(240_000), { allowAssess: false, forceAssess: assess, competitionSnapshot: true });
  if (res.errors.length) done(form, "error", res.errors[0]);
  done(form, "notice", assess ? (res.assessed ? "Re-assessed with AI and rescored." : "Rescored (the AI assessment did not run; check the AI key and budget).") : "Rescored.");
}
