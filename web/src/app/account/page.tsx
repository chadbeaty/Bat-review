import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

type Profile = {
  username: string;
  display_name: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  seller_verified: boolean;
  created_at: string;
};

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/account");

  const [{ data: profile }, { data: staffRoles }] = await Promise.all([
    supabase.rpc("get_my_profile").single<Profile>(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
  ]);
  const { notice } = await searchParams;
  const memberSince = profile ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null;

  return (
    <div className="wrap grid gap-8 py-10">
      {notice === "password-updated" && (
        <p role="status" className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-success">
          Your password was updated.
        </p>
      )}
      <div className="grid gap-2">
        <p className="eyebrow">Your account</p>
        <h1 className="display text-5xl font-bold">{profile?.display_name || profile?.username || "Welcome"}</h1>
        <p className="text-ink-soft">
          @{profile?.username}
          {memberSince ? ` · Member since ${memberSince}` : ""}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="card grid content-start gap-2 p-5">
          <h2 className="font-semibold">Profile</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-soft">Email</dt>
            <dd>{profile?.email ?? auth.user.email}</dd>
            <dt className="text-ink-soft">Location</dt>
            <dd>{[profile?.city, profile?.state].filter(Boolean).join(", ") || "Not set"}</dd>
            <dt className="text-ink-soft">Seller status</dt>
            <dd>{profile?.seller_verified ? "Verified seller" : "Not verified yet"}</dd>
          </dl>
          <Link href="/account/profile" className="text-sm font-semibold underline">
            Edit profile
          </Link>
        </section>
        <section className="card grid content-start gap-2 p-5">
          <h2 className="font-semibold">Buying</h2>
          <Link href="/account/watchlist" className="text-sm font-semibold underline">
            Watchlist
          </Link>
          <Link href="/account/favorites" className="text-sm font-semibold underline">
            Saved listings
          </Link>
          <Link href="/account/purchases" className="text-sm font-semibold underline">
            Your purchases
          </Link>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
            <Link href="/messages" className="underline">
              Messages
            </Link>
            <Link href="/account/offers" className="underline">
              Offers
            </Link>
            <Link href="/account/notifications" className="underline">
              Notifications
            </Link>
          </div>
        </section>
        <section className="card grid content-start gap-2 p-5">
          <h2 className="font-semibold">Selling</h2>
          <p className="text-sm text-ink-soft">List gear, resume drafts, ship orders and set up payouts through Stripe.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
            <Link href="/seller" className="underline">
              Seller dashboard
            </Link>
            <Link href="/sell/new" className="underline">
              Start a listing
            </Link>
            <Link href="/account/catalog-requests" className="underline">
              Catalog requests
            </Link>
          </div>
        </section>
      </div>

      <p className="flex flex-wrap gap-3">
        <Link href="/account/security" className="btn btn-outline">
          Sign-in security
        </Link>
        {(staffRoles ?? []).length > 0 && (
          <Link href="/admin" className="btn btn-outline">
            Admin
          </Link>
        )}
      </p>

      <form action={signOut}>
        <button type="submit" className="btn btn-outline">
          Sign out
        </button>
      </form>
    </div>
  );
}
