import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { readFlash } from "@/lib/admin/action";
import { CATALOG_STATUSES } from "@/lib/admin/catalog";
import { searchTerm } from "@/lib/admin/validation";
import { AdminTitle, Badge, Empty, Flash, Pager, ReturnTo, SubmitButton, Table, pageNumber, param } from "@/components/admin/ui";
import { setProductStatus } from "./actions";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 50;

type Row = {
  id: string;
  product_name: string;
  model_year: number | null;
  catalog_status: string;
  certification_status: string;
  certification_association: string[];
  manufacturers: { name: string } | null;
  product_categories: { name: string } | null;
};

export default async function CatalogPage({ searchParams }: PageProps<"/admin/catalog">) {
  await requireStaff(["moderator"], "/admin/catalog");
  const sp = await searchParams;
  const q = searchTerm(param(sp, "q"));
  const status = (CATALOG_STATUSES as readonly string[]).includes(param(sp, "status")) ? param(sp, "status") : "";
  const page = pageNumber(sp);
  let query = adminDb()
    .from("products")
    .select("id, product_name, model_year, catalog_status, certification_status, certification_association, manufacturers(name), product_categories(name)")
    .order("model_year", { ascending: false, nullsFirst: false })
    .order("product_name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (q) query = query.ilike("product_name", `%${q}%`);
  if (status) query = query.eq("catalog_status", status);
  const { data, error } = await query;
  const rows = ((data ?? []) as unknown as Row[]).slice(0, PAGE_SIZE);
  const here = `/admin/catalog?${new URLSearchParams({ q, status, page: String(page) }).toString()}`;

  return (
    <>
      <AdminTitle title="Products" intro="The master catalog of models. Open a product to correct its details, stamps and certification status." />
      <Flash flash={readFlash(sp)} />
      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="field">
          <span className="text-sm">Name contains</span>
          <input name="q" defaultValue={q} className="input w-64" />
        </label>
        <label className="field">
          <span className="text-sm">Status</span>
          <select name="status" defaultValue={status} className="input">
            <option value="">Any</option>
            {CATALOG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary">Search</button>
      </form>
      {error ? (
        <p className="text-danger">Couldn&apos;t load products: {error.message}</p>
      ) : rows.length === 0 ? (
        <Empty>No products match.</Empty>
      ) : (
        <Table label="Products">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Stamps</th>
              <th>Certification</th>
              <th>Status</th>
              <th>Quick action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/admin/catalog/${p.id}`} className="font-medium underline">
                    {p.product_name}
                  </Link>
                  <span className="block text-xs text-ink-soft">{p.manufacturers?.name ?? "No manufacturer"}</span>
                </td>
                <td>{p.product_categories?.name}</td>
                <td>{p.certification_association.join(", ") || "—"}</td>
                <td>
                  <Badge tone={p.certification_status === "unverified" ? "warn" : p.certification_status === "decertified" ? "bad" : "good"}>
                    {p.certification_status.replace(/_/g, " ")}
                  </Badge>
                </td>
                <td>
                  <Badge tone={p.catalog_status === "published" ? "good" : "neutral"}>{p.catalog_status.replace("_", " ")}</Badge>
                </td>
                <td>
                  <form action={setProductStatus}>
                    <ReturnTo path={here} />
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="catalog_status" value={p.catalog_status === "published" ? "archived" : "published"} />
                    <SubmitButton tone="outline">{p.catalog_status === "published" ? "Archive" : "Publish"}</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager basePath="/admin/catalog" params={{ q, status }} page={page} hasMore={(data ?? []).length > PAGE_SIZE} />
    </>
  );
}
