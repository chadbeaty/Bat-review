import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/EmptyState";

export const metadata: Metadata = { title: "Catalog requests", robots: { index: false } };

const STATUS: Record<string, { label: string; note: string }> = {
  pending: { label: "Waiting for review", note: "Our team checks the model's details before adding it." },
  approved: { label: "Added to the catalog", note: "The model is now in the catalog." },
  merged: { label: "Matched to an existing model", note: "It was already in the catalog under another name." },
  rejected: { label: "Not added", note: "We couldn't verify this model." },
};

type Row = {
  id: string;
  model_name: string;
  model_year: number | null;
  manufacturer_name: string | null;
  status: string;
  review_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  details: { listing_id?: string } | null;
  product_categories: { name: string } | null;
  manufacturers: { name: string } | null;
};

export default async function CatalogRequestsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/account/catalog-requests");

  const { data } = await supabase
    .from("product_submissions")
    .select("id, model_name, model_year, manufacturer_name, status, review_notes, created_at, reviewed_at, details, product_categories(name), manufacturers(name)")
    .eq("submitted_by", auth.user.id)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="wrap grid max-w-3xl gap-6 py-10">
      <div className="grid gap-2">
        <p className="eyebrow">
          <Link href="/account" className="underline">
            Your account
          </Link>
        </p>
        <h1 className="display text-5xl font-bold">Catalog requests</h1>
        <p className="text-ink-soft">
          When your model isn&apos;t in the catalog, choose &ldquo;My model isn&apos;t listed&rdquo; while listing. Your listing goes ahead either
          way.
        </p>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No catalog requests" body="You haven't asked us to add a model yet." action={{ href: "/sell/new", label: "Start a listing" }} />
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => {
            const s = STATUS[r.status] ?? { label: r.status, note: "" };
            const brand = r.manufacturers?.name === "Other" ? r.manufacturer_name : (r.manufacturers?.name ?? r.manufacturer_name);
            return (
              <li key={r.id} className="card grid gap-1 p-4">
                <p className="font-semibold">{[r.model_year, brand, r.model_name].filter(Boolean).join(" ")}</p>
                <p className="text-sm text-ink-soft">
                  {r.product_categories?.name} · Requested {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">{s.label}.</span> {s.note}
                </p>
                {r.review_notes && <p className="text-sm text-ink-soft">Reviewer note: {r.review_notes}</p>}
                {r.details?.listing_id && (
                  <Link href={`/seller/listings/${r.details.listing_id}/edit`} className="text-sm font-semibold underline">
                    Your listing
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
