import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAllBats } from "@/lib/bats";
import { EmptyState } from "@/components/EmptyState";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Watchlist", robots: { index: false } };

const ALERT_LABELS: Record<string, string> = {
  first_published_review: "First published owner review",
  early_reports_threshold: "Early owner reports",
  first_listing: "First listing",
};

async function removeSearch(form: FormData) {
  "use server";
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("saved_searches").delete().eq("id", id).eq("user_id", data.user.id);
  revalidatePath("/account/watchlist");
}

/** One place for everything a member is keeping an eye on: saved listings, saved searches, watched bat models and new-model alerts. */
export default async function WatchlistPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/account/watchlist");
  const uid = auth.user.id;

  const [favs, searches, watched, alerts, bats] = await Promise.all([
    supabase.from("favorites").select("id", { count: "exact", head: true }).eq("user_id", uid),
    supabase.from("saved_searches").select("id, name, query, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(50),
    supabase.from("product_watchlist").select("id, product_id, target_price_cents").eq("user_id", uid).order("created_at", { ascending: false }).limit(100),
    supabase.from("review_alerts").select("id, product_id, notify_on").eq("user_id", uid).limit(200),
    getAllBats().catch(() => []),
  ]);
  const byId = new Map(bats.map((b) => [b.id, b]));
  const alertsByProduct = new Map<string, string[]>();
  for (const a of alerts.data ?? []) alertsByProduct.set(a.product_id, [...(alertsByProduct.get(a.product_id) ?? []), a.notify_on]);
  const watchedIds = new Set((watched.data ?? []).map((w) => w.product_id));
  const alertOnly = [...alertsByProduct.keys()].filter((id) => !watchedIds.has(id));
  const savedCount = favs.count ?? 0;

  const searchHref = (q: unknown) => {
    const o = (q ?? {}) as { path?: string; params?: string };
    const path = o.path && /^\/(shop(\/[a-z0-9-]{1,40})?|bats)$/.test(o.path) ? o.path : "/bats";
    return path + (o.params ?? "");
  };

  return (
    <div className="wrap grid gap-8 py-8 sm:py-10">
      <div className="grid gap-2">
        <p className="eyebrow">
          <Link href="/account" className="hover:underline">
            Your account
          </Link>
        </p>
        <h1 className="display text-4xl font-bold sm:text-5xl">Watchlist</h1>
        <p className="max-w-2xl text-ink-soft">Saved bats, saved searches, bat models you watch and new-model review alerts. Only you can see this page.</p>
      </div>

      <section className="grid gap-3" aria-labelledby="w-saved">
        <h2 id="w-saved" className="display text-2xl font-bold">Saved listings</h2>
        <p className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <span>{savedCount ? `${savedCount} saved ${savedCount === 1 ? "listing" : "listings"}` : "Nothing saved yet. Tap the heart on any bat."}</span>
          <Link href="/account/favorites" className="btn btn-outline min-h-11">
            Open saved listings
          </Link>
        </p>
      </section>

      <section className="grid gap-3" aria-labelledby="w-searches">
        <h2 id="w-searches" className="display text-2xl font-bold">Saved searches</h2>
        {(searches.data ?? []).length === 0 ? (
          <EmptyState title="No saved searches" body="Filter the bats, then choose Save this search at the bottom of the results." action={{ href: "/bats", label: "Shop bats" }} />
        ) : (
          <ul className="grid gap-2">
            {(searches.data ?? []).map((s) => (
              <li key={s.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
                <Link href={searchHref(s.query)} className="min-h-11 flex-1 py-2.5 font-semibold underline">
                  {s.name}
                </Link>
                <form action={removeSearch}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="btn btn-outline min-h-11 px-3 text-sm">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="w-models">
        <h2 id="w-models" className="display text-2xl font-bold">Watched bat models</h2>
        {(watched.data ?? []).length === 0 ? (
          <EmptyState title="No watched models" body="Open any bat in the archive and choose Watch to get a price-target alert." action={{ href: "/manufacturers", label: "Open the bat archive" }} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {(watched.data ?? []).map((w) => {
              const bat = byId.get(w.product_id);
              return (
                <li key={w.id} className="card grid gap-1 p-3">
                  {bat ? (
                    <Link href={bat.path} className="font-semibold underline">
                      {bat.manufacturerName} {bat.productName.replace(`${bat.manufacturerName} `, "")}
                    </Link>
                  ) : (
                    <span className="font-semibold">A bat model</span>
                  )}
                  <span className="text-sm text-ink-soft">{w.target_price_cents ? `Target price ${formatPrice(w.target_price_cents)}` : "No target price"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="w-alerts">
        <h2 id="w-alerts" className="display text-2xl font-bold">New-model review alerts</h2>
        {alertsByProduct.size === 0 ? (
          <p className="text-ink-soft">
            No alerts yet. On a new bat&apos;s page, choose which alerts you want (first owner review, early reports or first listing).
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {[...alertsByProduct.entries()].map(([pid, kinds]) => {
              const bat = byId.get(pid);
              return (
                <li key={pid} className="card grid gap-1 p-3">
                  {bat ? (
                    <Link href={bat.path} className="font-semibold underline">
                      {bat.manufacturerName} {bat.productName.replace(`${bat.manufacturerName} `, "")}
                    </Link>
                  ) : (
                    <span className="font-semibold">A bat model</span>
                  )}
                  <span className="text-sm text-ink-soft">{kinds.map((k) => ALERT_LABELS[k] ?? k).join(", ")}</span>
                </li>
              );
            })}
          </ul>
        )}
        {alertOnly.length > 0 && <p className="sr-only">{alertOnly.length} models have alerts without being on the watch list.</p>}
      </section>

      <p className="flex flex-wrap gap-3">
        <Link href="/manufacturers" className="btn btn-outline min-h-11">
          Bat archive
        </Link>
        <Link href="/price-guide" className="btn btn-outline min-h-11">
          Price guide
        </Link>
      </p>
    </div>
  );
}
