import type { Metadata } from "next";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, Empty, Flash, PageHeader, btn, type Tone } from "@/components/ui";
import { requireOwner } from "@/lib/auth/member";
import { readFlash } from "@/lib/flash";
import { ago, dateTime } from "@/lib/format";
import { runJobNow } from "../actions";

export const metadata: Metadata = { title: "Jobs" };

const TONE: Record<string, Tone> = { succeeded: "good", partial: "warn", failed: "bad", running: "accent", skipped: "neutral" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner("/admin/jobs");
  const [{ data: jobs }, { count: pending }, { count: failed }, { data: alerts }, { data: creatorErrors }] = await Promise.all([
    db.from("ingestion_jobs").select("*").order("started_at", { ascending: false }).limit(40),
    db.from("creator_videos").select("id", { count: "exact", head: true }).eq("analysis_status", "pending"),
    db.from("creator_videos").select("id", { count: "exact", head: true }).eq("analysis_status", "failed"),
    db.from("product_alerts").select("alert_type, status, error, created_at, reason").order("created_at", { ascending: false }).limit(15),
    db.from("creators").select("display_name, last_error, last_polled_at").not("last_error", "is", null).eq("is_active", true),
  ]);
  const run = (op: string, text: string, pendingText: string, cls = btn.secondary) => (
    <form action={runJobNow}><input type="hidden" name="op" value={op} /><SubmitButton className={cls} pendingText={pendingText}>{text}</SubmitButton></form>
  );
  return (
    <>
      <Flash flash={readFlash(sp)} />
      <PageHeader
        title="Jobs"
        subtitle="Scheduled runs: ingestion four times a day (about 01:00, 07:00, 13:00 and 19:00 UTC) and the daily rescore + digest (about 11:30 UTC). If one source fails, the rest keep running."
        actions={
          <>
            {run("ingest", "Run ingestion now", "Running… (up to 4 min)", btn.primary)}
            {run("daily", "Run daily job now", "Running…")}
            {run("digest", "Send digest now", "Sending…")}
            {run("test_email", "Send test email", "Sending…")}
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card title="Videos waiting for analysis"><p className="tabular text-2xl font-semibold">{pending ?? 0}</p></Card>
        <Card title="Videos that failed analysis" actions={(failed ?? 0) > 0 ? run("retry_failed", "Retry", "…", btn.small) : undefined}>
          <p className="tabular text-2xl font-semibold">{failed ?? 0}</p>
          <p className="text-xs text-muted">Retried automatically up to 3 times.</p>
        </Card>
        <Card title="Creators with errors">
          {(creatorErrors ?? []).length ? (
            <ul className="space-y-1 text-xs">{(creatorErrors ?? []).map((c) => <li key={c.display_name as string}><strong>{c.display_name as string}</strong>: <span className="text-bad">{c.last_error as string}</span></li>)}</ul>
          ) : (
            <p className="text-sm text-muted">None</p>
          )}
        </Card>
      </div>

      <Card title="Recent runs" className="mb-4">
        {(jobs ?? []).length ? (
          <ul className="divide-y divide-line text-sm">
            {(jobs ?? []).map((j) => (
              <li key={j.id as string} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[j.status as string]}>{j.status as string}</Badge>
                  <span className="font-medium">{String(j.job_type).replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted">{j.triggered_by as string} · {dateTime(j.started_at as string)} ({ago(j.started_at as string)}){j.finished_at ? ` · ${Math.round((new Date(j.finished_at as string).getTime() - new Date(j.started_at as string).getTime()) / 1000)} s` : ""}</span>
                  <span className="text-xs text-muted">found {j.items_found as number} · new {j.items_new as number} · failed {j.items_failed as number}</span>
                </div>
                {j.error_message && <p className="mt-1 text-xs text-bad">{j.error_message as string}</p>}
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-accent">Details</summary>
                  <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-canvas p-2 text-[11px]">{JSON.stringify(j.details, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No jobs have run yet">The first scheduled run happens after deployment, or click “Run ingestion now”.</Empty>
        )}
      </Card>

      <Card title="Recent alerts and emails">
        {(alerts ?? []).length ? (
          <ul className="divide-y divide-line text-sm">
            {(alerts ?? []).map((a, i) => (
              <li key={i} className="py-1.5 text-xs">
                <Badge tone={a.status === "sent" ? "good" : a.status === "pending" ? "accent" : "warn"}>{a.status as string}</Badge> {String(a.alert_type).replace(/_/g, " ")} · {ago(a.created_at as string)} · {a.reason as string}
                {a.error && <span className="block text-bad">{a.error as string}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No alerts yet" />
        )}
      </Card>
    </>
  );
}
