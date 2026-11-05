import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAgent, type ClaudeLike } from "@/lib/ai/client";
import { DISTRIBUTION_SYSTEM, DRAFT_SYSTEM, EVIDENCE_SYSTEM, EXTRACTION_SYSTEM, MATCHING_SYSTEM, PROMPT_VERSIONS, RESOLUTION_SYSTEM, TRIAGE_SYSTEM } from "@/lib/ai/prompts";
import { DistributionSchema, DraftSchema, EvidenceSchema, ExtractionSchema, MatchingSchema, ResolutionSchema, TriageSchema } from "@/lib/ai/schemas";
import { accusatoryTerms, quoteAppearsVerbatim, screenExtracted } from "@/lib/ai/verify";
import { coingeckoDaily, fmpDaily, inferResolutionMode, resolvePriceTarget, type PriceSeries } from "@/lib/connectors/prices";
import { sha256 } from "@/lib/ai/hash";
import { slugify } from "@/lib/format";

// The research agents. All run with the service role (server-side jobs), which the database allows to create
// drafts and proposals but never to approve, publish, resolve a prediction or make a record public.

export type AgentOutcome = { summary: string; queue?: { job_type: string; payload: Record<string, unknown>; dedupe_key: string; person_id?: string | null; case_id?: string | null }[]; details?: Record<string, unknown> };

type Ctx = { db: SupabaseClient; jobId?: string | null; claude?: ClaudeLike; fetch?: typeof fetch; now?: Date };

class AgentError extends Error {
  constructor(message: string, public retryable = true) {
    super(message);
  }
}
export { AgentError };

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new AgentError(`${what}: ${res.error.message}`);
  if (res.data === null || res.data === undefined) throw new AgentError(`${what}: not found`, false);
  return res.data as NonNullable<T>;
}

function json(value: unknown) {
  return JSON.stringify(value, null, 1);
}

async function trackedPeople(db: SupabaseClient) {
  const { data } = await db.from("people").select("id, name, slug, occupation").in("status", ["active", "research_candidate", "draft"]).limit(500);
  return data ?? [];
}

/** Finds or creates the evidence source for a URL, and stores a hashed snapshot of its text. */
export async function ensureSource(db: SupabaseClient, s: { url: string | null; title: string; publisher?: string | null; author?: string | null; publishedAt?: string | null; sourceType: string; text?: string | null; excerpt?: string | null; isPrimary?: boolean }) {
  let id: string | null = null;
  if (s.url) {
    const { data } = await db.from("evidence_sources").select("id").eq("canonical_url", s.url).maybeSingle();
    id = data?.id ?? null;
  }
  if (!id) {
    const row = must(await db.from("evidence_sources").insert({
      source_type: s.sourceType, title: s.title.slice(0, 400) || "Untitled source", publisher: s.publisher ?? null, author: s.author ?? null,
      canonical_url: s.url, published_at: s.publishedAt ?? null, source_excerpt: s.excerpt?.slice(0, 4000) ?? null,
      content_hash: s.text ? sha256(s.text) : null, is_primary: s.isPrimary ?? false, verification_status: "unverified",
    }).select("id").single(), "create source");
    id = row.id as string;
  }
  if (s.text) {
    await db.from("source_snapshots").upsert({ evidence_source_id: id, content_text: s.text, content_hash: sha256(s.text), fetched_from: s.url }, { onConflict: "evidence_source_id,content_hash", ignoreDuplicates: true });
  }
  return id as string;
}

async function snapshotText(db: SupabaseClient, sourceId: string, max = 20_000): Promise<string | null> {
  const { data } = await db.from("source_snapshots").select("content_text").eq("evidence_source_id", sourceId).order("fetched_at", { ascending: false }).limit(1).maybeSingle();
  return data?.content_text ? String(data.content_text).slice(0, max) : null;
}

// -------------------------------------------------------------------------------- A. Source Monitor (triage)
export async function triageItems(ctx: Ctx, itemIds: string[]): Promise<AgentOutcome> {
  const { db } = ctx;
  if (!itemIds.length) return { summary: "No new items." };
  const items = must(await db.from("source_items").select("id, title, url, content_text, person_id").in("id", itemIds), "load items") ?? [];
  const people = await trackedPeople(db);
  const res = await runAgent(db, {
    agent: "source_monitor", jobType: "monitor_sources", promptVersion: PROMPT_VERSIONS.triage, system: TRIAGE_SYSTEM, schema: TriageSchema, effort: "low", maxTokens: 8000,
    researchJobId: ctx.jobId, inputSummary: `Triage ${items.length} discovered items`,
    input: json({ tracked_people: people.map((p) => ({ slug: p.slug, name: p.name })), items: items.map((i) => ({ item_id: i.id, title: i.title, url: i.url, text: (i.content_text ?? "").slice(0, 1500) })) }),
  }, ctx.claude);
  if (!res.ok) throw new AgentError(res.error, res.retryable);
  const queue: AgentOutcome["queue"] = [];
  for (const t of res.data.items) {
    if (!itemIds.includes(t.item_id)) continue;
    if (t.worth_extracting) {
      await db.from("source_items").update({ status: "queued" }).eq("id", t.item_id);
      queue.push({ job_type: "extract_statements", payload: { source_item_id: t.item_id }, dedupe_key: `extract:${t.item_id}` });
    } else {
      await db.from("source_items").update({ status: "ignored", metadata: { triage_reason: t.reason } }).eq("id", t.item_id);
    }
  }
  return { summary: `Triaged ${items.length} items; ${queue.length} queued for extraction.`, queue };
}

// ------------------------------------------------------------------------------ B. Statement Extraction
export async function extractStatements(ctx: Ctx, payload: { source_item_id?: string; evidence_source_id?: string }): Promise<AgentOutcome> {
  const { db } = ctx;
  let sourceId = payload.evidence_source_id ?? null;
  let text: string | null = null;
  let meta: { title: string | null; url: string | null; published_at: string | null; author: string | null } = { title: null, url: null, published_at: null, author: null };

  if (payload.source_item_id) {
    const item = must(await db.from("source_items").select("*").eq("id", payload.source_item_id).single(), "load item");
    text = item.content_text;
    meta = { title: item.title, url: item.url, published_at: item.published_at, author: item.author };
    if (!text || text.length < 40) {
      await db.from("source_items").update({ status: "ignored", metadata: { ...(item.metadata ?? {}), note: "No usable text (e.g. a PDF filing): add the document text as a source snapshot to extract it." } }).eq("id", item.id);
      return { summary: "Item has no usable text; left for an editor." };
    }
    sourceId = await ensureSource(db, { url: item.url, title: item.title ?? "Discovered item", author: item.author, publishedAt: item.published_at, sourceType: guessSourceType(item.connector), text, isPrimary: true });
    await db.from("source_items").update({ evidence_source_id: sourceId }).eq("id", item.id);
  } else if (sourceId) {
    const src = must(await db.from("evidence_sources").select("title, canonical_url, published_at, author").eq("id", sourceId).single(), "load source");
    meta = { title: src.title, url: src.canonical_url, published_at: src.published_at, author: src.author };
    text = await snapshotText(db, sourceId, 80_000);
    if (!text) return { summary: "This source has no stored text snapshot to extract from." };
  } else {
    throw new AgentError("extract_statements needs source_item_id or evidence_source_id", false);
  }

  const people = await trackedPeople(db);
  const bySlug = new Map(people.map((p) => [p.slug, p]));
  const res = await runAgent(db, {
    agent: "statement_extraction", jobType: "extract_statements", promptVersion: PROMPT_VERSIONS.extraction, system: EXTRACTION_SYSTEM, schema: ExtractionSchema, effort: "medium",
    researchJobId: ctx.jobId, inputSummary: `Extract statements from: ${meta.title ?? meta.url}`,
    input: json({ tracked_people: people.map((p) => ({ slug: p.slug, name: p.name, occupation: p.occupation })), source: meta, source_text: text.slice(0, 60_000) }),
  }, ctx.claude);
  if (!res.ok) throw new AgentError(res.error, res.retryable);

  const created: string[] = [];
  const screened = screenExtracted(res.data.statements, text, new Set(bySlug.keys()));
  const rejected = screened.rejected;
  const queue: NonNullable<AgentOutcome["queue"]> = [];
  // The core safeguard: only statements by tracked people whose quotation appears word for word are stored.
  for (const s of screened.accepted) {
    const person = bySlug.get(s.person_slug)!;
    const date = s.statement_date && /^\d{4}-\d{2}-\d{2}/.test(s.statement_date) ? s.statement_date : meta.published_at;
    const notes = [s.uncertainty, s.statement_date ? null : date ? "Date taken from the source's publication date; verify." : "Date unknown; verify before publishing."].filter(Boolean).join(" ");
    const { data: st, error } = await db.from("statements").insert({
      person_id: person.id, exact_quote: s.exact_quote, normalized_summary: s.normalized_summary, statement_type: s.statement_type, asset_or_topic: s.asset_or_topic,
      published_at: date, date_precision: s.statement_date ? "day" : date ? "day" : "unknown", source_id: sourceId,
      source_timecode: s.source_timecode && /^\d{1,2}(:\d{2}){1,2}$/.test(s.source_timecode) ? s.source_timecode : null,
      context: s.context, conditions: s.conditions, verification_status: "unverified", quote_verified_verbatim: true,
      visibility: "internal", extraction_confidence: Math.max(0, Math.min(1, s.confidence)), extraction_notes: notes || null, ai_run_id: res.runId,
    }).select("id").single();
    if (error) {
      if (!/duplicate key/.test(error.message)) rejected.push({ quote: s.exact_quote.slice(0, 120), reason: error.message });
      continue;
    }
    created.push(st.id);
    if (s.statement_type === "prediction" && s.prediction && date) {
      await db.from("predictions").insert({
        person_id: person.id, statement_id: st.id, prediction_text: s.exact_quote, asset: s.asset_or_topic,
        target_value: s.prediction.target_value, target_currency: s.prediction.target_currency && /^[A-Z]{3,5}$/.test(s.prediction.target_currency) ? s.prediction.target_currency : null,
        target_direction: s.prediction.target_direction, prediction_date: date.slice(0, 10),
        deadline: s.prediction.deadline && /^\d{4}-\d{2}-\d{2}$/.test(s.prediction.deadline) && s.prediction.deadline >= date.slice(0, 10) ? s.prediction.deadline : null,
        resolution_criteria: s.prediction.resolution_criteria, status: "open", visibility: "internal",
      });
    }
    queue.push({ job_type: "match_history", payload: { statement_id: st.id }, dedupe_key: `match:${st.id}`, person_id: person.id });
  }
  if (payload.source_item_id) await db.from("source_items").update({ status: "processed" }).eq("id", payload.source_item_id);
  return { summary: `Extracted ${created.length} statement(s); rejected ${rejected.length}.`, queue, details: { created, rejected } };
}

function guessSourceType(connector: string): string {
  return ({ youtube: "video", sec_edgar: "sec_filing", house_disclosures: "congressional_disclosure", senate_disclosures: "senate_disclosure", rss: "article", manual_url: "official_website" } as Record<string, string>)[connector] ?? "other";
}

// ------------------------------------------------------------------------------ C. Historical Matching
export async function matchHistory(ctx: Ctx, payload: { statement_id: string }): Promise<AgentOutcome> {
  const { db } = ctx;
  const st = must(await db.from("statements").select("*, person:people(id, name, slug)").eq("id", payload.statement_id).single(), "load statement");
  const personId = st.person_id as string;
  const [prior, preds, txs] = await Promise.all([
    db.from("statements").select("id, exact_quote, statement_type, asset_or_topic, published_at, context, source_id").eq("person_id", personId).neq("id", st.id).order("published_at", { ascending: false }).limit(60),
    db.from("predictions").select("id, prediction_text, asset, target_value, target_currency, deadline, status, statement_id").eq("person_id", personId).limit(60),
    db.from("transactions").select("id, asset, transaction_type, owner, transaction_date, amount_low, amount_high, source_id").eq("person_id", personId).limit(60),
  ]);
  const res = await runAgent(db, {
    agent: "historical_matching", jobType: "match_history", promptVersion: PROMPT_VERSIONS.matching, system: MATCHING_SYSTEM, schema: MatchingSchema, effort: "medium",
    researchJobId: ctx.jobId, inputSummary: `Match new statement against ${prior.data?.length ?? 0} prior statements for ${st.person?.name}`,
    input: json({ today: (ctx.now ?? new Date()).toISOString().slice(0, 10), person: st.person, new_statement: st, earlier_statements: prior.data ?? [], predictions: preds.data ?? [], documented_transactions: txs.data ?? [] }),
  }, ctx.claude);
  if (!res.ok) throw new AgentError(res.error, res.retryable);

  const queue: NonNullable<AgentOutcome["queue"]> = [];
  const cases: string[] = [];
  const known = new Map<string, string | null>([...(prior.data ?? []).map((s) => [s.id, s.source_id] as [string, string | null]), [st.id, st.source_id]]);
  for (const c of res.data.candidates.filter((x) => x.strength >= 0.6).slice(0, 3)) {
    const title = c.working_title.replace(/\s+/g, " ").trim().slice(0, 190) || `Possible story: ${st.person?.name}`;
    const slug = `${slugify(title, 70)}-${crypto.randomUUID().slice(0, 6)}`;
    const { data: created, error } = await db.from("cases").insert({
      slug, person_id: personId, primary_statement_id: st.id, title: title.length >= 5 ? title : `${title} (candidate)`, case_type: c.proposed_case_type,
      status: "discovered", origin: "ai", ai_generated: true,
      ai_notes: { candidate: c, prompt_version: PROMPT_VERSIONS.matching, language_flags: accusatoryTerms(`${c.working_title} ${c.explanation}`), ai_run_id: res.runId },
    }).select("id").single();
    if (error) continue;
    cases.push(created.id);
    if (st.source_id) await db.from("case_evidence").insert({ case_id: created.id, evidence_source_id: st.source_id, evidence_role: "original_statement" });
    for (const rid of c.related_record_ids) {
      const src = known.get(rid);
      if (src && src !== st.source_id) await db.from("case_evidence").insert({ case_id: created.id, evidence_source_id: src, evidence_role: c.kind === "contradiction" || c.kind === "changed_position" ? "contradicting" : "supporting" });
    }
    await db.from("cases").update({ status: "researching" }).eq("id", created.id);
    queue.push({ job_type: "assess_evidence", payload: { case_id: created.id }, dedupe_key: `assess:${created.id}`, case_id: created.id, person_id: personId });
  }
  return { summary: `${res.data.candidates.length} candidate(s); ${cases.length} opened as cases for research.`, queue, details: { cases } };
}

// ----------------------------------------------------------------------------- D. Evidence Assessment
async function caseFile(db: SupabaseClient, caseId: string) {
  const c = must(await db.from("cases").select("*, person:people(id, name, slug, occupation)").eq("id", caseId).single(), "load case");
  const [statement, prediction, evidence, timeline, responses] = await Promise.all([
    c.primary_statement_id ? db.from("statements").select("*").eq("id", c.primary_statement_id).maybeSingle() : Promise.resolve({ data: null }),
    c.prediction_id ? db.from("predictions").select("*").eq("id", c.prediction_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("case_evidence").select("*, source:evidence_sources(*)").eq("case_id", caseId),
    db.from("case_timeline_events").select("occurred_at, label, description, evidence_source_id").eq("case_id", caseId).order("occurred_at"),
    db.from("subject_responses").select("outreach_status, contacted_at, response_text, received_at").eq("case_id", caseId).order("created_at", { ascending: false }).limit(1),
  ]);
  const ev = await Promise.all((evidence.data ?? []).map(async (e) => ({
    source_id: e.evidence_source_id, role: e.evidence_role, title: e.source?.title, publisher: e.source?.publisher, url: e.source?.canonical_url,
    published_at: e.source?.published_at, source_type: e.source?.source_type, excerpt: e.source?.source_excerpt,
    text: await snapshotText(db, e.evidence_source_id, 12_000),
  })));
  return { c, statement: statement.data, prediction: prediction.data, evidence: ev, timeline: timeline.data ?? [], response: responses.data?.[0] ?? null };
}

function assertDraftable(status: string) {
  if (["approved", "published", "disputed", "rejected", "archived"].includes(status)) throw new AgentError(`Case is ${status}; AI agents only work on cases still in research.`, false);
}

export async function assessEvidence(ctx: Ctx, payload: { case_id: string }): Promise<AgentOutcome> {
  const { db } = ctx;
  const file = await caseFile(db, payload.case_id);
  assertDraftable(file.c.status);
  if (!file.evidence.length) return { summary: "No evidence linked yet; add sources to this case first." };
  const res = await runAgent(db, {
    agent: "evidence_assessment", jobType: "assess_evidence", promptVersion: PROMPT_VERSIONS.evidence, system: EVIDENCE_SYSTEM, schema: EvidenceSchema, effort: "high",
    researchJobId: ctx.jobId, caseId: file.c.id, inputSummary: `Assess ${file.evidence.length} sources for "${file.c.title}"`,
    input: json({ case: { title: file.c.title, type: file.c.case_type, person: file.c.person, notes: file.c.ai_notes?.candidate ?? null }, statement: file.statement, prediction: file.prediction, evidence: file.evidence }),
  }, ctx.claude);
  if (!res.ok) throw new AgentError(res.error, res.retryable);
  for (const s of res.data.sources) {
    await db.from("case_evidence").update({
      classification: s.classification, what_it_proves: s.what_it_proves, what_it_does_not_prove: s.what_it_does_not_prove,
      limitations: [s.limitations, s.conflicts ? `Conflicts: ${s.conflicts}` : null].filter(Boolean).join(" "), identity_established: s.identity_established,
    }).eq("case_id", file.c.id).eq("evidence_source_id", s.source_id);
  }
  await db.from("cases").update({ ai_notes: { ...(file.c.ai_notes ?? {}), evidence_assessment: res.data, evidence_run_id: res.runId } }).eq("id", file.c.id);
  if (["discovered", "researching"].includes(file.c.status)) {
    if (file.c.status === "discovered") await db.from("cases").update({ status: "researching" }).eq("id", file.c.id);
    await db.from("cases").update({ status: "evidence_gathering" }).eq("id", file.c.id);
  }
  return {
    summary: `Evidence assessed: overall ${res.data.overall_classification}.`,
    queue: [{ job_type: "draft_case", payload: { case_id: file.c.id }, dedupe_key: `draft:${file.c.id}`, case_id: file.c.id }],
  };
}

// --------------------------------------------------------------------------- E. Investigation Draft
export async function draftCase(ctx: Ctx, payload: { case_id: string }): Promise<AgentOutcome> {
  const { db } = ctx;
  const file = await caseFile(db, payload.case_id);
  assertDraftable(file.c.status);
  const res = await runAgent(db, {
    agent: "investigation_draft", jobType: "draft_case", promptVersion: PROMPT_VERSIONS.draft, system: DRAFT_SYSTEM, schema: DraftSchema, effort: "high", maxTokens: 24000,
    researchJobId: ctx.jobId, caseId: file.c.id, inputSummary: `Draft "${file.c.title}"`,
    input: json({ case: { title: file.c.title, type: file.c.case_type, person: file.c.person, candidate: file.c.ai_notes?.candidate ?? null, evidence_assessment: file.c.ai_notes?.evidence_assessment ?? null }, statement: file.statement, prediction: file.prediction, evidence: file.evidence, timeline: file.timeline, subject_response: file.response }),
  }, ctx.claude);
  if (!res.ok) throw new AgentError(res.error, res.retryable);
  const d = res.data;

  // Every quoted passage in the draft must exist verbatim in the case file; anything else is flagged for the editor.
  const corpus = [file.statement?.exact_quote ?? "", ...file.evidence.map((e) => `${e.text ?? ""}\n${e.excerpt ?? ""}`)].join("\n");
  const quotes = [...`${d.headline}\n${d.article_body}`.matchAll(/[“"]([^”"]{12,400})[”"]/g)].map((m) => m[1]);
  const quoteFlags = quotes.filter((q) => !quoteAppearsVerbatim(q, corpus));
  const languageFlags = accusatoryTerms(`${d.headline} ${d.summary} ${d.article_body} ${d.editorial_conclusion}`);

  await db.from("cases").update({
    title: d.headline.slice(0, 200), summary: d.summary.slice(0, 1200), article_body: d.article_body.slice(0, 60000), what_happened: d.what_happened.slice(0, 8000),
    limitations: d.limitations.slice(0, 8000), editorial_conclusion: d.editorial_conclusion.slice(0, 4000), evidence_confidence: d.evidence_confidence,
    ai_generated: true,
    ai_notes: { ...(file.c.ai_notes ?? {}), reasoning_summary: d.reasoning_summary, questions_for_editor: d.questions_for_editor, chronology: d.chronology, subject_response_status: d.subject_response_status, quote_flags: quoteFlags, language_flags: languageFlags, prompt_version: PROMPT_VERSIONS.draft, draft_run_id: res.runId },
  }).eq("id", file.c.id);

  if (!file.timeline.length) {
    const rows = d.chronology.filter((e) => !Number.isNaN(Date.parse(e.date))).slice(0, 20).map((e) => ({
      case_id: file.c.id, occurred_at: new Date(e.date).toISOString(), label: e.label.slice(0, 200), kind: "event",
      evidence_source_id: e.source_id && file.evidence.some((x) => x.source_id === e.source_id) ? e.source_id : null,
    }));
    if (rows.length) await db.from("case_timeline_events").insert(rows);
  }
  // Walk the draft to "Needs review" — the furthest an automated job can take a case.
  const order = ["discovered", "researching", "evidence_gathering", "draft_ready", "needs_review"];
  for (const next of order.slice(Math.max(order.indexOf(file.c.status), 0) + 1)) await db.from("cases").update({ status: next }).eq("id", file.c.id);
  return { summary: `Draft written and sent to review.${quoteFlags.length ? ` ${quoteFlags.length} quote(s) flagged.` : ""}${languageFlags.length ? ` Language flagged: ${languageFlags.join(", ")}.` : ""}`, details: { quoteFlags, languageFlags } };
}

// ----------------------------------------------------------------------- F. Prediction Resolution
export async function resolvePrediction(ctx: Ctx, payload: { prediction_id: string; source_ids?: string[] }): Promise<AgentOutcome> {
  const { db } = ctx;
  const now = ctx.now ?? new Date();
  const p = must(await db.from("predictions").select("*").eq("id", payload.prediction_id).single(), "load prediction");
  if (p.status !== "open") return { summary: `Prediction is already ${p.status}.` };
  const { data: pending } = await db.from("prediction_outcomes").select("id").eq("prediction_id", p.id).eq("status", "proposed").limit(1);
  if (pending?.length) return { summary: "An outcome is already awaiting editor confirmation." };

  // Price predictions are resolved deterministically from the configured provider.
  if ((p.price_provider === "coingecko" || p.price_provider === "financial_modeling_prep") && p.asset_identifier && p.target_value !== null) {
    const from = new Date(`${p.prediction_date}T00:00:00Z`);
    const to = p.deadline && new Date(`${p.deadline}T23:59:59Z`) < now ? new Date(`${p.deadline}T23:59:59Z`) : now;
    let series: PriceSeries;
    if (p.price_provider === "coingecko") {
      series = await coingeckoDaily(p.asset_identifier, from, to, (p.target_currency ?? "USD").toLowerCase(), { fetch: ctx.fetch, apiKey: process.env.COINGECKO_API_KEY });
    } else {
      if (!process.env.FMP_API_KEY) return { summary: "FMP_API_KEY is not set; resolve this stock prediction manually." };
      series = await fmpDaily(p.asset_identifier, from, to, { fetch: ctx.fetch, apiKey: process.env.FMP_API_KEY });
    }
    const mode = inferResolutionMode(p.resolution_criteria ?? p.resolution_method);
    const r = resolvePriceTarget({ direction: p.target_direction, target: Number(p.target_value), deadline: p.deadline, series, now, mode });
    if (r.result === "not_yet_resolvable") return { summary: r.explanation };
    const sourceId = await ensureSource(db, {
      url: `${series.sourceUrl}#${p.id.slice(0, 8)}`, title: `${series.provider} daily prices for ${series.assetId} (${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)})`,
      publisher: series.provider === "coingecko" ? "CoinGecko" : "Financial Modeling Prep", sourceType: "market_data",
      text: JSON.stringify(series.points), excerpt: r.explanation, publishedAt: now.toISOString(),
    });
    must(await db.from("prediction_outcomes").insert({
      prediction_id: p.id, result: r.result, observed_value: r.observedValue, observed_currency: series.currency, price_provider: series.provider,
      asset_identifier: series.assetId, timezone: series.timezone, observation_time: r.observationTime, methodology: `${series.methodology} Mode: ${mode === "any_close" ? "any daily close in the window" : "close on the deadline"}.`,
      original_target: `${p.target_direction} ${p.target_value} ${p.target_currency ?? ""} by ${p.deadline ?? "no deadline"}`.trim(),
      notes: r.explanation, evidence_source_id: sourceId, proposed_by: "system", status: "proposed",
    }), "propose outcome");
    return { summary: `Proposed: ${r.result}. ${r.explanation} Awaiting editor confirmation.` };
  }

  // Other predictions: the AI may propose an outcome from sources an editor attached.
  if (!payload.source_ids?.length) return { summary: "Not a configured price prediction; attach outcome sources and request an AI resolution, or resolve manually." };
  const material = await Promise.all(payload.source_ids.map(async (id) => {
    const { data: s } = await db.from("evidence_sources").select("id, title, publisher, published_at, source_excerpt").eq("id", id).maybeSingle();
    return s ? { ...s, text: await snapshotText(db, id, 15_000) } : null;
  }));
  const res = await runAgent(db, {
    agent: "prediction_resolution", jobType: "resolve_prediction", promptVersion: PROMPT_VERSIONS.resolution, system: RESOLUTION_SYSTEM, schema: ResolutionSchema, effort: "high",
    researchJobId: ctx.jobId, inputSummary: `Resolve prediction ${p.id.slice(0, 8)}`,
    input: json({ today: now.toISOString().slice(0, 10), prediction: p, outcome_material: material.filter(Boolean) }),
  }, ctx.claude);
  if (!res.ok) throw new AgentError(res.error, res.retryable);
  if (res.data.result === "not_yet_resolvable") return { summary: `Not yet resolvable: ${res.data.explanation}` };
  // Safety net in code: never propose "incorrect" before the deadline without an explicit early-resolution basis.
  if (res.data.result === "incorrect" && p.deadline && new Date(`${p.deadline}T23:59:59Z`) > now) {
    return { summary: "The AI proposed 'incorrect' before the deadline; discarded. An editor can resolve early with a written reason." };
  }
  const evidenceId = res.data.supporting_source_id && payload.source_ids.includes(res.data.supporting_source_id) ? res.data.supporting_source_id : payload.source_ids[0];
  must(await db.from("prediction_outcomes").insert({
    prediction_id: p.id, result: res.data.result, observed_value: res.data.observed_value, methodology: res.data.methodology.slice(0, 4000) || "AI-proposed from attached sources",
    notes: res.data.explanation, evidence_source_id: evidenceId, proposed_by: "ai", ai_run_id: res.runId, status: "proposed",
  }), "propose outcome");
  return { summary: `AI proposed: ${res.data.result}. Awaiting editor confirmation.` };
}

// ------------------------------------------------------------------- G. Editorial Distribution
export async function distribute(ctx: Ctx, payload: { case_id: string; overwrite?: boolean }): Promise<AgentOutcome> {
  const { db } = ctx;
  const file = await caseFile(db, payload.case_id);
  // Distribution copy is only ever generated for cases a human editor has approved.
  if (!["approved", "published"].includes(file.c.status)) throw new AgentError("Distribution copy is generated only for approved or published cases.", false);
  const { data: others } = await db.from("cases").select("slug, title, case_type, person_id").eq("status", "published").neq("id", file.c.id).limit(40);
  const res = await runAgent(db, {
    agent: "editorial_distribution", jobType: "distribution", promptVersion: PROMPT_VERSIONS.distribution, system: DISTRIBUTION_SYSTEM, schema: DistributionSchema, effort: "medium",
    researchJobId: ctx.jobId, caseId: file.c.id, inputSummary: `Distribution copy for "${file.c.title}"`,
    input: json({ case: { title: file.c.title, summary: file.c.summary, type: file.c.case_type, evidence_confidence: file.c.evidence_confidence, conclusion: file.c.editorial_conclusion, limitations: file.c.limitations, person: file.c.person?.name }, original_quote: file.statement?.exact_quote ?? null, other_published_cases: others ?? [] }),
  }, ctx.claude);
  if (!res.ok) throw new AgentError(res.error, res.retryable);
  const d = res.data;
  const flags = accusatoryTerms(`${d.social_headline} ${d.social_post} ${d.newsletter_summary} ${d.social_graphic_text}`);
  const set = (field: string, value: string, max: number) => (payload.overwrite || !file.c[field] ? { [field]: value.slice(0, max) } : {});
  await db.from("cases").update({
    ...set("social_headline", d.social_headline, 200), ...set("social_post", d.social_post, 600), ...set("newsletter_summary", d.newsletter_summary, 1200),
    ...set("seo_description", d.seo_description, 300), ...set("social_graphic_text", d.social_graphic_text, 200),
    ai_notes: { ...(file.c.ai_notes ?? {}), distribution: { suggested_related: d.suggested_related_slugs, language_flags: flags, run_id: res.runId } },
  }).eq("id", file.c.id);
  return { summary: `Distribution copy ready.${flags.length ? ` Review flagged language: ${flags.join(", ")}.` : ""}` };
}
