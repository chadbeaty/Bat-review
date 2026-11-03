import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListingCard } from "@/components/ListingCard";
import { EmptyState } from "@/components/EmptyState";
import { FavoriteButton } from "@/components/listing/FavoriteButton";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Saved listings", robots: { index: false } };

type FavoriteRow = {
  id: string;
  listing_id: string;
  created_at: string;
  equipment_listings: {
    id: string;
    title: string;
    asking_price_cents: number;
    condition_score: number | null;
    location_city: string | null;
    location_state: string | null;
    published_at: string | null;
    listing_status: string;
    listing_images: { image_url: string; alt_text: string | null; display_order: number }[] | null;
  } | null;
};

const STATUS_NOTE: Record<string, string> = { sold: "Sold", reserved: "Reserved" };

export default async function FavoritesPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/account/favorites");

  const { data } = await supabase
    .from("favorites")
    .select(
      "id, listing_id, created_at, equipment_listings(id, title, asking_price_cents, condition_score, location_city, location_state, published_at, listing_status, listing_images(image_url, alt_text, display_order))"
    )
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const favorites = (data ?? []) as unknown as FavoriteRow[];

  return (
    <div className="wrap grid gap-6 py-10">
      <div className="grid gap-2">
        <p className="eyebrow">
          <Link href="/account" className="hover:underline">
            Your account
          </Link>
        </p>
        <h1 className="display text-5xl font-bold">Saved listings</h1>
        <p className="text-ink-soft">Listings you saved with the Save button. Only you can see this list.</p>
      </div>

      {favorites.length === 0 ? (
        <EmptyState title="Nothing saved yet" body="Tap Save on any listing to keep it here." action={{ href: "/bats", label: "Shop bats" }} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4" data-testid="favorites">
          {favorites.map((f) => {
            const l = f.equipment_listings;
            return (
              <li key={f.id} className="grid content-start gap-2">
                {l ? (
                  <>
                    <ListingCard
                      listing={{
                        id: l.id,
                        title: l.title,
                        status: STATUS_NOTE[l.listing_status] ? l.listing_status : undefined,
                        askingPriceCents: l.asking_price_cents,
                        conditionScore: l.condition_score,
                        locationCity: l.location_city,
                        locationState: l.location_state,
                        imageUrl: [...(l.listing_images ?? [])].sort((a, b) => a.display_order - b.display_order)[0]?.image_url ?? null,
                        imageAlt: null,
                        publishedAt: l.published_at,
                      }}
                    />
                  </>
                ) : (
                  <div className="card grid gap-1 p-3 text-sm text-ink-soft">This listing is no longer available.</div>
                )}
                <FavoriteButton listingId={f.listing_id} signedIn saved next="/account/favorites" compact />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
