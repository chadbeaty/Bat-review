import Link from "next/link";
import { AdminHeader, Flash, Panel, Stat, StatusPill, Table, Td, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { spendToday } from "@/lib/admin/queries";
import { integrationStatus } from "@/lib/env";
import { formatDateTime, formatUsd } from "@/lib/format";

export const metadata = { title: "Overview" };

export default async function AdminOverview({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaff("researcher");
  const sp = await searchParams;
  const db = staff.db;
  const head = { count: "exact" as const, head: true };
  const n = (r: { count: number | null }) => r.count ?? 0;
  const [review, approved, published, drafts, subs, jobsQueued, jobsFailed, outcomes, spend, recent] = await Promise.all([
    db.from("cases").select("id", head).eq("status", "needs_review").then(n),
    db.from("cases").select("id", head).eq("status", "approved").then(n),
    db.from("cases").select("id", head).eq("status", "published").then(n),
    db.from("cases").select("id", head).in("status", ["discovered", "researching", "evidence_gathering", "draft_ready", "needs_more_evidence"]).then(n),
    db.from("submissions").select("id", head).eq("status", "new").then(n),
    db.from("research_jobs").select("id", head).eq("status", "queued").then(n),
    db.from("research_jobs").select("id", head).eq("status", "failed").then(n),
    db.from("prediction_outcomes").select("id", head).eq("status", "proposed").then(n),
    spendToday(staff),
    db.from("cases").select("id, title, status, ai_generated, last_updated_at").order("last_updated_at", { ascending: false }).limit(8),
  ]);
  const missing = integrationStatus().filter((i) => !i.configured);

  return (
    <div>
      <AdminHeader kicker="Newsroom" title="Overview">
        Nothing reaches the public site until an editor approves and publishes it. AI drafts stop at “Needs review”.
      </AdminHeader>
      {sp.error === "role" && <Flash flash={{ kind: "error", message: "That area needs a more senior role." }} />}
      <Flash flash={readFlash(sp)} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Needs review" value={review} href="/admin/approvals" tone={review ? "warn" : undefined} />
        <Stat label="Approved, unpublished" value={approved} href="/admin/approvals" />
        <Stat label="Published cases" value={published} href="/admin/cases?status=published" />
        <Stat label="In research" value={drafts} href="/admin/cases" />
        <Stat label="New submissions" value={subs} href="/admin/submissions" tone={subs ? "warn" : undefined} />
        <Stat label="Outcomes to confirm" value={outcomes} href="/admin/predictions?outcomes=proposed" tone={outcomes ? "warn" : undefined} />
        <Stat label="Jobs queued / failed" value={`${jobsQueued} / ${jobsFailed}`} href="/admin/research" tone={jobsFailed ? "warn" : undefined} />
        <Stat label="AI spend today" value={formatUsd(spend)} href="/admin/ai" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Panel title="Recently updated cases">
          <Table head={["Case", "Status", "Updated"]}>
            {(recent.data ?? []).map((c) => (
              <tr key={c.id}>
                <Td><Link className="link" href={`/admin/cases/${c.id}`}>{c.title}</Link>{c.ai_generated && <span className="meta ml-2">AI</span>}</Td>
                <Td><StatusPill status={c.status} /></Td>
                <Td mono>{formatDateTime(c.last_updated_at)}</Td>
              </tr>
            ))}
          </Table>
        </Panel>
        <div className="space-y-6">
          <Panel title="Setup" tone={missing.some((m) => m.required) ? "warn" : "default"}>
            {missing.length === 0 ? <p>All integrations are configured.</p> : (
              <ul className="space-y-2 text-sm">
                {missing.map((m) => (
                  <li key={m.id}><strong>{m.name}</strong>{m.required ? " (required)" : " (optional)"} — {m.purpose}</li>
                ))}
              </ul>
            )}
            {staff.role === "admin" && <Link href="/admin/settings" className="meta link mt-3 inline-block">Settings →</Link>}
          </Panel>
          <Panel title="Quick actions">
            <div className="flex flex-col gap-2">
              <Link className="btn btn-sm" href="/admin/cases/new">New case</Link>
              <Link className="btn btn-ghost btn-sm" href="/admin/statements/new">Record a statement</Link>
              <Link className="btn btn-ghost btn-sm" href="/admin/evidence/new">Add an evidence source</Link>
              <Link className="btn btn-ghost btn-sm" href="/admin/research">Research queue</Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
