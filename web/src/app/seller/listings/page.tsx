import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { listingPath } from "@/lib/paths";
import { STATUS_LABELS } from "@/lib/sell/listing";
import { EmptyState } from "@/components/EmptyState";
import { ListingRowActions } from "@/components/sell/ListingRowActions";

export const metadata: Metadata = { title: "Your listings", robots: { index: false } };

const TABS = [
  { key: "drafts", label: "Drafts", statuses: ["draft"] },
  { key: "active", label: "Live", statuses: ["active", "pending_review"] },
  { key: "sold", label: "Reserved and sold", statuses: ["reserved", "sold"] },
  { key: "ended", label: "Removed and expired", statuses: ["removed", "expired"] },
] as const;

type Row = {
  id: string;
  title: string;
  asking_price_cents: number | null;
  listing_status: string;
  updated_at: string;
  published_at: string | null;
  expires_at: string | null;
  listing_images: { image_url: string; display_order: number }[] | null;
};

const date = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function SellerListingsPage({ searchParams }: PageProps<"/seller/listings">) {
  const supabase = await createClient();
  if (!supabase) redirect("/sell");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/seller/listings");
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t.key === tabParam) ?? TABS[0];

  const { data } = await supabase
    .from("equipment_listings")
    .select("id, title, asking_price_cents, listing_status, updated_at, published_at, expires_at, listing_images(image_url, display_order)")
    .eq("seller_id", auth.user.id)
    .order("updated_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as Row[];
  const counts = Object.fromEntries(TABS.map((t) => [t.key, rows.filter((r) => (t.statuses as readonly string[]).includes(r.listing_status)).length]));
  const shown = rows.filter((r) => (tab.statuses as readonly string[]).includes(r.listing_status));

  return (
    <div className="wrap grid gap-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <p className="eyebrow">
            <Link href="/seller" className="underline">
              Seller dashboard
            </Link>
          </p>
          <h1 className="display text-5xl font-bold">Your listings</h1>
        </div>
        <Link href="/sell/new" className="btn btn-accent">
          Start a listing
        </Link>
      </div>

      <nav aria-label="Listing status" className="-mx-1 overflow-x-auto">
        <ul className="flex min-w-max gap-1 px-1 border-b border-line">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={`/seller/listings?tab=${t.key}`}
                aria-current={t.key === tab.key ? "page" : undefined}
                className={`-mb-px block border-b-2 px-3 py-2 text-sm font-semibold no-underline ${t.key === tab.key ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}
              >
                {t.label} <span className="font-mono text-ink-soft">{counts[t.key]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {shown.length === 0 ? (
        <EmptyState
          title={`No ${tab.label.toLowerCase()}`}
          body={tab.key === "drafts" ? "Drafts you start are saved here so you can finish them later." : "Listings show up here as their status changes."}
          action={tab.key === "drafts" || tab.key === "active" ? { href: "/sell/new", label: "Start a listing" } : undefined}
        />
      ) : (
        <ul className="grid gap-3" aria-label={tab.label}>
          {shown.map((r) => {
            const cover = [...(r.listing_images ?? [])].sort((a, b) => a.display_order - b.display_order)[0];
            return (
              <li key={r.id} className="card grid grid-cols-[64px_1fr] gap-3 p-3 sm:grid-cols-[80px_1fr_auto] sm:items-center" data-listing-id={r.id}>
                <div className="h-16 w-16 overflow-hidden rounded bg-paper sm:h-20 sm:w-20">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-ink-soft">No photo</div>
                  )}
                </div>
                <div className="grid min-w-0 gap-0.5">
                  <p className="font-semibold break-words">{r.title}</p>
                  <p className="text-sm text-ink-soft">
                    {[
                      STATUS_LABELS[r.listing_status] ?? r.listing_status,
                      r.asking_price_cents != null ? formatPrice(r.asking_price_cents) : "No price yet",
                      r.listing_status === "active" && r.expires_at ? `Expires ${date(r.expires_at)}` : `Updated ${date(r.updated_at)}`,
                    ].join(" · ")}
                  </p>
                </div>
                <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:justify-end">
                  {r.listing_status === "draft" && (
                    <Link href={`/sell/new?listing=${r.id}`} className="btn btn-primary px-3 py-1.5 text-sm">
                      Resume draft
                    </Link>
                  )}
                  {r.listing_status === "active" && (
                    <Link href={listingPath(r.id)} className="btn btn-outline px-3 py-1.5 text-sm">
                      View
                    </Link>
                  )}
                  {["reserved", "sold"].includes(r.listing_status) ? (
                    <Link href={`/seller/listings/${r.id}/edit`} className="btn btn-outline px-3 py-1.5 text-sm">
                      Details
                    </Link>
                  ) : (
                    <Link href={`/seller/listings/${r.id}/edit`} className="btn btn-outline px-3 py-1.5 text-sm">
                      {r.listing_status === "removed" || r.listing_status === "expired" ? "Edit or relist" : "Edit"}
                    </Link>
                  )}
                  <ListingRowActions id={r.id} title={r.title} status={r.listing_status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
