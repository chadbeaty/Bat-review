import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Field, Flash, Panel, Return, SelectField, Submit, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { atLeast } from "@/lib/auth/roles";
import { peopleOptions, sourceOptions } from "@/lib/admin/queries";
import { formatDateTime } from "@/lib/format";
import { correctStatement, createPredictionFromStatement, setStatementVisibility, updateStatement, verifyQuote } from "../actions";
import { StatementFields } from "../StatementFields";

export const metadata = { title: "Statement" };

export default async function StatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const staff = await requireStaff("researcher");
  const { id } = await params;
  const sp = await searchParams;
  const [{ data: s }, people, sources, { data: preds }, { data: run }] = await Promise.all([
    staff.db.from("statements").select("*, source:evidence_sources(id, title, canonical_url)").eq("id", id).maybeSingle(),
    peopleOptions(staff), sourceOptions(staff),
    staff.db.from("predictions").select("id, status").eq("statement_id", id),
    staff.db.from("statements").select("ai_run:ai_runs(id, model, prompt_version, created_at)").eq("id", id).maybeSingle(),
  ]);
  if (!s) notFound();
  const back = `/admin/statements/${id}`;
  const isPublic = s.visibility === "public";
  const editor = atLeast(staff.role, "editor");
  const ai = (run?.ai_run as unknown as { model: string; prompt_version: string; created_at: string } | null) ?? null;
  const source = s.source as unknown as { id: string; title: string; canonical_url: string | null } | null;
  return (
    <div>
      <AdminHeader kicker="Statement" title={`“${s.exact_quote.slice(0, 90)}${s.exact_quote.length > 90 ? "…" : ""}”`}
        actions={source?.canonical_url ? <a className="btn btn-sm" href={source.canonical_url} target="_blank" rel="noopener noreferrer">Open original source ↗</a> : null}>
        {s.visibility} · {s.verification_status} · {s.quote_verified_verbatim ? "quote checked verbatim ✓" : "quote not yet checked verbatim"}
      </AdminHeader>
      <Flash flash={readFlash(sp)} />
      {ai && <p className="mb-4 border border-amber bg-amber-wash px-3 py-2 text-sm text-amber">Extracted by AI ({ai.model}, {ai.prompt_version}, {formatDateTime(ai.created_at)}). Confidence {s.extraction_confidence ?? "—"}. {s.extraction_notes}</p>}
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Panel title="Statement">
          <form action={updateStatement} className="space-y-4">
            <input type="hidden" name="id" value={s.id} /><Return to={back} />
            <StatementFields s={s} people={people} sources={sources} locked={isPublic} />
            <Submit>Save</Submit>
          </form>
        </Panel>
        <div className="space-y-6">
          <Panel title="Verify">
            <p className="mb-3 text-sm text-ink-2">Checks the quotation word for word against the source&apos;s stored text.</p>
            <form action={verifyQuote}><input type="hidden" name="id" value={s.id} /><Return to={back} /><Submit small>Check quote against source</Submit></form>
            {source && <Link className="meta link mt-2 inline-block" href={`/admin/evidence/${source.id}`}>Source: {source.title}</Link>}
          </Panel>
          {editor && (
            <Panel title="Publication">
              <form action={setStatementVisibility} className="space-y-2">
                <input type="hidden" name="id" value={s.id} /><Return to={back} />
                <input type="hidden" name="visibility" value={isPublic ? "internal" : "public"} />
                {!isPublic && <p className="text-sm text-ink-2">Requires: verified, dated and linked to a source.</p>}
                <Submit small tone={isPublic ? "ghost" : "ink"}>{isPublic ? "Hide from public site" : "Make public"}</Submit>
              </form>
            </Panel>
          )}
          <Panel title="Predictions">
            {(preds ?? []).map((p) => <Link key={p.id} className="link block" href={`/admin/predictions/${p.id}`}>Prediction ({p.status})</Link>)}
            {s.statement_type === "prediction" && !(preds ?? []).length && (
              <form action={createPredictionFromStatement}><input type="hidden" name="id" value={s.id} /><Return to={back} /><Submit small>Create prediction record</Submit></form>
            )}
          </Panel>
          {isPublic && editor && (
            <Panel title="Correct a public statement" tone="warn">
              <form action={correctStatement} className="space-y-3">
                <input type="hidden" name="id" value={s.id} /><Return to={back} />
                <SelectField label="Field" name="field" options={[["exact_quote", "Exact quotation"], ["published_at", "Date"], ["context", "Context"]]} />
                <Field label="Corrected value" name="value" rows={3} required />
                <Field label="Reason (published)" name="reason" required />
                <Submit tone="red" small>Record correction</Submit>
              </form>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
