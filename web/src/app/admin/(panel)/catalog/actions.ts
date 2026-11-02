"use server";

import { AdminInputError, must, runAdminAction } from "@/lib/admin/action";
import type { Staff } from "@/lib/admin/auth";
import { CATALOG_STATUSES, CERT_STATUSES, STAMPS, WEIGHTINGS } from "@/lib/admin/catalog";
import { optional, parseAttributeSchema, parseHttpsUrl, parseSlug, text, uuid } from "@/lib/admin/validation";

type Db = Parameters<Parameters<typeof runAdminAction>[3]>[1];


function id(form: FormData, name: string) {
  const v = text(form, name);
  if (!uuid.safeParse(v).success) throw new AdminInputError("Unknown record.");
  return v;
}

function year(form: FormData, name: string): number | null {
  const v = text(form, name);
  if (!v) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1980 || n > 2100) throw new AdminInputError("Model year must be between 1980 and 2100.");
  return n;
}

async function log(db: Db, staff: Staff, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
  must(await db.rpc("admin_log", { p_actor: staff.user.id, p_action: action, p_entity_type: entityType, p_entity_id: entityId, p_metadata: metadata }));
}

/** Only the fields that changed, as { field: { from, to } }, for the audit log. */
function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(after)) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(v ?? null)) out[k] = { from: before[k] ?? null, to: v ?? null };
  }
  return out;
}

export async function updateProduct(form: FormData) {
  return runAdminAction(["moderator"], form, "/admin/catalog", async (staff, db) => {
    const productId = id(form, "productId");
    const status = text(form, "catalog_status");
    const cert = text(form, "certification_status");
    if (!(CATALOG_STATUSES as readonly string[]).includes(status)) throw new AdminInputError("Choose a catalog status.");
    if (!(CERT_STATUSES as readonly string[]).includes(cert)) throw new AdminInputError("Choose a certification status.");
    const name = text(form, "product_name", 200);
    const model = text(form, "model_name", 200);
    if (name.length < 2 || model.length < 1) throw new AdminInputError("Product and model names are required.");
    const slug = parseSlug(text(form, "slug"));
    if (!slug) throw new AdminInputError("Enter a URL slug.");
    const officialUrl = text(form, "official_product_url");
    if (officialUrl && !parseHttpsUrl(officialUrl)) throw new AdminInputError("The official product link must start with https://.");
    const price = text(form, "original_retail_price");
    if (price && !/^\d+(\.\d{1,2})?$/.test(price)) throw new AdminInputError("Enter the retail price in dollars, like 349.95.");
    const releaseDate = text(form, "release_date");
    if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) throw new AdminInputError("Enter the release date as a date.");
    const releaseStatus = text(form, "release_status");
    if (releaseStatus && !["announced", "pre_order", "released"].includes(releaseStatus)) throw new AdminInputError("Unknown release status.");
    const manufacturerId = text(form, "manufacturer_id");
    const categoryId = id(form, "category_id");

    const update = {
      product_name: name,
      model_name: model,
      model_year: year(form, "model_year"),
      slug,
      description: optional(form, "description", 5000),
      official_product_url: officialUrl ? parseHttpsUrl(officialUrl) : null,
      category_id: categoryId,
      manufacturer_id: manufacturerId && uuid.safeParse(manufacturerId).success ? manufacturerId : null,
      certification_association: STAMPS.filter((s) => form.getAll("stamps").includes(s)),
      certification_status: cert,
      certification_source: optional(form, "certification_source", 500),
      original_retail_price_cents: price ? Math.round(Number(price) * 100) : null,
      original_price_source: optional(form, "original_price_source", 500),
      original_price_verified: form.get("original_price_verified") === "on",
      catalog_status: status,
      release_date: releaseDate || null,
      release_status: releaseStatus || null,
    };
    const { data: before } = await db.from("products").select("*").eq("id", productId).single();
    if (!before) throw new AdminInputError("Product not found.");
    const changes = diff(before, update);
    if (!Object.keys(changes).length) return "No changes to save.";
    const certChanged = "certification_status" in changes || "certification_association" in changes;
    must(
      await db
        .from("products")
        .update({ ...update, ...(certChanged ? { certification_verified_at: cert === "unverified" ? null : new Date().toISOString() } : {}) })
        .eq("id", productId)
    );
    await log(db, staff, "product.updated", "product", productId, { changes });
    return "Product saved.";
  });
}

export async function setProductStatus(form: FormData) {
  return runAdminAction(["moderator"], form, "/admin/catalog", async (staff, db) => {
    const productId = id(form, "productId");
    const status = text(form, "catalog_status");
    if (status !== "published" && status !== "archived" && status !== "draft") throw new AdminInputError("Unknown status.");
    const { data: before } = await db.from("products").select("catalog_status").eq("id", productId).single();
    must(await db.from("products").update({ catalog_status: status }).eq("id", productId));
    await log(db, staff, `product.${status}`, "product", productId, { from: before?.catalog_status, to: status });
    return `Product ${status === "published" ? "published" : status === "archived" ? "archived" : "moved to draft"}.`;
  });
}

export async function updateSpecVerification(form: FormData) {
  return runAdminAction(["moderator"], form, "/admin/catalog", async (staff, db) => {
    const specId = id(form, "specId");
    const verified = form.get("verified") === "on";
    const source = optional(form, "verification_source", 500);
    if (verified && !source) throw new AdminInputError("Say where the spec was verified (for example the manufacturer's spec sheet).");
    const { data: before } = await db.from("bat_specifications").select("product_id, verified, verification_source").eq("id", specId).single();
    if (!before) throw new AdminInputError("Spec not found.");
    must(await db.from("bat_specifications").update({ verified, verification_source: source }).eq("id", specId));
    await log(db, staff, "bat_spec.verification_updated", "bat_specification", specId, {
      product_id: before.product_id,
      from: { verified: before.verified, source: before.verification_source },
      to: { verified, source },
    });
    return verified ? "Spec marked verified." : "Spec marked unverified.";
  });
}

export async function reviewSubmission(form: FormData) {
  return runAdminAction(["moderator"], form, "/admin/catalog/submissions", async (staff, db) => {
    const submissionId = id(form, "submissionId");
    const approve = text(form, "decision") === "approve";
    const notes = optional(form, "notes", 2000);
    if (!approve) {
      must(await db.rpc("admin_review_submission", { p_actor: staff.user.id, p_submission: submissionId, p_approve: false, p_notes: notes }));
      return "Submission rejected.";
    }
    const productName = text(form, "product_name", 200);
    const slug = parseSlug(text(form, "slug") || productName);
    if (productName.length < 3 || !slug) throw new AdminInputError("Give the new product a name.");
    const manufacturerId = text(form, "manufacturer_id");
    const product = {
      product_name: productName,
      model_name: text(form, "model_name", 200) || undefined,
      model_year: year(form, "model_year") ?? undefined,
      slug,
      manufacturer_id: uuid.safeParse(manufacturerId).success ? manufacturerId : undefined,
      catalog_status: text(form, "publish") === "on" ? "published" : "draft",
    };
    let spec: Record<string, unknown> | null = null;
    const weight = text(form, "weight_oz");
    if (weight || text(form, "weighting_type")) {
      if (weight && !(Number(weight) >= 18 && Number(weight) <= 40)) throw new AdminInputError("Weight must be between 18 and 40 oz.");
      const weighting = text(form, "weighting_type") || "unknown";
      if (!(WEIGHTINGS as readonly string[]).includes(weighting)) throw new AdminInputError("Unknown weighting.");
      spec = { weight_oz: weight ? Number(weight) : null, weighting_type: weighting };
    }
    const res = await db.rpc("admin_review_submission", {
      p_actor: staff.user.id,
      p_submission: submissionId,
      p_approve: true,
      p_notes: notes,
      p_product: product,
      p_bat_spec: spec,
    });
    if (res.error?.message.includes("products_slug_key")) throw new AdminInputError("A product with that slug already exists. Change the slug.");
    const productId = must(res) as string;
    return { notice: "Approved. The new product is ready to review.", to: `/admin/catalog/${productId}` };
  });
}

export async function saveManufacturer(form: FormData) {
  return runAdminAction(["moderator"], form, "/admin/catalog/manufacturers", async (staff, db) => {
    const existing = text(form, "manufacturerId");
    const name = text(form, "name", 80);
    if (name.length < 2) throw new AdminInputError("Enter the manufacturer's name.");
    const slug = parseSlug(text(form, "slug") || name);
    const website = text(form, "website_url");
    if (website && !parseHttpsUrl(website)) throw new AdminInputError("The website must start with https://.");
    const row = {
      name,
      slug: slug!,
      website_url: website ? parseHttpsUrl(website) : null,
      aliases: text(form, "aliases", 500)
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20),
      active: form.get("active") === "on",
    };
    if (existing) {
      const mid = id(form, "manufacturerId");
      const { data: before } = await db.from("manufacturers").select("*").eq("id", mid).single();
      if (!before) throw new AdminInputError("Manufacturer not found.");
      must(await db.from("manufacturers").update(row).eq("id", mid));
      await log(db, staff, "manufacturer.updated", "manufacturer", mid, { changes: diff(before, row) });
      return `Saved ${name}.`;
    }
    const created = must(await db.from("manufacturers").insert(row).select("id").single()) as { id: string };
    await log(db, staff, "manufacturer.created", "manufacturer", created.id, row);
    return `Added ${name}.`;
  });
}

export async function saveCategory(form: FormData) {
  return runAdminAction(["admin"], form, "/admin/catalog/categories", async (staff, db) => {
    const existing = text(form, "categoryId");
    const name = text(form, "name", 80);
    if (name.length < 2) throw new AdminInputError("Enter the category name.");
    const slug = parseSlug(text(form, "slug") || name);
    const schema = parseAttributeSchema(text(form, "attribute_schema", 20000) || "[]");
    if (!schema.ok) throw new AdminInputError(`Listing fields: ${schema.error}`);
    const order = Number(text(form, "display_order") || "0");
    if (!Number.isInteger(order) || order < 0 || order > 1000) throw new AdminInputError("Display order must be a whole number from 0 to 1000.");
    const row = {
      name,
      slug: slug!,
      description: optional(form, "description", 500),
      attribute_schema: schema.value,
      display_order: order,
      active: form.get("active") === "on",
    };
    if (existing) {
      const cid = id(form, "categoryId");
      const { data: before } = await db.from("product_categories").select("*").eq("id", cid).single();
      if (!before) throw new AdminInputError("Category not found.");
      must(await db.from("product_categories").update(row).eq("id", cid));
      await log(db, staff, "category.updated", "product_category", cid, { changes: diff(before, row) });
      return `Saved ${name}.`;
    }
    const created = must(await db.from("product_categories").insert(row).select("id").single()) as { id: string };
    await log(db, staff, "category.created", "product_category", created.id, { name, slug });
    return `Added ${name}.`;
  });
}
