import { AdminHeader, Field, Flash, Panel, Return, Submit, sp1, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { EVIDENCE_ROLES, EVIDENCE_ROLE_LABELS } from "@/lib/editorial";
import { createSource } from "../actions";
import { SourceFields } from "../SourceForm";

export const metadata = { title: "Add a source" };

export default async function NewSource({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff("researcher");
  const sp = await searchParams;
  const caseId = sp1(sp.case);
  return (
    <div className="max-w-4xl">
      <AdminHeader kicker="Evidence" title="Add a source">Open the original before you add it. Prefer primary records: the broadcast, the post, the filing, the transaction.</AdminHeader>
      <Flash flash={readFlash(sp)} />
      <Panel title="Source">
        <form action={createSource} className="space-y-4">
          <Return to={`/admin/evidence/new${caseId ? `?case=${caseId}` : ""}`} />
          {caseId && (
            <>
              <input type="hidden" name="attach_case" value={caseId} />
              <div>
                <label className="label" htmlFor="attach_role">Attach to the case as</label>
                <select id="attach_role" name="attach_role" className="field max-w-xs">{EVIDENCE_ROLES.map((r) => <option key={r} value={r}>{EVIDENCE_ROLE_LABELS[r]}</option>)}</select>
              </div>
            </>
          )}
          <SourceFields s={null} />
          <Field label="Full text (optional, private)" name="snapshot_text" rows={6} help="Paste the transcript or document text. Never shown publicly; used to verify quotes and by the research agents." />
          <Submit>Add source</Submit>
        </form>
      </Panel>
    </div>
  );
}
