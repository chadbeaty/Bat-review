import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { ProductList, type ProductListItem } from "@/components/ProductList";
import { requireMember } from "@/lib/auth/member";
import { aiConfigured } from "@/lib/ai/client";
import { ago, requestTime } from "@/lib/format";

export const metadata: Metadata = { title: "Overview" };

const COLS = "id, slug, canonical_name, primary_image_url, latest_score, latest_confidence, first_observed_at, latest_acceleration, status_changed_at, created_at";
const ACTIVE = ["new", "tracking"];

export default async function OverviewPage() {
  const { db } = await requireMember("/");
  const now = requestTime();
  const iso = (ms: number) => new Date(now - ms).toISOString();
  const H = 3600_000;

  const [total, discovered, firstSeen, high, accel, saturated, rising, lastJob, creators] = await Promise.all([
    db.from("products").select("id", { count: "exact", head: true }).not("status", "in", "(merged,not_a_product)"),
    db.from("products").select(COLS).not("status", "in", "(merged,not_a_product)").gte("created_at", iso(24 * H)).order("created_at", { ascending: false }).limit(8),
    db.from("products").select(COLS).in("status", ACTIVE).gte("first_observed_at", iso(72 * H)).order("first_observed_at", { ascending: false }).limit(8),
    db.from("products").select(COLS).in("status", ACTIVE).gte("latest_score", 70).order("latest_score", { ascending: false }).limit(8),
    db.from("products").select(COLS).in("status", ACTIVE).gte("scored_at", iso(72 * H)).gt("latest_acceleration", 1).order("latest_acceleration", { ascending: false }).limit(8),
    db.from("products").select(COLS).eq("status", "saturated").gte("status_changed_at", iso(14 * 24 * H)).order("status_changed_at", { ascending: false }).limit(8),
    db.from("competition_snapshots").select("product_id, new_sellers_7d, captured_at, products(id, slug, canonical_name, primary_image_url, latest_score, latest_confidence, first_observed_at, status)").gte("captured_at", iso(48 * H)).gte("new_sellers_7d", 2).order("new_sellers_7d", { ascending: false }).limit(30),
    db.from("ingestion_jobs").select("job_type, status, started_at, finished_at, error_message").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("creators").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  type Row = ProductListItem & { latest_acceleration: number | null; status_changed_at: string; created_at: string };
  const rows = (r: { data: unknown }) => (r.data ?? []) as Row[];
  const risingSeen = new Set<string>();
  const risingItems: ProductListItem[] = [];
  for (const c of (rising.data ?? []) as { product_id: string; new_sellers_7d: number; products: unknown }[]) {
    const p = (Array.isArray(c.products) ? c.products[0] : c.products) as (ProductListItem & { status: string }) | null;
    if (!p || risingSeen.has(p.id) || !ACTIVE.includes(p.status)) continue;
    risingSeen.add(p.id);
    risingItems.push({ ...p, meta: `${c.new_sellers_7d} new promoters in 7 days (monitored sources)` });
    if (risingItems.length >= 8) break;
  }

  const setupMissing = [
    !aiConfigured() && "Claude API key",
    !process.env.YOUTUBE_API_KEY && "YouTube API key",
    !(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL) && "Resend email",
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="What's starting to trend in the sources this tool monitors. Every number links back to its evidence; anything not measured is shown as unknown, not zero."
        actions={<Link href="/submit" className="inline-flex items-center rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-ink">Submit a URL</Link>}
      />

      {setupMissing.length > 0 && (
        <p className="mb-4 rounded-lg bg-warn-wash p-3 text-sm text-warn">
          Setup incomplete: {setupMissing.join(", ")} not configured yet. Monitoring, AI analysis or email won&apos;t run until it is. See Admin → Settings.
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Products tracked" value={total.count ?? 0} href="/opportunities" />
        <Stat label="Discovered today" value={rows(discovered).length} hint="Created in the last 24 h" />
        <Stat label="High opportunity" value={rows(high).length} hint="Score 70+" href="/opportunities?min=70" />
        <Stat label="Creators monitored" value={creators.count ?? 0} hint={lastJob.data ? `Last job ${ago(lastJob.data.started_at as string)} · ${lastJob.data.status}` : "No jobs have run yet"} href="/admin/jobs" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Newly discovered today" subtitle="New product records created from today's sightings.">
          <ProductList items={rows(discovered)} empty="Nothing new in the last 24 hours." />
        </Card>
        <Card title="First seen in the last 72 hours" subtitle="Earliest known appearance (the post's publish time) is within 3 days.">
          <ProductList items={rows(firstSeen)} empty="No products first appeared in the last 72 hours." />
        </Card>
        <Card title="High-opportunity products" subtitle="Opportunity score 70 or more. Check the confidence before acting.">
          <ProductList items={rows(high)} empty="No product scores 70+ yet." />
        </Card>
        <Card title="Accelerating fastest" subtitle="Mentions in the last 3 days compared with their earlier pace.">
          <ProductList items={rows(accel).map((p) => ({ ...p, meta: `×${Number(p.latest_acceleration).toFixed(1)} acceleration` }))} empty="No product is accelerating right now." />
        </Card>
        <Card title="Rising competition" subtitle="More promoters appeared in the last 7 days (monitored sources only).">
          <ProductList items={risingItems} empty="No product picked up 2+ new promoters this week." />
        </Card>
        <Card title="Recently saturated" subtitle="Products that crossed the saturation threshold in the last 14 days. Consider avoiding.">
          <ProductList items={rows(saturated).map((p) => ({ ...p, meta: `Saturated ${ago(p.status_changed_at)}` }))} empty="No product became saturated recently." />
        </Card>
      </div>

      {(total.count ?? 0) === 0 && (
        <div className="mt-6">
          <Empty title="No products yet">
            Products appear here after the first ingestion run finds them in monitored creators&apos; videos, or after you <Link className="text-accent underline" href="/submit">submit a URL</Link>.
            Nothing is shown until there is real evidence. <Badge tone="accent">Monitoring {creators.count ?? 0} creators</Badge>
          </Empty>
        </div>
      )}
    </>
  );
}
