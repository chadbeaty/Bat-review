import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentFee } from "@/lib/settings";
import { getSellCategories, getSellManufacturers, loadListingSnapshot } from "@/lib/sell/server";
import { isStepKey, type StepKey } from "@/lib/sell/listing";
import { ListingWizard } from "@/components/sell/ListingWizard";

export const metadata: Metadata = { title: "New listing", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewListingPage({ searchParams }: PageProps<"/sell/new">) {
  const params = await searchParams;
  const supabase = await createClient();
  if (!supabase) redirect("/sell");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/sell/new");

  const listingId = typeof params.listing === "string" ? params.listing : null;
  const requested = typeof params.step === "string" && isStepKey(params.step) ? params.step : null;

  const [categories, manufacturers, fee, snapshot] = await Promise.all([
    getSellCategories(supabase),
    getSellManufacturers(supabase),
    getCurrentFee("seller_commission"),
    listingId && UUID.test(listingId) ? loadListingSnapshot(supabase, auth.user.id, listingId) : Promise.resolve(null),
  ]);
  if (listingId && !snapshot) notFound();
  // Reserved and sold listings are read-only. Live listings stay here, so publishing doesn't navigate away.
  if (snapshot && ["reserved", "sold"].includes(snapshot.listing.listing_status)) redirect(`/seller/listings/${snapshot.listing.id}/edit`);

  // A resumed draft opens on the step the seller asked for, or on details (steps 1–3 are already done).
  let step: StepKey = requested ?? (snapshot ? "details" : "category");
  if (snapshot && snapshot.listing.listing_status !== "draft" && ["category", "manufacturer", "model"].includes(step)) step = "details";

  return (
    <div className="wrap grid max-w-4xl gap-6 py-8 md:py-12">
      <div className="grid gap-2">
        <p className="eyebrow">{!snapshot ? "New listing" : snapshot.listing.listing_status === "draft" ? "Resume your draft" : "Edit listing"}</p>
        <h1 className="display text-4xl font-bold break-words md:text-5xl">{snapshot ? snapshot.listing.title : "List your gear"}</h1>
        <p className="text-ink-soft">
          About three minutes with your photos ready.{" "}
          <Link href="/sell" className="underline">
            How selling works
          </Link>
        </p>
      </div>
      <ListingWizard
        key={snapshot?.listing.id ?? "new"}
        userId={auth.user.id}
        categories={categories}
        manufacturers={manufacturers}
        fee={fee}
        initial={snapshot}
        initialStep={step}
        basePath="/sell/new"
      />
    </div>
  );
}
