import { AdminHeader, FilterLinks, Flash, Panel, Return, SelectField, Submit, sp1, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { peopleOptions } from "@/lib/admin/queries";
import { formatDateTime } from "@/lib/format";
import { submissionToCase, triageSubmission } from "../system-actions";

export const metadata = { title: "Submissions" };

export default async function Submissions({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaff("researcher");
  const sp = await searchParams;
  const status = sp1(sp.status) ?? "new";
  const [{ data }, people] = await Promise.all([
    staff.db.from("submissions").select("*").eq("status", status).order("created_at", { ascending: false }).limit(100),
    peopleOptions(staff),
  ]);
  return (
    <div className="space-y-4">
      <AdminHeader kicker="Newsroom" title="Reader submissions">Nothing submitted is published automatically. Treat every submission as an unverified tip. Submitter contact details are private.</AdminHeader>
      <Flash flash={readFlash(sp)} />
      <FilterLinks base="/admin/submissions" param="status" current={status} options={[["new", "New"], ["reviewing", "Reviewing"], ["accepted", "Accepted"], ["rejected", "Rejected"], ["spam", "Spam"]]} />
      {(data ?? []).length === 0 && <p className="text-ink-2">No submissions with this status.</p>}
      {(data ?? []).map((s) => (
        <Panel key={s.id} title={s.person_name} note={formatDateTime(s.created_at)}>
          <blockquote className="border-l-[3px] border-ink pl-3 text-lg">“{s.statement_text}”</blockquote>
          <p className="meta mt-2">Said: {s.statement_date ?? "date not given"} · <a className="link" href={s.source_url} target="_blank" rel="noopener noreferrer nofollow">{s.source_url}</a></p>
          {s.context && <p className="mt-2 text-sm text-ink-2">{s.context}</p>}
          {s.supporting_urls?.length > 0 && <ul className="meta mt-2">{s.supporting_urls.map((u: string) => <li key={u}><a className="link" href={u} target="_blank" rel="noopener noreferrer nofollow">{u}</a></li>)}</ul>}
          {(s.submitter_name || s.submitter_email) && <p className="meta mt-2">From: {s.submitter_name ?? "—"} {s.submitter_email ? `<${s.submitter_email}>` : ""} (private)</p>}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <form action={triageSubmission} className="space-y-2">
              <input type="hidden" name="submission_id" value={s.id} /><Return to={`/admin/submissions?status=${status}`} />
              <SelectField label="Status" name="status" defaultValue={s.status} options={[["new", "New"], ["reviewing", "Reviewing"], ["rejected", "Rejected"], ["spam", "Spam"]]} />
              <textarea name="reviewer_notes" defaultValue={s.reviewer_notes ?? ""} rows={2} className="field" placeholder="Internal notes" />
              <Submit small tone="ghost">Update</Submit>
            </form>
            <form action={submissionToCase} className="space-y-2">
              <input type="hidden" name="submission_id" value={s.id} /><Return to={`/admin/submissions?status=${status}`} />
              <SelectField label="Open a case about" name="person_id" options={people} empty="Choose…" />
              <Submit small>Open case (Discovered)</Submit>
            </form>
          </div>
        </Panel>
      ))}
    </div>
  );
}
