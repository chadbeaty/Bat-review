import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { readFlash } from "@/lib/admin/action";
import { searchTerm, uuid } from "@/lib/admin/validation";
import { formatPrice } from "@/lib/format";
import { listingPath } from "@/lib/paths";
import { AdminTitle, Badge, Empty, Flash, Pager, ReturnTo, SubmitButton, Table, dateOnly, pageNumber, param } from "@/components/admin/ui";
import { removeListing, setFeatured } from "./actions";

export const metadata: Metadata = { title: "Listings" };

const STATUSES = ["draft", "pending_review", "active", "reserved", "sold", "removed", "expired"];
const PAGE_SIZE = 40;

type Row = {
  id: string;
  title: string;
  asking_price_cents: number;
  listing_status: string;
  featured: boolean;
  featured_until: string | null;
  published_at: string | null;
  created_at: string;
  seller_id: string;
  profiles: { username: string } | null;
  product_categories: { name: string } | null;
};

export default async function ListingsPage({ searchParams }: PageProps<"/admin/listings">) {
  await requireStaff(["moderator"], "/admin/listings");
  const sp = await searchParams;
  const status = STATUSES.includes(param(sp, "status")) ? param(sp, "status") : "";
  const category = uuid.safeParse(param(sp, "category")).success ? param(sp, "category") : "";
  const q = searchTerm(param(sp, "q"));
  const page = pageNumber(sp);
  const confirmId = param(sp, "confirm") === "remove" && uuid.safeParse(param(sp, "id")).success ? param(sp, "id") : "";

  const onlyId = !confirmId && uuid.safeParse(param(sp, "id")).success ? param(sp, "id") : "";
  const db = adminDb();
  let query = db
    .from("equipment_listings")
    .select("id, title, asking_price_cents, listing_status, featured, featured_until, published_at, created_at, seller_id, profiles!equipment_listings_seller_id_fkey(username), product_categories(name)")
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (status) query = query.eq("listing_status", status);
  if (category) query = query.eq("category_id", category);
  if (q) query = query.ilike("title", `%${q}%`);
  if (onlyId) query = query.eq("id", onlyId);
  const [{ data, error }, { data: categories }] = await Promise.all([query, db.from("product_categories").select("id, name").order("display_order")]);
  const rows = ((data ?? []) as unknown as Row[]).slice(0, PAGE_SIZE);
  const filters = { status, category, q };
  const here = `/admin/listings?${new URLSearchParams({ ...filters, page: String(page) }).toString()}`;
  const confirming = confirmId ? rows.find((r) => r.id === confirmId) : undefined;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <AdminTitle title="Listings" intro="Remove listings that break the rules (the seller is notified with your reason), and feature good ones." />
      <Flash flash={readFlash(sp)} />

      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="field">
          <span className="text-sm">Title contains</span>
          <input name="q" defaultValue={q} className="input w-56" />
        </label>
        <label className="field">
          <span className="text-sm">Status</span>
          <select name="status" defaultValue={status} className="input">
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="text-sm">Category</span>
          <select name="category" defaultValue={category} className="input">
            <option value="">Any</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary">Filter</button>
      </form>

      {confirming && (
        <form action={removeListing} className="grid gap-3 rounded-md border border-danger/40 bg-danger/5 p-4">
          <ReturnTo path={here} />
          <input type="hidden" name="listingId" value={confirming.id} />
          <p className="font-semibold text-danger">Remove “{confirming.title}”?</p>
          <p className="text-sm">The listing comes down straight away and @{confirming.profiles?.username} gets a notification with your reason. This can&apos;t be undone from here.</p>
          <label className="field text-sm">
            <span>Reason the seller will see</span>
            <textarea name="reason" required minLength={5} maxLength={1000} rows={2} className="input" />
          </label>
          <p className="flex gap-2">
            <SubmitButton tone="danger">Confirm removal</SubmitButton>
            <Link href={here} className="btn btn-outline px-3 py-1.5 text-sm">
              Cancel
            </Link>
          </p>
        </form>
      )}

      {error ? (
        <p className="text-danger">Couldn&apos;t load listings: {error.message}</p>
      ) : rows.length === 0 ? (
        <Empty>No listings match.</Empty>
      ) : (
        <Table label="Listings">
          <thead>
            <tr>
              <th>Listing</th>
              <th>Seller</th>
              <th>Price</th>
              <th>Status</th>
              <th>Featured</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} data-listing={l.id}>
                <td>
                  {["active", "reserved", "sold"].includes(l.listing_status) ? (
                    <Link href={listingPath(l.id)} className="font-medium underline">
                      {l.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{l.title}</span>
                  )}
                  <span className="block text-xs text-ink-soft">
                    {l.product_categories?.name} · listed {dateOnly(l.published_at ?? l.created_at)}
                  </span>
                </td>
                <td>
                  <Link href={`/admin/users/${l.seller_id}`} className="underline">
                    @{l.profiles?.username}
                  </Link>
                </td>
                <td className="font-mono">{formatPrice(l.asking_price_cents)}</td>
                <td>
                  <Badge tone={l.listing_status === "active" ? "good" : l.listing_status === "removed" ? "bad" : "neutral"}>{l.listing_status}</Badge>
                </td>
                <td className="text-xs">{l.featured ? `Until ${dateOnly(l.featured_until)}` : "—"}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {l.listing_status === "active" && (
                      <form action={setFeatured} className="flex items-center gap-1">
                        <ReturnTo path={here} />
                        <input type="hidden" name="listingId" value={l.id} />
                        <input type="date" name="until" min={today} required aria-label="Feature until" className="input w-36 px-2 py-1 text-xs" />
                        <SubmitButton tone="outline">Feature</SubmitButton>
                      </form>
                    )}
                    {l.featured && (
                      <form action={setFeatured}>
                        <ReturnTo path={here} />
                        <input type="hidden" name="listingId" value={l.id} />
                        <SubmitButton tone="outline">Unfeature</SubmitButton>
                      </form>
                    )}
                    {!["removed", "reserved", "sold"].includes(l.listing_status) && (
                      <Link
                        href={`/admin/listings?${new URLSearchParams({ ...filters, page: String(page), confirm: "remove", id: l.id }).toString()}`}
                        className="btn btn-outline px-3 py-1.5 text-sm text-danger"
                      >
                        Remove…
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager basePath="/admin/listings" params={filters} page={page} hasMore={(data ?? []).length > PAGE_SIZE} />
    </>
  );
}
