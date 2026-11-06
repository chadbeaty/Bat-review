import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, AiBadge, Check, Field, Flash, Panel, Pipeline, Return, SelectField, StatusPill, Submit, type SearchParams } from "@/components/admin/ui";
import { CopyButton } from "@/components/admin/CopyButton";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { atLeast } from "@/lib/auth/roles";
import { peopleOptions, sourceOptions } from "@/lib/admin/queries";
import {
  CASE_STATUS_LABELS, CASE_TYPES, CASE_TYPE_LABELS, CONFIDENCE, CONFIDENCE_LEVELS, EDITOR_ONLY_TARGETS, EVIDENCE_ROLES, EVIDENCE_ROLE_LABELS,
  OUTREACH_LABELS, OUTREACH_STATUSES, allowedTransitions, type CaseStatus, type Confidence,
} from "@/lib/editorial";
import { LEGAL_CHECKLIST, checklistProgress } from "@/lib/editorial/legal";
import { platformCopy } from "@/lib/social/copy";
import { absoluteUrl } from "@/lib/seo";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  addEvidence, addReviewNote, addTimelineEvent, correctCase, publishCase, removeEvidence, removeTimelineEvent, runCaseAgent, saveDistribution,
  saveLegalReview, saveResponse, transitionCase, updateCase,
} from "../actions";

export const metadata = { title: "Case review" };
// AI agents can be run from this page and may take a few minutes.
export const maxDuration = 300;

type Notes = {
  reasoning_summary?: string; questions_for_editor?: string[]; limitations?: string[]; quote_flags?: string[]; language_flags?: string[];
  candidate?: { kind: string; explanation: string; reasons_it_may_not_be_a_story: string; strength: number };
  evidence_assessment?: { overall_classification: string; overall_reasoning: string; missing_evidence: string[] };
  distribution?: { language_flags?: string[]; suggested_related?: string[] };
  prompt_version?: string;
  // Written by the scheduled research agent (agent_submit_research).
  agent?: string; notes?: string; flags?: string[];
  suggestions?: { legal?: Record<string, { ok?: boolean; reason?: string }>; confidence?: { level?: string; reason?: string } };
};

export default async function CaseReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const staff = await requireStaff("researcher");
  const { db } = staff;
  const { id } = await params;
  const sp = await searchParams;
  const { data: c } = await db.from("cases").select("*, person:people(id, name, slug)").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [people, sources, statementRes, predictionRes, evidenceRes, timelineRes, responsesRes, reviewsRes, correctionsRes, runsRes, statementsRes, predictionsRes] = await Promise.all([
    peopleOptions(staff), sourceOptions(staff),
    c.primary_statement_id ? db.from("statements").select("*, source:evidence_sources(id, title, canonical_url, archive_url, publisher)").eq("id", c.primary_statement_id).maybeSingle() : Promise.resolve({ data: null }),
    c.prediction_id ? db.from("predictions").select("id, prediction_text, status, deadline").eq("id", c.prediction_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("case_evidence").select("*, source:evidence_sources(id, title, publisher, canonical_url, archive_url, source_type, published_at, verification_status, source_excerpt, is_primary)").eq("case_id", id).order("sort_order"),
    db.from("case_timeline_events").select("*").eq("case_id", id).order("occurred_at"),
    db.from("subject_responses").select("*").eq("case_id", id).order("created_at", { ascending: false }),
    db.from("editorial_reviews").select("*").eq("case_id", id).order("created_at", { ascending: false }),
    db.from("corrections").select("*").eq("case_id", id).order("created_at", { ascending: false }),
    db.from("ai_runs").select("id, agent, model, status, estimated_cost, created_at, error_message").eq("case_id", id).order("created_at", { ascending: false }).limit(10),
    db.from("statements").select("id, exact_quote").eq("person_id", c.person_id).order("published_at", { ascending: false }).limit(200),
    db.from("predictions").select("id, prediction_text").eq("person_id", c.person_id).limit(200),
  ]);
  const statement = statementRes.data as (Record<string, unknown> & { exact_quote: string; source: { id: string; title: string; canonical_url: string | null; archive_url: string | null; publisher: string | null } | null }) | null;
  const evidence = (evidenceRes.data ?? []) as (Record<string, unknown> & { evidence_source_id: string; evidence_role: string; source: Record<string, string | boolean | null> })[];
  const notes = (c.ai_notes ?? {}) as Notes;
  const status = c.status as CaseStatus;
  const editor = atLeast(staff.role, "editor");
  const published = status === "published" || status === "disputed";
  const back = `/admin/cases/${id}`;
  const legal = checklistProgress(c.legal_review);
  const person = c.person as { id: string; name: string; slug: string };
  const contradicting = evidence.filter((e) => e.evidence_role === "contradicting");
  const supporting = evidence.filter((e) => ["supporting", "outcome", "disclosure", "market_data"].includes(e.evidence_role));
  const transitions = allowedTransitions(status).filter((t) => t !== "published" && (editor || !EDITOR_ONLY_TARGETS.includes(t)));
  const v = (k: string) => (c as Record<string, unknown>)[k] as string | null;
  // The research agent's suggestions pre-fill the checklist and confidence until an editor saves their own answers.
  const suggested = notes.suggestions ?? {};
  const legalSaved = Boolean(c.legal_reviewed_at) || Object.keys(c.legal_review ?? {}).length > 0;
  const useLegalSuggestions = !legalSaved && !!suggested.legal && !published;
  const suggestedConfidence = CONFIDENCE_LEVELS.find((l) => l === suggested.confidence?.level);

  return (
    <div>
      <AdminHeader kicker={`Case · ${CASE_TYPE_LABELS[c.case_type as keyof typeof CASE_TYPE_LABELS]}`} title={c.title}
        actions={<>{published && <Link className="btn btn-ghost btn-sm" href={`/cases/${c.slug}`}>View live</Link>}<StatusPill status={status} /></>}>
        <span className="flex flex-wrap items-center gap-2">
          {c.ai_generated && <AiBadge />}
          {c.is_demo && <span className="meta">DEMO record</span>}
          <span className="meta">Subject: <Link className="link" href={`/admin/people/${person.id}`}>{person.name}</Link> · Updated {formatDateTime(c.last_updated_at)}</span>
        </span>
      </AdminHeader>
      <Flash flash={readFlash(sp)} />
      <div className="mb-6"><Pipeline status={status} /></div>
      {c.ai_generated && !published && (
        <p className="mb-6 border border-amber bg-amber-wash px-4 py-3 text-amber">
          This case was created or drafted by the AI research engine. It cannot be published until an editor has checked every source, completed the legal checklist, approved it and confirmed publication.
        </p>
      )}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_30rem]">
        <div className="min-w-0 space-y-6">
          <Panel title="Original statement" tone="ink">
            {statement ? (
              <>
                <blockquote className="headline text-2xl !font-medium">“{statement.exact_quote}”</blockquote>
                <p className="meta mt-2">{formatDate(statement.published_at as string)} · {String(statement.statement_type).replace(/_/g, " ")} · {statement.quote_verified_verbatim ? "checked verbatim ✓" : "NOT checked verbatim"} · {String(statement.verification_status)} · {String(statement.visibility)}</p>
                {statement.context ? <p className="mt-2 text-ink-2"><strong>Context:</strong> {String(statement.context)}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {statement.source?.canonical_url && <a className="btn btn-sm" href={statement.source.canonical_url} target="_blank" rel="noopener noreferrer">Open original source ↗</a>}
                  {statement.source?.archive_url && <a className="btn btn-ghost btn-sm" href={statement.source.archive_url} target="_blank" rel="noopener noreferrer">Archived copy ↗</a>}
                  <Link className="btn btn-ghost btn-sm" href={`/admin/statements/${String(statement.id)}`}>Edit / verify statement</Link>
                </div>
              </>
            ) : <p className="text-ink-2">No primary statement linked. Choose one in the case details below.</p>}
            {predictionRes.data && <p className="meta mt-3">Prediction: <Link className="link" href={`/admin/predictions/${predictionRes.data.id}`}>“{predictionRes.data.prediction_text.slice(0, 80)}” ({predictionRes.data.status})</Link></p>}
          </Panel>

          {notes.agent && (!!notes.flags?.length || notes.notes) && (
            <Panel title="Research agent: check these first" tone="warn" id="agent-notes">
              {!!notes.flags?.length && <ul className="list-disc space-y-1 pl-5">{notes.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>}
              {notes.notes && <p className="mt-2"><strong>Agent note:</strong> {notes.notes}</p>}
            </Panel>
          )}
          {(notes.reasoning_summary || notes.candidate || notes.evidence_assessment) && (
            <Panel title="AI reasoning summary" tone="warn" id="ai-notes" note={notes.prompt_version}>
              {notes.candidate && <p className="mb-2"><strong>Why it was flagged ({notes.candidate.kind}, strength {notes.candidate.strength}):</strong> {notes.candidate.explanation}<br /><strong>Why it may not be a story:</strong> {notes.candidate.reasons_it_may_not_be_a_story}</p>}
              {notes.evidence_assessment && <p className="mb-2"><strong>Evidence assessment ({notes.evidence_assessment.overall_classification}):</strong> {notes.evidence_assessment.overall_reasoning}{notes.evidence_assessment.missing_evidence?.length ? <><br /><strong>Missing:</strong> {notes.evidence_assessment.missing_evidence.join("; ")}</> : null}</p>}
              {notes.reasoning_summary && <p className="mb-2"><strong>Draft reasoning:</strong> {notes.reasoning_summary}</p>}
              {!!notes.questions_for_editor?.length && <><p className="font-semibold">Questions for the editor</p><ul className="list-disc pl-5">{notes.questions_for_editor.map((q, i) => <li key={i}>{q}</li>)}</ul></>}
              {!!notes.quote_flags?.length && <p className="mt-2 text-red-ink"><strong>Quotes not found verbatim in the case file:</strong> {notes.quote_flags.map((q) => `“${q}”`).join("; ")}</p>}
              {!!notes.language_flags?.length && <p className="mt-2 text-red-ink"><strong>Accusatory language to review:</strong> {notes.language_flags.join(", ")}</p>}
            </Panel>
          )}

          <Panel title={published ? "Case content (published — use corrections)" : "Case details and article"}>
            <form action={updateCase} className="grid gap-4 md:grid-cols-2">
              <input type="hidden" name="id" value={c.id} /><Return to={back} />
              <div className="md:col-span-2"><Field label="Headline" name="title" defaultValue={c.title} required readOnly={published} /></div>
              <Field label="Address (slug)" name="slug" defaultValue={c.slug} required readOnly={published} />
              <SelectField label="Case type" name="case_type" defaultValue={c.case_type} options={CASE_TYPES.map((t) => [t, CASE_TYPE_LABELS[t]] as const)} />
              <SelectField label="Subject" name="person_id" defaultValue={c.person_id} options={people} required />
              <SelectField label="Evidence confidence" name="evidence_confidence" defaultValue={v("evidence_confidence") ?? (published ? null : suggestedConfidence)} empty="— not classified —" options={CONFIDENCE_LEVELS.map((l) => [l, CONFIDENCE[l].label] as const)}
                help={!v("evidence_confidence") && suggestedConfidence && !published ? `Suggested by the research agent: ${CONFIDENCE[suggestedConfidence].label}. ${suggested.confidence?.reason ?? ""} Not saved until you tap Save case.` : undefined} />
              <SelectField label="Primary statement" name="primary_statement_id" defaultValue={v("primary_statement_id")} empty="— none —" options={(statementsRes.data ?? []).map((s) => [s.id, `“${s.exact_quote.slice(0, 70)}”`] as [string, string])} />
              <SelectField label="Prediction" name="prediction_id" defaultValue={v("prediction_id")} empty="— none —" options={(predictionsRes.data ?? []).map((p) => [p.id, `“${p.prediction_text.slice(0, 70)}”`] as [string, string])} />
              <div className="md:col-span-2"><Field label="Summary" name="summary" defaultValue={v("summary")} rows={3} readOnly={published} /></div>
              <div className="md:col-span-2"><Field label="What happened afterward" name="what_happened" defaultValue={v("what_happened")} rows={2} readOnly={published} /></div>
              <div className="md:col-span-2"><Field label="Article (Markdown: ## headings, **bold**, - lists)" name="article_body" defaultValue={v("article_body")} rows={16} readOnly={published} /></div>
              <div className="md:col-span-2"><Field label="Limitations — what this does not establish" name="limitations" defaultValue={v("limitations")} rows={3} readOnly={published} /></div>
              <div className="md:col-span-2"><Field label="Editorial conclusion (labeled as interpretation)" name="editorial_conclusion" defaultValue={v("editorial_conclusion")} rows={3} readOnly={published} /></div>
              <Check label="Sponsored placement" name="is_sponsored" defaultChecked={c.is_sponsored} help="Sponsors never influence conclusions; disclosure is shown publicly." />
              <Field label="Sponsor disclosure" name="sponsor_disclosure" defaultValue={v("sponsor_disclosure")} />
              {!published && <div className="md:col-span-2"><Submit>Save case</Submit>{status === "approved" && <span className="meta ml-3">Saving content changes sends the case back to review.</span>}</div>}
            </form>
          </Panel>

          <Panel title="Evidence" id="evidence" note={`${evidence.length} linked`}>
            {contradicting.length > 0 && supporting.length > 0 && (
              <div className="mb-5 grid gap-3 md:grid-cols-2">
                <div className="border border-well p-3"><p className="kicker mb-1 !text-well">Supports / outcome</p>{supporting.map((e) => <p key={e.evidence_source_id + e.evidence_role} className="text-sm">• {String(e.source.title)} — {String(e.what_it_proves ?? "not assessed")}</p>)}</div>
                <div className="border border-red p-3"><p className="kicker mb-1 !text-red-ink">Contradicts / conflicts</p>{contradicting.map((e) => <p key={e.evidence_source_id} className="text-sm">• {String(e.source.title)} — {String(e.what_it_proves ?? "not assessed")}</p>)}</div>
              </div>
            )}
            <ol className="space-y-4">
              {evidence.map((e) => (
                <li key={e.evidence_source_id + e.evidence_role} className="border border-rule bg-paper p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{String(e.source.title)} <span className="meta">· {EVIDENCE_ROLE_LABELS[e.evidence_role as keyof typeof EVIDENCE_ROLE_LABELS]} · source {String(e.source.verification_status)}{e.source.is_primary ? " · primary" : ""}</span></p>
                    <span className="flex gap-2">
                      {e.source.canonical_url && <a className="btn btn-ghost btn-sm" href={String(e.source.canonical_url)} target="_blank" rel="noopener noreferrer">Open ↗</a>}
                      <Link className="btn btn-ghost btn-sm" href={`/admin/evidence/${e.evidence_source_id}`}>Source</Link>
                    </span>
                  </div>
                  {e.source.source_excerpt && <p className="mt-2 font-mono text-xs text-ink-2">{String(e.source.source_excerpt)}</p>}
                  <form action={addEvidence} className="mt-3 grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="id" value={c.id} /><Return to={`${back}#evidence`} />
                    <input type="hidden" name="evidence_source_id" value={e.evidence_source_id} /><input type="hidden" name="evidence_role" value={e.evidence_role} />
                    <SelectField label="Classification" name="classification" defaultValue={e.classification as string | null} empty="— not assessed —" options={CONFIDENCE_LEVELS.map((l) => [l, CONFIDENCE[l].label] as const)} />
                    <SelectField label="Identity / ownership independently established?" name="identity_established" defaultValue={e.identity_established === true ? "yes" : e.identity_established === false ? "no" : ""} empty="— unknown —" options={[["yes", "Yes"], ["no", "No"]]} />
                    <Field label="What it proves" name="what_it_proves" defaultValue={e.what_it_proves as string | null} rows={2} />
                    <Field label="What it does not prove" name="what_it_does_not_prove" defaultValue={e.what_it_does_not_prove as string | null} rows={2} />
                    <Field label="Limitations / conflicts" name="limitations" defaultValue={e.limitations as string | null} rows={2} />
                    <Field label="Order" name="sort_order" defaultValue={e.sort_order as number} />
                    <div className="flex gap-2 md:col-span-2"><Submit small>Save assessment</Submit></div>
                  </form>
                  <form action={removeEvidence} className="mt-2"><input type="hidden" name="id" value={c.id} /><Return to={`${back}#evidence`} /><input type="hidden" name="evidence_source_id" value={e.evidence_source_id} /><input type="hidden" name="evidence_role" value={e.evidence_role} /><button className="meta link !text-red-ink">Remove from case</button></form>
                </li>
              ))}
            </ol>
            <form action={addEvidence} className="mt-5 grid gap-3 border-t border-rule pt-4 md:grid-cols-[2fr_1fr_auto]">
              <input type="hidden" name="id" value={c.id} /><Return to={`${back}#evidence`} />
              <SelectField label="Attach an existing source" name="evidence_source_id" options={sources} required empty="Choose…" />
              <SelectField label="Role" name="evidence_role" options={EVIDENCE_ROLES.map((r) => [r, EVIDENCE_ROLE_LABELS[r]] as const)} />
              <div className="flex items-end"><Submit small>Attach</Submit></div>
            </form>
            <Link className="meta link mt-2 inline-block" href={`/admin/evidence/new?case=${c.id}`}>Or add a new source to this case →</Link>
          </Panel>

          <Panel title="Timeline" id="timeline">
            <ul className="mb-4 space-y-2">
              {(timelineRes.data ?? []).map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 border-b border-rule pb-2">
                  <span><span className="meta">{formatDate(t.occurred_at, t.date_precision)} · {t.kind}</span><br /><strong>{t.label}</strong> {t.description}</span>
                  <form action={removeTimelineEvent}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="event_id" value={t.id} /><Return to={`${back}#timeline`} /><button className="meta link">Remove</button></form>
                </li>
              ))}
            </ul>
            <form action={addTimelineEvent} className="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={c.id} /><Return to={`${back}#timeline`} />
              <Field label="Date (UTC)" name="occurred_at" type="datetime-local" required />
              <SelectField label="Precision" name="date_precision" defaultValue="day" options={[["exact", "Exact"], ["day", "Day"], ["month", "Month"], ["year", "Year"]]} />
              <SelectField label="Kind" name="kind" defaultValue="event" options={[["statement", "Statement"], ["action", "Action"], ["market", "Market"], ["disclosure", "Disclosure"], ["event", "Event"], ["response", "Response"]]} />
              <div className="md:col-span-2"><Field label="Label" name="label" required /></div>
              <SelectField label="Source" name="evidence_source_id" options={sources} empty="— none —" />
              <div className="md:col-span-3"><Field label="Description" name="description" /></div>
              <div><Submit small>Add event</Submit></div>
            </form>
          </Panel>

          {published && editor && (
            <Panel title="Publish a correction" tone="warn" id="correct">
              <p className="mb-3 text-sm">Tick each field you are correcting. Every change is recorded with your reason on the case page and in the public corrections log.</p>
              <form action={correctCase} className="space-y-3">
                <input type="hidden" name="id" value={c.id} /><Return to={`${back}#correct`} />
                {(["title", "summary", "what_happened", "article_body", "limitations", "editorial_conclusion"] as const).map((f) => (
                  <div key={f}>
                    <label className="flex items-center gap-2 font-mono text-xs uppercase"><input type="checkbox" name={`change_${f}`} /> Correct {f.replace(/_/g, " ")}</label>
                    <textarea name={f} defaultValue={v(f) ?? ""} rows={f === "article_body" ? 10 : 2} className="field mt-1" />
                  </div>
                ))}
                <div>
                  <label className="flex items-center gap-2 font-mono text-xs uppercase"><input type="checkbox" name="change_evidence_confidence" /> Correct evidence confidence</label>
                  <select name="evidence_confidence" defaultValue={v("evidence_confidence") ?? ""} className="field mt-1">{CONFIDENCE_LEVELS.map((l) => <option key={l} value={l}>{CONFIDENCE[l].label}</option>)}</select>
                </div>
                <Field label="Reason (published)" name="reason" required />
                <Check label="Internal clarification only (not shown publicly)" name="internal_only" />
                <Submit tone="red">Publish correction</Submit>
              </form>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Workflow" tone="ink">
            <p className="mb-3">Current status: <strong>{CASE_STATUS_LABELS[status]}</strong></p>
            <form action={transitionCase} className="space-y-3">
              <input type="hidden" name="id" value={c.id} /><Return to={back} />
              <SelectField label="Move to" name="to" options={transitions.map((t) => [t, CASE_STATUS_LABELS[t]] as const)} required empty="Choose…" />
              <Field label="Note for the record" name="notes" rows={2} />
              <Check label="Also queue AI evidence research" name="queue_research" help="Useful with “Researching”." />
              <Submit small>Change status</Submit>
            </form>
            {!editor && <p className="meta mt-3">Approval and publishing need an editor.</p>}
          </Panel>

          {editor && status === "approved" && (
            <Panel title="Publish" tone="warn" id="publish">
              <p className="mb-3 text-sm">This makes the case public immediately, indexed by search engines and eligible for the newsletter. Check every source has been opened.</p>
              <form action={publishCase} className="space-y-3">
                <input type="hidden" name="id" value={c.id} /><Return to={`${back}#publish`} />
                <Check label="I have reviewed the evidence, the legal checklist and the subject's right of reply, and I confirm this case should be published." name="confirm" />
                <Field label={`Type the address to confirm: ${c.slug}`} name="confirm_slug" required />
                <Field label="Publication note" name="notes" />
                <Submit tone="red">Publish now</Submit>
              </form>
            </Panel>
          )}

          <Panel title="Legal review checklist" id="legal" note={`${legal.done}/${legal.total}`} tone={legal.done === legal.total ? "default" : "warn"}>
            <form action={saveLegalReview} className="space-y-2">
              <input type="hidden" name="id" value={c.id} /><Return to={`${back}#legal`} />
              {useLegalSuggestions && <p className="border border-amber bg-amber-wash px-3 py-2 text-sm text-amber">Pre-ticked from the research agent&apos;s suggestions. Check each item yourself, untick anything you are not sure of, then tap Save checklist. Nothing counts until you save.</p>}
              {LEGAL_CHECKLIST.map((i) => {
                const s = suggested.legal?.[i.key];
                return <Check key={i.key} label={i.label} name={i.key}
                  defaultChecked={useLegalSuggestions ? s?.ok === true : c.legal_review?.[i.key] === true}
                  help={useLegalSuggestions && s?.reason ? `${i.help} Agent: ${s.ok ? "✓" : "✗"} ${s.reason}` : i.help} />;
              })}
              <Field label="Legal notes" name="legal_notes" defaultValue={c.legal_review?.notes ?? null} rows={2} />
              {editor ? <Submit small>Save checklist</Submit> : <p className="meta">Only an editor can complete this checklist.</p>}
            </form>
            {c.legal_reviewed_at && <p className="meta mt-2">Completed {formatDateTime(c.legal_reviewed_at)}</p>}
            <p className="meta mt-2">For potentially defamatory material, get advice from a media lawyer before approving.</p>
          </Panel>

          <Panel title="Subject response / right of reply" id="response">
            {(responsesRes.data ?? []).map((r) => (
              <div key={r.id} className="mb-3 border-b border-rule pb-2 text-sm">
                <strong>{OUTREACH_LABELS[r.outreach_status as keyof typeof OUTREACH_LABELS]}</strong> <span className="meta">{formatDateTime(r.created_at)}</span>
                {r.response_text && <p className="italic">“{r.response_text}”</p>}
                {r.internal_notes && <p className="meta">Internal: {r.internal_notes}</p>}
              </div>
            ))}
            <form action={saveResponse} className="space-y-2">
              <input type="hidden" name="id" value={c.id} /><Return to={`${back}#response`} />
              <SelectField label="Outreach status" name="outreach_status" options={OUTREACH_STATUSES.map((s) => [s, OUTREACH_LABELS[s]] as const)} />
              <SelectField label="Contact method" name="contact_method" empty="—" options={[["email", "Email"], ["social_dm", "Social DM"], ["representative", "Representative"], ["press_office", "Press office"], ["phone", "Phone"], ["other", "Other"]]} />
              <Field label="Contacted at (UTC)" name="contacted_at" type="datetime-local" />
              <Field label="Response requested by (UTC)" name="response_deadline" type="datetime-local" />
              <Field label="Response (published verbatim)" name="response_text" rows={3} />
              <Field label="Response source" name="response_source" />
              <Field label="Received at (UTC)" name="received_at" type="datetime-local" />
              <Field label="Internal notes (never published)" name="internal_notes" rows={2} />
              <Submit small>Record</Submit>
            </form>
          </Panel>

          <Panel title="AI research agents" id="ai">
            <p className="mb-3 text-sm text-ink-2">Agents propose; editors decide. They can&apos;t approve or publish.</p>
            {!published && status !== "approved" && (
              <div className="space-y-2">
                <AgentButton id={c.id} back={back} agent="assess" label="Assess evidence" />
                <AgentButton id={c.id} back={back} agent="draft" label="Write / rewrite draft" />
              </div>
            )}
            {(status === "approved" || published) && editor && <AgentButton id={c.id} back={back} agent="distribution" label="Generate distribution copy" overwrite />}
            <ul className="mt-4 space-y-1 text-sm">
              {(runsRes.data ?? []).map((r) => <li key={r.id} className="meta">{formatDateTime(r.created_at)} · {r.agent} · {r.status} · ${Number(r.estimated_cost).toFixed(4)}{r.error_message ? ` · ${r.error_message}` : ""}</li>)}
            </ul>
          </Panel>

          {(status === "approved" || published) && (
            <Panel title="Distribution" id="distribution">
              <form action={saveDistribution} className="space-y-2">
                <input type="hidden" name="id" value={c.id} /><Return to={`${back}#distribution`} />
                <Field label="Social headline" name="social_headline" defaultValue={v("social_headline")} maxLength={200} />
                <Field label="Short social post" name="social_post" defaultValue={v("social_post")} rows={3} maxLength={600} />
                <Field label="Newsletter summary" name="newsletter_summary" defaultValue={v("newsletter_summary")} rows={3} />
                <Field label="SEO description" name="seo_description" defaultValue={v("seo_description")} maxLength={300} />
                <Field label="Share-graphic text" name="social_graphic_text" defaultValue={v("social_graphic_text")} maxLength={200} />
                {editor && <Submit small>Save copy</Submit>}
              </form>
              {!!notes.distribution?.language_flags?.length && <p className="mt-2 text-sm text-red-ink">Flagged language: {notes.distribution.language_flags.join(", ")}</p>}
              <div className="mt-4 border-t border-rule pt-3">
                <p className="kicker mb-2">Share graphics</p>
                <div className="flex flex-wrap gap-2">
                  {(["og", "square", "story"] as const).map((f) => <a key={f} className="btn btn-ghost btn-sm" href={`/admin/social/${c.id}?format=${f}`} target="_blank" rel="noopener">{f === "og" ? "Link (1200×630)" : f === "square" ? "Square (1080²)" : "Vertical (1080×1920)"}</a>)}
                </div>
                <p className="kicker mb-2 mt-4">Copy-ready posts</p>
                <ul className="space-y-3">
                  {platformCopy({ title: c.title, socialHeadline: v("social_headline"), socialPost: v("social_post"), summary: v("summary"), caseType: c.case_type, confidence: (v("evidence_confidence") as Confidence) ?? null, personName: person.name, url: absoluteUrl(`/cases/${c.slug}`), quote: statement?.exact_quote ?? null, isDemo: c.is_demo }).map((p) => (
                    <li key={p.platform}>
                      <div className="flex items-center justify-between"><span className="font-mono text-xs font-semibold">{p.platform}{p.limit ? ` · ${p.text.length}/${p.limit}` : ""}</span><CopyButton text={p.text} /></div>
                      <pre className="mt-1 whitespace-pre-wrap bg-paper-2 p-2 font-mono text-xs">{p.text}</pre>
                      <p className="meta">{p.note}</p>
                    </li>
                  ))}
                </ul>
                {!published && <p className="meta mt-2">Not live yet: links work once the case is published.</p>}
              </div>
            </Panel>
          )}

          <Panel title="Review history" id="history">
            <form action={addReviewNote} className="mb-4 space-y-2">
              <input type="hidden" name="id" value={c.id} /><Return to={`${back}#history`} />
              <Field label="Add a note" name="notes" rows={2} />
              <SelectField label="Type" name="decision" options={[["comment", "Comment"], ["request_changes", "Request changes"]]} />
              <Submit small tone="ghost">Add note</Submit>
            </form>
            <ul className="space-y-2 text-sm">
              {(reviewsRes.data ?? []).map((r) => <li key={r.id}><span className="meta">{formatDateTime(r.created_at)} · {r.decision}{r.from_status !== r.to_status ? ` · ${r.from_status} → ${r.to_status}` : ""}</span>{r.notes && <p>{r.notes}</p>}</li>)}
            </ul>
            {(correctionsRes.data ?? []).length > 0 && (
              <>
                <p className="kicker mb-1 mt-4">Corrections</p>
                <ul className="space-y-1 text-sm">{(correctionsRes.data ?? []).map((k) => <li key={k.id}><span className="meta">{formatDateTime(k.created_at)} · {k.field}</span> {k.reason}</li>)}</ul>
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function AgentButton({ id, back, agent, label, overwrite }: { id: string; back: string; agent: string; label: string; overwrite?: boolean }) {
  return (
    <form action={runCaseAgent} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="agent" value={agent} /><Return to={`${back}#ai`} />
      {overwrite && <input type="hidden" name="overwrite" value="on" />}
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="now" defaultChecked /> run now</label>
      <Submit small tone="ghost">{label}</Submit>
    </form>
  );
}
