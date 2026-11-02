import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { readFlash } from "@/lib/admin/action";
import { CATALOG_STATUSES, CERT_STATUSES, STAMPS } from "@/lib/admin/catalog";
import { uuid } from "@/lib/admin/validation";
import { AdminTitle, Flash, ReturnTo, SubmitButton, Table, dateTime } from "@/components/admin/ui";
import { updateProduct, updateSpecVerification } from "../actions";

export const metadata: Metadata = { title: "Edit product" };

export default async function ProductEditPage({ params, searchParams }: PageProps<"/admin/catalog/[id]">) {
  const { id } = await params;
  await requireStaff(["moderator"], `/admin/catalog/${id}`);
  if (!uuid.safeParse(id).success) notFound();
  const sp = await searchParams;
  const db = adminDb();
  const [{ data: p }, { data: specs }, { data: categories }, { data: manufacturers }] = await Promise.all([
    db.from("products").select("*").eq("id", id).maybeSingle(),
    db.from("bat_specifications").select("id, weight_oz, length_inches, barrel_length_inches, weighting_type, construction_type, verified, verification_source").eq("product_id", id).order("weight_oz"),
    db.from("product_categories").select("id, name").order("display_order"),
    db.from("manufacturers").select("id, name").order("name"),
  ]);
  if (!p) notFound();
  const path = `/admin/catalog/${id}`;
  const stamps: string[] = p.certification_association ?? [];

  return (
    <>
      <p className="text-sm">
        <Link href="/admin/catalog" className="underline">
          Products
        </Link>
      </p>
      <AdminTitle title={p.product_name} intro={`Last updated ${dateTime(p.updated_at)}. Changes are recorded in the audit log.`} />
      <Flash flash={readFlash(sp)} />

      <form action={updateProduct} className="card grid gap-4 p-4 md:grid-cols-2">
        <ReturnTo path={path} />
        <input type="hidden" name="productId" value={p.id} />
        <label className="field text-sm">
          <span>Product name</span>
          <input name="product_name" defaultValue={p.product_name} required className="input" />
        </label>
        <label className="field text-sm">
          <span>Model name</span>
          <input name="model_name" defaultValue={p.model_name} required className="input" />
        </label>
        <label className="field text-sm">
          <span>Model year</span>
          <input name="model_year" type="number" min={1980} max={2100} defaultValue={p.model_year ?? ""} className="input" />
        </label>
        <label className="field text-sm">
          <span>URL slug</span>
          <input name="slug" defaultValue={p.slug} required className="input font-mono" />
        </label>
        <label className="field text-sm">
          <span>Category</span>
          <select name="category_id" defaultValue={p.category_id} className="input">
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field text-sm">
          <span>Manufacturer</span>
          <select name="manufacturer_id" defaultValue={p.manufacturer_id ?? ""} className="input">
            <option value="">Not set</option>
            {(manufacturers ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field text-sm md:col-span-2">
          <span>Description</span>
          <textarea name="description" rows={3} defaultValue={p.description ?? ""} maxLength={5000} className="input" />
        </label>
        <label className="field text-sm md:col-span-2">
          <span>Official product page (https)</span>
          <input name="official_product_url" type="url" defaultValue={p.official_product_url ?? ""} className="input" />
        </label>

        <fieldset className="grid gap-2 text-sm md:col-span-2">
          <legend className="mb-1 font-medium">Stamps on the barrel</legend>
          <div className="flex flex-wrap gap-4">
            {STAMPS.map((s) => (
              <label key={s} className="flex items-center gap-1.5">
                <input type="checkbox" name="stamps" value={s} defaultChecked={stamps.includes(s)} /> {s}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field text-sm">
          <span>Certification status</span>
          <select name="certification_status" defaultValue={p.certification_status} className="input">
            {CERT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="field text-sm">
          <span>Certification source</span>
          <input name="certification_source" defaultValue={p.certification_source ?? ""} placeholder="For example, the USSSA approved bat list" className="input" />
        </label>
        <label className="field text-sm">
          <span>Original retail price ($)</span>
          <input name="original_retail_price" inputMode="decimal" defaultValue={p.original_retail_price_cents != null ? (p.original_retail_price_cents / 100).toFixed(2) : ""} className="input" />
        </label>
        <label className="field text-sm">
          <span>Price source</span>
          <input name="original_price_source" defaultValue={p.original_price_source ?? ""} className="input" />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" name="original_price_verified" defaultChecked={p.original_price_verified} /> Retail price checked against the source
        </label>
        <label className="field text-sm">
          <span>Release date</span>
          <input name="release_date" type="date" defaultValue={p.release_date ?? ""} className="input" />
        </label>
        <label className="field text-sm">
          <span>Release status</span>
          <select name="release_status" defaultValue={p.release_status ?? ""} className="input">
            <option value="">Unknown</option>
            <option value="announced">Announced</option>
            <option value="pre_order">Pre-order</option>
            <option value="released">Released</option>
          </select>
        </label>
        <label className="field text-sm">
          <span>Catalog status</span>
          <select name="catalog_status" defaultValue={p.catalog_status} className="input">
            {CATALOG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <p className="self-end md:col-span-2">
          <SubmitButton>Save product</SubmitButton>
        </p>
      </form>

      <section className="grid gap-2">
        <h2 className="font-semibold">Bat specs</h2>
        <p className="text-sm text-ink-soft">Mark a spec verified only after checking it against the manufacturer or an association list, and say where.</p>
        {(specs ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No spec rows for this product.</p>
        ) : (
          <Table label="Bat specs">
            <thead>
              <tr>
                <th>Weight</th>
                <th>Length</th>
                <th>Barrel</th>
                <th>Weighting</th>
                <th>Verification</th>
              </tr>
            </thead>
            <tbody>
              {(specs ?? []).map((s) => (
                <tr key={s.id}>
                  <td>{s.weight_oz ? `${s.weight_oz} oz` : "Not listed"}</td>
                  <td>{s.length_inches ? `${s.length_inches} in` : "—"}</td>
                  <td>{s.barrel_length_inches ? `${s.barrel_length_inches} in` : "—"}</td>
                  <td>{s.weighting_type}</td>
                  <td>
                    <form action={updateSpecVerification} className="flex flex-wrap items-center gap-2">
                      <ReturnTo path={path} />
                      <input type="hidden" name="specId" value={s.id} />
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="verified" defaultChecked={s.verified} /> Verified
                      </label>
                      <input name="verification_source" defaultValue={s.verification_source ?? ""} placeholder="Source" aria-label="Verification source" className="input w-48 px-2 py-1 text-xs" />
                      <SubmitButton tone="outline">Save</SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
