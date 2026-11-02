"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { attributesSchema, coerceAttributes } from "@/lib/sell/attributes";
import {
  DAMAGE_QUESTIONS,
  IMAGE_TYPES,
  IMAGE_TYPE_LABELS,
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  PHOTO_TYPES,
  detailsSchema,
  disclosuresSchema,
  isOwnListingPhotoPath,
  issuesToFieldErrors,
  mapListingError,
  priceSchema,
  shippingSchema,
  startListingSchema,
  suggestTitle,
  type StepKey,
} from "@/lib/sell/listing";
import { conditionLabel } from "@/lib/format";
import { findProducts, getSellCategories, getProduct, loadListingSnapshot, type ListingSnapshot, type ProductSummary } from "@/lib/sell/server";
import { z } from "zod";

// Server Actions for the listing flow. Each one checks the signed-in user again and validates its input with
// zod; writes go through the seller's own Supabase session, so Row Level Security and the database's
// publishing rules apply. The service role is used only to inspect and clean up uploaded files.

export type ActionResult =
  | { ok: true; snapshot: ListingSnapshot; listingId: string }
  | { ok: false; error?: string; fieldErrors?: Record<string, string>; step?: StepKey | null };

const BUCKET = "listing-images";
const SIGNED_OUT = { ok: false as const, error: "Your session has ended. Sign in again to keep going." };

async function session() {
  const db = await createClient();
  if (!db) return null;
  const { data } = await db.auth.getUser();
  if (!data.user) return null;
  return { db, user: data.user };
}

// Step saves return a fresh snapshot instead of revalidating: every seller page renders on demand, and a
// revalidation would re-render the flow mid-edit.
async function done(s: NonNullable<Awaited<ReturnType<typeof session>>>, listingId: string): Promise<ActionResult> {
  const snapshot = await loadListingSnapshot(s.db, s.user.id, listingId);
  if (!snapshot) return { ok: false, error: "We couldn't find that listing." };
  return { ok: true, snapshot, listingId };
}

function dbError(error: { message?: string } | null): ActionResult {
  const mapped = mapListingError(error?.message);
  return { ok: false, error: mapped.message, step: mapped.step };
}

const idSchema = z.string().uuid();

/** Loads the seller's listing, or returns a failure. Reserved and sold listings can't be changed. */
async function editable(s: NonNullable<Awaited<ReturnType<typeof session>>>, listingId: unknown) {
  const id = idSchema.safeParse(listingId);
  if (!id.success) return { fail: { ok: false as const, error: "We couldn't find that listing." } };
  const snapshot = await loadListingSnapshot(s.db, s.user.id, id.data);
  if (!snapshot) return { fail: { ok: false as const, error: "We couldn't find that listing." } };
  if (["reserved", "sold"].includes(snapshot.listing.listing_status))
    return { fail: { ok: false as const, error: "This listing is reserved or sold, so it can't be changed." } };
  return { snapshot, id: id.data };
}

/** Catalog models for the chosen category and brand (step 3). */
export async function listModels(categoryId: string, manufacturerId: string): Promise<ProductSummary[]> {
  const s = await session();
  if (!s) return [];
  const ids = z.object({ c: idSchema, m: idSchema }).safeParse({ c: categoryId, m: manufacturerId });
  if (!ids.success) return [];
  const category = (await getSellCategories(s.db)).find((c) => c.id === ids.data.c);
  if (!category) return [];
  return findProducts(s.db, ids.data.c, ids.data.m, category.fields);
}

/**
 * Steps 1–3: creates the draft (or, for an existing draft, changes its category, brand or model).
 * When the model isn't in the catalog, a catalog request is filed and the listing continues without one.
 */
export async function saveModel(listingId: string | null, input: unknown): Promise<ActionResult> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const parsed = startListingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: issuesToFieldErrors(parsed.error) };
  const v = parsed.data;

  const categories = await getSellCategories(s.db);
  const category = categories.find((c) => c.id === v.categoryId);
  if (!category) return { ok: false, fieldErrors: { categoryId: "Choose a category" } };
  let brandName: string | null = null;
  if (v.manufacturerId) {
    const { data: m } = await s.db.from("manufacturers").select("name").eq("id", v.manufacturerId).maybeSingle();
    if (!m) return { ok: false, fieldErrors: { manufacturerId: "Choose a brand" } };
    brandName = m.name === "Other" ? (v.request?.manufacturerName ?? null) : m.name;
  }
  const product = v.productId ? await getProduct(s.db, v.productId, category.fields) : null;
  if (v.productId && !product) return { ok: false, fieldErrors: { productId: "That model isn't in the catalog. Choose another or tell us about it." } };

  let existing: ListingSnapshot | null = null;
  if (listingId) {
    const e = await editable(s, listingId);
    if (e.fail) return e.fail;
    existing = e.snapshot;
    if (existing.listing.listing_status !== "draft")
      return { ok: false, error: "The category, brand and model of a published listing can't be changed. Remove it and start a new listing instead." };
  }

  const sameCategory = existing?.listing.category_id === category.id;
  const prefill = product?.prefill ?? {};
  const modelYear = product?.modelYear ?? v.request?.modelYear ?? null;
  const baseAttributes = sameCategory ? { ...(existing!.listing.attributes as Record<string, unknown>) } : {};
  const defaults = Object.fromEntries(category.fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default]));
  const attributes = {
    ...defaults,
    ...baseAttributes,
    ...prefill,
    ...(modelYear && category.fields.some((f) => f.key === "model_year") ? { model_year: modelYear } : {}),
  };
  const title = suggestTitle({
    modelYear,
    brand: brandName,
    model: product?.name ?? v.request?.modelName ?? null,
    fallback: category.name,
  });

  const { data: profile } = await s.db.rpc("get_my_profile").maybeSingle<{ city: string | null; state: string | null; postal_code: string | null }>();
  const row = {
    category_id: category.id,
    manufacturer_id: v.manufacturerId,
    product_id: product?.id ?? null,
    title,
    attributes,
    location_city: profile?.city ?? null,
    location_state: profile?.state ?? null,
  };

  let id = existing?.listing.id ?? null;
  if (id) {
    const { error } = await s.db.from("equipment_listings").update(row).eq("id", id);
    if (error) return dbError(error);
  } else {
    const { data, error } = await s.db
      .from("equipment_listings")
      .insert({ ...row, seller_id: s.user.id, listing_status: "draft", shipping_origin_postal_code: profile?.postal_code?.slice(0, 5) ?? null })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: "We couldn't start your listing. Check that your account is active and try again." };
    id = data.id as string;
  }

  const alreadyRequested = existing?.submission && existing.submission.modelName.toLowerCase() === v.request?.modelName.toLowerCase();
  if (v.request && !product && !alreadyRequested) {
    const { error } = await s.db.from("product_submissions").insert({
      submitted_by: s.user.id,
      category_id: category.id,
      manufacturer_id: v.manufacturerId,
      manufacturer_name: v.request.manufacturerName || brandName,
      model_name: v.request.modelName,
      model_year: v.request.modelYear,
      details: { listing_id: id },
    });
    if (error) return { ok: false, error: "Your listing was saved, but we couldn't file the catalog request. Try again." };
  }
  return done(s, id);
}

/** Step 4: item details, category fields and cosmetic condition. */
export async function saveDetails(listingId: string, input: unknown): Promise<ActionResult> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const e = await editable(s, listingId);
  if (e.fail) return e.fail;
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: issuesToFieldErrors(parsed.error) };
  const fields = e.snapshot.category.fields;
  const attrs = attributesSchema(fields).safeParse(coerceAttributes(fields, parsed.data.attributes));
  if (!attrs.success) {
    const errs = issuesToFieldErrors(attrs.error);
    return { ok: false, fieldErrors: Object.fromEntries(Object.entries(errs).map(([k, m]) => [`attributes.${k.split(".")[0]}`, m])) };
  }
  const { error } = await s.db
    .from("equipment_listings")
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      attributes: attrs.data,
      condition_score: parsed.data.conditionScore,
      condition_label: conditionLabel(parsed.data.conditionScore),
    })
    .eq("id", e.id);
  if (error) return dbError(error);
  return done(s, e.id);
}

/** Step 6: asking price and offers. */
export async function savePrice(listingId: string, input: unknown): Promise<ActionResult> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const e = await editable(s, listingId);
  if (e.fail) return e.fail;
  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: issuesToFieldErrors(parsed.error) };
  const { error } = await s.db
    .from("equipment_listings")
    .update({ asking_price_cents: parsed.data.price, accepts_offers: parsed.data.acceptsOffers })
    .eq("id", e.id);
  if (error) return dbError(error);
  return done(s, e.id);
}

/** Step 7: package and ship-from ZIP. The seller's city and state are refreshed from their profile. */
export async function saveShipping(listingId: string, input: unknown): Promise<ActionResult> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const e = await editable(s, listingId);
  if (e.fail) return e.fail;
  const parsed = shippingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: issuesToFieldErrors(parsed.error) };
  const { data: profile } = await s.db.rpc("get_my_profile").maybeSingle<{ city: string | null; state: string | null }>();
  const { error } = await s.db
    .from("equipment_listings")
    .update({
      shipping_weight_oz: Math.round(parsed.data.weightLb * 16 * 100) / 100,
      package_length_inches: parsed.data.lengthIn,
      package_width_inches: parsed.data.widthIn,
      package_height_inches: parsed.data.heightIn,
      shipping_origin_postal_code: parsed.data.postalCode,
      ...(profile?.city || profile?.state ? { location_city: profile.city, location_state: profile.state } : {}),
    })
    .eq("id", e.id);
  if (error) return dbError(error);
  return done(s, e.id);
}

/** Step 8: structural disclosure, damage questions, wear notes and declarations. */
export async function saveDisclosures(listingId: string, input: unknown): Promise<ActionResult> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const e = await editable(s, listingId);
  if (e.fail) return e.fail;
  const parsed = disclosuresSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: issuesToFieldErrors(parsed.error) };
  const v = parsed.data;
  const { error } = await s.db
    .from("equipment_listings")
    .update({
      structural_disclosure: v.structuralDisclosure,
      ...Object.fromEntries(DAMAGE_QUESTIONS.map((q) => [q.column, v[q.key]])),
      cosmetic_wear: v.cosmeticWear || null,
      damage_disclosure: v.damageDisclosure || null,
      ownership_declaration: v.ownership,
      authenticity_declaration: v.authenticity,
    })
    .eq("id", e.id);
  if (error) return dbError(error);
  return done(s, e.id);
}

/**
 * Step 5: records a photo the browser has just uploaded to Storage. The file is checked on the server
 * (folder, type and size); anything that fails is deleted again.
 */
export async function addPhoto(listingId: string, input: unknown): Promise<ActionResult> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const e = await editable(s, listingId);
  if (e.fail) return e.fail;
  const parsed = z.object({ path: z.string().min(1).max(300), imageType: z.enum(IMAGE_TYPES as [string, ...string[]]) }).safeParse(input);
  if (!parsed.success || !isOwnListingPhotoPath(parsed.data.path, s.user.id, e.id)) return { ok: false, error: "That photo upload wasn't valid. Try again." };
  const { path, imageType } = parsed.data;

  const admin = createAdminClient();
  const discard = async () => {
    await admin?.storage.from(BUCKET).remove([path]);
  };
  if (admin) {
    const { data: info, error } = await admin.storage.from(BUCKET).info(path);
    if (error || !info) return { ok: false, error: "We couldn't find the uploaded photo. Try uploading it again." };
    const type = info.contentType ?? (info.metadata as { mimetype?: string } | undefined)?.mimetype ?? "";
    const size = Number(info.size ?? (info.metadata as { size?: number } | undefined)?.size ?? 0);
    if (!(PHOTO_TYPES as readonly string[]).includes(type)) {
      await discard();
      return { ok: false, error: "Use a JPG, PNG, WEBP or HEIC photo." };
    }
    if (size > MAX_PHOTO_BYTES) {
      await discard();
      return { ok: false, error: "Photos can be up to 10 MB." };
    }
  }
  if (e.snapshot.photos.length >= MAX_PHOTOS) {
    await discard();
    return { ok: false, error: `A listing can have up to ${MAX_PHOTOS} photos.` };
  }
  const url = s.db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const order = e.snapshot.photos.reduce((m, p) => Math.max(m, p.order + 1), 0);
  const { error } = await s.db.from("listing_images").insert({
    listing_id: e.id,
    image_url: url,
    storage_path: path,
    image_type: imageType,
    display_order: order,
    alt_text: `${e.snapshot.listing.title}: ${IMAGE_TYPE_LABELS[imageType].toLowerCase()}`.slice(0, 200),
  });
  if (error) {
    await discard();
    return dbError(error);
  }
  return done(s, e.id);
}

/** Step 5: photo order (first is the cover) and each photo's type. */
export async function updatePhotos(listingId: string, input: unknown): Promise<ActionResult> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const e = await editable(s, listingId);
  if (e.fail) return e.fail;
  const parsed = z
    .array(z.object({ id: idSchema, imageType: z.enum(IMAGE_TYPES as [string, ...string[]]) }))
    .max(MAX_PHOTOS)
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "We couldn't save the photo order. Try again." };
  const known = new Set(e.snapshot.photos.map((p) => p.id));
  if (parsed.data.some((p) => !known.has(p.id))) return { ok: false, error: "We couldn't save the photo order. Reload and try again." };
  for (const [i, p] of parsed.data.entries()) {
    const { error } = await s.db
      .from("listing_images")
      .update({
        display_order: i,
        image_type: p.imageType,
        alt_text: `${e.snapshot.listing.title}: ${IMAGE_TYPE_LABELS[p.imageType].toLowerCase()}`.slice(0, 200),
      })
      .eq("id", p.id)
      .eq("listing_id", e.id);
    if (error) return dbError(error);
  }
  return done(s, e.id);
}

export async function removePhoto(listingId: string, photoId: string): Promise<ActionResult> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const e = await editable(s, listingId);
  if (e.fail) return e.fail;
  const photo = e.snapshot.photos.find((p) => p.id === photoId);
  if (!photo) return { ok: false, error: "That photo is already gone." };
  const { error } = await s.db.from("listing_images").delete().eq("id", photo.id).eq("listing_id", e.id);
  if (error) return dbError(error);
  if (photo.storagePath && isOwnListingPhotoPath(photo.storagePath, s.user.id, e.id)) {
    await createAdminClient()?.storage.from(BUCKET).remove([photo.storagePath]);
  }
  return done(s, e.id);
}

/** Step 10: goes live. The database checks every publishing rule; its messages are mapped to the step to fix. */
export async function publishListing(listingId: string): Promise<ActionResult> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const e = await editable(s, listingId);
  if (e.fail) return e.fail;
  if (!["draft", "removed", "expired"].includes(e.snapshot.listing.listing_status)) return done(s, e.id);
  if (!e.snapshot.attributesValid) return { ok: false, error: "Finish the item details before publishing.", step: "details" };
  const { data: profile } = await s.db.rpc("get_my_profile").maybeSingle<{ city: string | null; state: string | null }>();
  const { error } = await s.db
    .from("equipment_listings")
    .update({
      listing_status: "active",
      ...(profile?.city || profile?.state ? { location_city: profile.city, location_state: profile.state } : {}),
    })
    .eq("id", e.id);
  if (error) return dbError(error);
  return done(s, e.id);
}

/** Takes a live listing down. It stays in the seller's dashboard under Removed. */
export async function removeListing(listingId: string): Promise<{ ok: boolean; error?: string }> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const e = await editable(s, listingId);
  if (e.fail) return e.fail;
  if (e.snapshot.listing.listing_status === "draft") return { ok: false, error: "Drafts aren't live. Delete the draft instead." };
  const { error } = await s.db.from("equipment_listings").update({ listing_status: "removed" }).eq("id", e.id);
  if (error) return { ok: false, error: mapListingError(error.message).message };
  revalidatePath("/seller", "layout");
  revalidatePath("/");
  return { ok: true };
}

/** Deletes a draft and its photos for good. Only drafts can be deleted. */
export async function deleteDraft(listingId: string): Promise<{ ok: boolean; error?: string }> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const e = await editable(s, listingId);
  if (e.fail) return e.fail;
  if (e.snapshot.listing.listing_status !== "draft") return { ok: false, error: "Only drafts can be deleted. Remove a live listing instead." };
  const { error } = await s.db.from("equipment_listings").delete().eq("id", e.id).eq("listing_status", "draft");
  if (error) return { ok: false, error: "We couldn't delete that draft. Try again." };
  const paths = e.snapshot.photos.map((p) => p.storagePath).filter((p): p is string => Boolean(p && isOwnListingPhotoPath(p, s.user.id, e.id)));
  if (paths.length) await createAdminClient()?.storage.from(BUCKET).remove(paths);
  revalidatePath("/seller", "layout");
  return { ok: true };
}
