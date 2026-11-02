import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentFee } from "@/lib/settings";
import { getSellCategories, getSellManufacturers, loadListingSnapshot } from "@/lib/sell/server";
import { STATUS_LABELS, isStepKey, type StepKey } from "@/lib/sell/listing";
import { listingPath } from "@/lib/paths";
import { ListingWizard } from "@/components/sell/ListingWizard";
import { ListingPreview } from "@/components/sell/ListingPreview";

export const metadata: Metadata = { title: "Edit listing", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditListingPage({ params, searchParams }: PageProps<"/seller/listings/[id]/edit">) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  if (!supabase) redirect("/sell");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/sign-in?next=/seller/listings/${id}/edit`);
  if (!UUID.test(id)) notFound();

  const [categories, manufacturers, fee, snapshot] = await Promise.all([
    getSellCategories(supabase),
    getSellManufacturers(supabase),
    getCurrentFee("seller_commission"),
    loadListingSnapshot(supabase, auth.user.id, id),
  ]);
  if (!snapshot) notFound();
  const status = snapshot.listing.listing_status;
  const readOnly = status === "reserved" || status === "sold";
  const requested = typeof query.step === "string" && isStepKey(query.step) ? query.step : null;
  let step: StepKey = requested ?? "details";
  if (status !== "draft" && ["category", "manufacturer", "model"].includes(step)) step = "details";

  return (
    <div className="wrap grid max-w-4xl gap-6 py-8 md:py-12">
      <div className="grid gap-2">
        <p className="eyebrow">
          <Link href="/seller/listings" className="underline">
            Your listings
          </Link>{" "}
          · {STATUS_LABELS[status] ?? status}
        </p>
        <h1 className="display text-4xl font-bold break-words md:text-5xl">{snapshot.listing.title}</h1>
        {status === "active" && (
          <p>
            <Link href={listingPath(snapshot.listing.id)} className="text-sm font-semibold underline">
              View the live listing
            </Link>
          </p>
        )}
      </div>
      {readOnly ? (
        <div className="grid gap-4">
          <p role="status" className="rounded-md border border-line bg-paper px-3 py-2">
            This listing is {STATUS_LABELS[status].toLowerCase()}, so it can&apos;t be changed. Contact support if something about the sale
            needs fixing.
          </p>
          <div className="card p-4 sm:p-6">
            <ListingPreview
              listing={snapshot.listing}
              photos={snapshot.photos}
              fields={snapshot.category.fields}
              categoryName={snapshot.category.name}
              catalogModel={snapshot.product?.name ?? null}
            />
          </div>
        </div>
      ) : (
        <ListingWizard
          key={snapshot.listing.id}
          userId={auth.user.id}
          categories={categories}
          manufacturers={manufacturers}
          fee={fee}
          initial={snapshot}
          initialStep={step}
          basePath={`/seller/listings/${snapshot.listing.id}/edit`}
        />
      )}
    </div>
  );
}
