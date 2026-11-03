import { AdminHeader, Flash, Panel, Return, SelectField, Submit, Table, Td, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { sourceOptions } from "@/lib/admin/queries";
import { aiConfig } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { cancelJob, queueSourceItem, researchPerson, retryJob, runQueueNow } from "../pipeline-actions";

export const metadata = { title: "Research queue" };
export const maxDuration = 300;

export default async function Research({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaff("researcher");
  const sp = await searchParams;
  const [{ data: jobs }, { data: items }, sources] = await Promise.all([
    staff.db.from("research_jobs").select("id, job_type, status, attempts, max_attempts, run_after, last_error, result, created_at, case_id").order("created_at", { ascending: false }).limit(100),
    staff.db.from("source_items").select("id, connector, title, url, published_at, status, created_at").in("status", ["new", "failed"]).order("created_at", { ascending: false }).limit(50),
    sourceOptions(staff),
  ]);
  return (
    <div className="space-y-6">
      <AdminHeader kicker="Newsroom" title="Research queue" actions={
        <form action={runQueueNow} className="flex items-center gap-2"><Return to="/admin/research" /><input type="hidden" name="max" value="5" /><Submit small>Run next jobs now</Submit></form>
      }>
        Pipeline: Source Monitor → Statement Extraction → Historical Matching → Evidence Assessment → Investigation Draft (stops at Needs review). Scheduled runs happen daily; use “Run” to go now.
        {!aiConfig.enabled && <strong className="block text-amber">AI jobs are paused: ANTHROPIC_API_KEY is not set. Monitoring and price checks still run.</strong>}
      </AdminHeader>
      <Flash flash={readFlash(sp)} />

      <Panel title="Start research from a source">
        <form action={researchPerson} className="flex flex-wrap items-end gap-3">
          <Return to="/admin/research" />
          <div className="min-w-72 flex-1"><SelectField label="Source with stored text" name="evidence_source_id" options={sources} empty="Choose…" /></div>
          <Submit small>Extract statements</Submit>
        </form>
      </Panel>

      <Panel title="Discovered items awaiting triage" note={`${items?.length ?? 0}`}>
        <Table head={["Item", "Connector", "Published", "Action"]} empty="No new items. Configure sources under Pipeline → Sources.">
          {(items ?? []).map((i) => (
            <tr key={i.id}>
              <Td>{i.url ? <a className="link" href={i.url} target="_blank" rel="noopener noreferrer">{i.title ?? i.url}</a> : i.title}</Td>
              <Td mono>{i.connector}</Td>
              <Td mono>{formatDateTime(i.published_at)}</Td>
              <Td>
                <form action={queueSourceItem} className="flex gap-1"><Return to="/admin/research" /><input type="hidden" name="item_id" value={i.id} />
                  <button className="btn btn-sm" name="decision" value="extract">Extract</button>
                  <button className="btn btn-ghost btn-sm" name="decision" value="ignore">Ignore</button>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title="Jobs">
        <Table head={["Job", "Status", "Attempts", "Result / error", "Created", ""]}>
          {(jobs ?? []).map((j) => (
            <tr key={j.id}>
              <Td mono>{j.job_type}{j.case_id ? <a className="link ml-1" href={`/admin/cases/${j.case_id}`}>case</a> : null}</Td>
              <Td mono>{j.status}{j.status === "queued" && new Date(j.run_after) > new Date() ? ` (retry ${formatDateTime(j.run_after)})` : ""}</Td>
              <Td mono>{j.attempts}/{j.max_attempts}</Td>
              <Td className="max-w-md text-sm">{j.last_error ?? (j.result as { summary?: string } | null)?.summary ?? ""}</Td>
              <Td mono>{formatDateTime(j.created_at)}</Td>
              <Td>
                {j.status === "failed" && <form action={retryJob}><Return to="/admin/research" /><input type="hidden" name="job_id" value={j.id} /><Submit small tone="ghost">Retry</Submit></form>}
                {j.status === "queued" && <form action={cancelJob}><Return to="/admin/research" /><input type="hidden" name="job_id" value={j.id} /><Submit small tone="ghost">Cancel</Submit></form>}
              </Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}
