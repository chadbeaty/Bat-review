import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Field, Flash, Panel, Return, SelectField, Submit, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { atLeast } from "@/lib/auth/roles";
import { peopleOptions, sourceOptions } from "@/lib/admin/queries";
import { PREDICTION_STATUS_LABELS, type PredictionStatus } from "@/lib/editorial";
import { formatDateTime } from "@/lib/format";
import { confirmOutcome, correctPrediction, proposeOutcome, rejectOutcome, runResolution, setPredictionVisibility, updatePrediction } from "../actions";

export const metadata = { title: "Prediction" };

export default async function PredictionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const staff = await requireStaff("researcher");
  const { id } = await params;
  const sp = await searchParams;
  const [{ data: p }, people, sources, { data: outcomes }, { data: statements }] = await Promise.all([
    staff.db.from("predictions").select("*").eq("id", id).maybeSingle(),
    peopleOptions(staff), sourceOptions(staff),
    staff.db.from("prediction_outcomes").select("*, source:evidence_sources(title, canonical_url)").eq("prediction_id", id).order("created_at", { ascending: false }),
    staff.db.from("statements").select("id, exact_quote").order("created_at", { ascending: false }).limit(300),
  ]);
  if (!p) notFound();
  const back = `/admin/predictions/${id}`;
  const locked = p.visibility === "public";
  const editor = atLeast(staff.role, "editor");
  const deadlinePassed = p.deadline ? new Date(`${p.deadline}T23:59:59Z`) < new Date() : false;
  const v = (k: string) => (p as Record<string, unknown>)[k] as string | null;
  return (
    <div>
      <AdminHeader kicker="Prediction" title={`“${p.prediction_text.slice(0, 90)}”`}>
        {PREDICTION_STATUS_LABELS[p.status as PredictionStatus]} · {p.visibility}{p.deadline ? ` · deadline ${p.deadline}${deadlinePassed ? " (passed)" : ""}` : ""}
      </AdminHeader>
      <Flash flash={readFlash(sp)} />
      <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
        <Panel title="Prediction record" note={locked ? "Public — original fields locked" : "Internal"}>
          <form action={updatePrediction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="id" value={p.id} /><Return to={back} />
            <SelectField label="Person" name="person_id" options={people} defaultValue={p.person_id} required />
            <SelectField label="Original statement" name="statement_id" options={(statements ?? []).map((s) => [s.id, `“${s.exact_quote.slice(0, 80)}”`] as [string, string])} defaultValue={p.statement_id} required />
            <div className="md:col-span-2"><Field label="Exact prediction wording" name="prediction_text" defaultValue={p.prediction_text} rows={2} required readOnly={locked} /></div>
            <Field label="Asset or subject" name="asset" defaultValue={v("asset")} readOnly={locked} />
            <Field label="Asset identifier" name="asset_identifier" defaultValue={v("asset_identifier")} help="CoinGecko id (e.g. bitcoin) or ticker (e.g. AAPL)" />
            <Field label="Target value" name="target_value" defaultValue={v("target_value")} readOnly={locked} />
            <Field label="Currency" name="target_currency" defaultValue={v("target_currency")} placeholder="USD" readOnly={locked} />
            <SelectField label="Direction" name="target_direction" defaultValue={v("target_direction")} empty="—" options={[["at_or_above", "At or above"], ["at_or_below", "At or below"], ["event_occurs", "Event occurs"], ["event_does_not_occur", "Event does not occur"], ["other", "Other"]]} />
            <SelectField label="Price provider" name="price_provider" defaultValue={v("price_provider")} empty="— none —" options={[["coingecko", "CoinGecko"], ["financial_modeling_prep", "Financial Modeling Prep"], ["manual", "Manual"], ["other", "Other"]]} />
            <Field label="Date made" name="prediction_date" type="date" defaultValue={p.prediction_date} required readOnly={locked} />
            <Field label="Deadline" name="deadline" type="date" defaultValue={v("deadline")} readOnly={locked} />
            <Field label="Time zone" name="timezone" defaultValue={p.timezone} />
            <div className="md:col-span-2"><Field label="Resolution criteria" name="resolution_criteria" defaultValue={v("resolution_criteria")} rows={2} readOnly={locked} help='Say exactly what counts, e.g. "any UTC daily close at or above $100,000 before 1 Jan 2026".' /></div>
            <div className="md:col-span-2"><Field label="Resolution method / data source" name="resolution_method" defaultValue={v("resolution_method")} rows={2} /></div>
            <div className="md:col-span-2"><Submit>Save</Submit></div>
          </form>
        </Panel>
        <div className="space-y-6">
          {editor && (
            <Panel title="Scoreboard">
              <form action={setPredictionVisibility}><input type="hidden" name="id" value={p.id} /><Return to={back} /><input type="hidden" name="visibility" value={locked ? "internal" : "public"} /><Submit small tone={locked ? "ghost" : "ink"}>{locked ? "Hide from scoreboard" : "Publish to scoreboard"}</Submit></form>
            </Panel>
          )}
          {p.status === "open" && (
            <Panel title="Resolution agent">
              <p className="mb-3 text-sm text-ink-2">Price predictions with a provider and identifier are checked automatically against the configured data. Otherwise attach outcome sources for an AI proposal. Either way the result is only a proposal.</p>
              <form action={runResolution} className="space-y-2">
                <input type="hidden" name="id" value={p.id} /><Return to={back} />
                <label className="label" htmlFor="source_ids">Outcome sources (optional)</label>
                <select id="source_ids" name="source_ids" multiple className="field h-28">{sources.map(([sid, l]) => <option key={sid} value={sid}>{l}</option>)}</select>
                <Submit small>Run resolution now</Submit>
              </form>
            </Panel>
          )}
          <Panel title="Outcomes">
            {(outcomes ?? []).length === 0 && <p className="text-ink-2">No outcomes yet.</p>}
            <ul className="space-y-4">
              {(outcomes ?? []).map((o) => {
                const src = o.source as unknown as { title: string; canonical_url: string | null } | null;
                return (
                  <li key={o.id} className="border-l-[3px] border-ink pl-3">
                    <p className="font-mono text-xs uppercase">{o.result} · {o.status} · by {o.proposed_by}</p>
                    <p className="text-sm">{o.notes}</p>
                    <p className="meta">{o.methodology}</p>
                    {o.observed_value !== null && <p className="meta">Observed {o.observed_value} {o.observed_currency} · {o.price_provider} · {formatDateTime(o.observation_time)} ({o.timezone})</p>}
                    {src && <p className="meta">Evidence: {src.canonical_url ? <a className="link" href={src.canonical_url} target="_blank" rel="noopener noreferrer">{src.title}</a> : src.title}</p>}
                    {o.status === "proposed" && editor && (
                      <div className="mt-2 space-y-2">
                        <form action={confirmOutcome} className="space-y-2">
                          <input type="hidden" name="id" value={p.id} /><input type="hidden" name="outcome_id" value={o.id} /><Return to={back} />
                          <Field label="Public outcome text" name="outcome_text" defaultValue={o.notes} rows={2} required />
                          {!deadlinePassed && <Field label="Reason to resolve before the deadline" name="early_reason" help="Required: the deadline hasn't passed." />}
                          <Submit small>Confirm outcome</Submit>
                        </form>
                        <form action={rejectOutcome}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="outcome_id" value={o.id} /><Return to={back} /><Submit small tone="ghost">Reject</Submit></form>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title="Propose an outcome manually">
            <form action={proposeOutcome} className="space-y-2">
              <input type="hidden" name="id" value={p.id} /><Return to={back} />
              <SelectField label="Result" name="result" options={[["correct", "Correct"], ["incorrect", "Incorrect"], ["partially_correct", "Partially correct"], ["unscorable", "Unscorable"], ["disputed", "Disputed"]]} />
              <Field label="Methodology" name="methodology" rows={2} required help="Provider, observation time, time zone, close vs intraday, corporate actions." />
              <Field label="Observed value" name="observed_value" />
              <Field label="Currency" name="observed_currency" />
              <Field label="Observation time (UTC)" name="observation_time" type="datetime-local" />
              <SelectField label="Evidence source" name="evidence_source_id" options={sources} empty="— choose —" />
              <Field label="Notes" name="notes" rows={2} />
              <Submit small tone="ghost">Propose</Submit>
            </form>
          </Panel>
          {locked && editor && (
            <Panel title="Correct the record" tone="warn">
              <form action={correctPrediction} className="space-y-2">
                <input type="hidden" name="id" value={p.id} /><Return to={back} />
                <SelectField label="Field" name="field" options={[["prediction_text", "Wording"], ["prediction_date", "Date made"], ["target_value", "Target"], ["target_currency", "Currency"], ["deadline", "Deadline"], ["asset", "Asset"], ["resolution_criteria", "Criteria"], ["target_direction", "Direction"]]} />
                <Field label="Corrected value" name="value" required />
                <Field label="Reason (published)" name="reason" required />
                <Submit small tone="red">Record correction</Submit>
              </form>
            </Panel>
          )}
          <Link className="meta link" href={`/admin/statements/${p.statement_id}`}>Original statement →</Link>
        </div>
      </div>
    </div>
  );
}
