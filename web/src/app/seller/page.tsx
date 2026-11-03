import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sellerPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Seller dashboard", robots: { index: false } };

export default async function SellerDashboard() {
  const supabase = await createClient();
  if (!supabase) redirect("/sell");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/seller");

  const count = async (statuses: string[]) => {
    const { count: n } = await supabase
      .from("equipment_listings")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", auth.user.id)
      .in("listing_status", statuses);
    return n ?? 0;
  };
  const [drafts, active, sold, profile] = await Promise.all([
    count(["draft"]),
    count(["active"]),
    count(["reserved", "sold"]),
    supabase.from("profiles").select("username").eq("id", auth.user.id).maybeSingle(),
  ]);

  const tiles = [
    { label: "Drafts", value: drafts, href: "/seller/listings?tab=drafts" },
    { label: "Live", value: active, href: "/seller/listings?tab=active" },
    { label: "Reserved or sold", value: sold, href: "/seller/listings?tab=sold" },
  ];

  return (
    <div className="wrap grid gap-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <p className="eyebrow">Selling</p>
          <h1 className="display text-5xl font-bold">Seller dashboard</h1>
        </div>
        <Link href="/sell/new" className="btn btn-primary">
          Start a listing
        </Link>
      </div>

      <ul className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link href={t.href} className="card grid gap-1 p-5 no-underline hover:border-ink">
              <span className="font-mono text-4xl">{t.value}</span>
              <span className="font-semibold">{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="card grid content-start gap-2 p-5">
          <h2 className="font-semibold">Your listings</h2>
          <p className="text-sm text-ink-soft">Resume drafts, change prices, or take items down.</p>
          <Link href="/seller/listings" className="text-sm font-semibold underline">
            Manage listings
          </Link>
        </section>
        <section className="card grid content-start gap-2 p-5">
          <h2 className="font-semibold">Profile</h2>
          <p className="text-sm text-ink-soft">Buyers see your username, photo, bio, city and state.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
            <Link href="/account/profile" className="underline">
              Edit profile
            </Link>
            {profile.data?.username && (
              <Link href={sellerPath(profile.data.username)} className="underline">
                Public profile
              </Link>
            )}
          </div>
        </section>
        <section className="card grid content-start gap-2 p-5">
          <h2 className="font-semibold">Catalog requests</h2>
          <p className="text-sm text-ink-soft">Models you asked us to add to the catalog.</p>
          <Link href="/account/catalog-requests" className="text-sm font-semibold underline">
            View requests
          </Link>
        </section>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/seller/orders" className="btn btn-outline">
          Orders to ship
        </Link>
        <Link href="/seller/payouts" className="btn btn-outline">
          Payouts
        </Link>
      </div>
    </div>
  );
}
