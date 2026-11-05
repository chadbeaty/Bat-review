import { beforeEach, describe, expect, it } from "vitest";
import { runAgent, type ClaudeLike } from "@/lib/ai/client";
import { DraftSchema, ExtractionSchema } from "@/lib/ai/schemas";
import { estimateCost } from "@/lib/ai/pricing";
import { accusatoryTerms, claimsSaleWithoutSaleEvidence, quoteAppearsVerbatim, screenExtracted } from "@/lib/ai/verify";
import { distribute, assessEvidence, draftCase } from "@/lib/ai/agents";
import { fakeDb } from "../support/fake-db";

function claude(response: Record<string, unknown> | Error): ClaudeLike & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    beta: {
      messages: {
        parse: (async (params: unknown) => {
          calls.push(params);
          if (response instanceof Error) throw response;
          return response;
        }) as never,
      },
    },
  };
}

const goodExtraction = {
  statements: [{
    person_slug: "dex-calloway-demo", exact_quote: "I will never sell", normalized_summary: "Commitment", statement_type: "explicit_commitment",
    asset_or_topic: "DemoCoin", statement_date: "2023-03-14", source_timecode: null, context: null, conditions: null, prediction: null, confidence: 0.9, uncertainty: null,
  }],
};

const call = (schema = ExtractionSchema) => ({
  agent: "statement_extraction" as const, jobType: "extract_statements", promptVersion: "test-v1", system: "rules", input: "{}", schema, inputSummary: "test",
});

describe("Claude client wrapper", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_MODEL = "";
  });

  it("returns validated structured output and records usage and estimated cost", async () => {
    const { db, calls } = fakeDb({ site_settings: [{ key: "ai_daily_budget_usd", value: 5 }] }, { ai_spend_today: 0 });
    const c = claude({ id: "msg_1", model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 500 }, parsed_output: goodExtraction });
    const res = await runAgent(db, call(), c);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.statements[0].exact_quote).toBe("I will never sell");
    const update = calls.find((x) => x.table === "ai_runs" && x.op === "update");
    expect(update?.values).toMatchObject({ status: "succeeded", input_tokens: 1000, output_tokens: 500, estimated_cost: estimateCost("claude-opus-5-5", { input_tokens: 1000, output_tokens: 500 }) });
    // Requests use structured output, the server-side refusal fallback, and the configured model.
    expect(c.calls[0]).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
  });

  it("discards a response that does not match the schema", async () => {
    const { db, calls } = fakeDb({}, { ai_spend_today: 0 });
    const res = await runAgent(db, call(), claude({ stop_reason: "end_turn", usage: {}, parsed_output: { statements: [{ exact_quote: 42 }] } }));
    expect(res).toMatchObject({ ok: false, retryable: true });
    expect(calls.find((x) => x.table === "ai_runs" && x.op === "update")?.values).toMatchObject({ status: "rejected_output" });
  });

  it("treats a refusal as a permanent failure and truncation as retryable", async () => {
    const { db } = fakeDb({}, { ai_spend_today: 0 });
    expect(await runAgent(db, call(), claude({ stop_reason: "refusal", usage: {}, parsed_output: null }))).toMatchObject({ ok: false, retryable: false });
    expect(await runAgent(db, call(), claude({ stop_reason: "max_tokens", usage: {}, parsed_output: null }))).toMatchObject({ ok: false, retryable: true });
  });

  it("stops before calling Claude when the daily budget is spent", async () => {
    const { db } = fakeDb({ site_settings: [{ key: "ai_daily_budget_usd", value: 2 }] }, { ai_spend_today: 2.5 });
    const c = claude({ stop_reason: "end_turn", usage: {}, parsed_output: goodExtraction });
    const res = await runAgent(db, call(), c);
    expect(res).toMatchObject({ ok: false, retryable: false });
    expect(c.calls).toHaveLength(0);
  });

  it("records API failures without throwing", async () => {
    const { db, calls } = fakeDb({}, { ai_spend_today: 0 });
    const res = await runAgent(db, call(), claude(new Error("socket hang up")));
    expect(res).toMatchObject({ ok: false, retryable: true });
    expect(calls.find((x) => x.table === "ai_runs" && x.op === "update")?.values).toMatchObject({ status: "failed" });
  });

  it("requires every draft field (the schema the API is constrained to)", () => {
    expect(DraftSchema.safeParse({ headline: "x" }).success).toBe(false);
  });
});

describe("pricing", () => {
  it("prices Claude Opus 5.5 at $4 / $20 per million tokens", () => {
    expect(estimateCost("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(24);
  });
  it("prices unknown models conservatively", () => {
    expect(estimateCost("mystery-model", { input_tokens: 1_000_000 })).toBeGreaterThanOrEqual(10);
  });
});

describe("quotation safeguards", () => {
  const source = "Host: When will you take profits?\nDex: I will never sell a single coin of my DemoCoin. Not one. Not ever. My kids will inherit every coin.";

  it("accepts quotes that appear word for word, ignoring typography", () => {
    expect(quoteAppearsVerbatim("I will never sell a single coin of my DemoCoin.", source)).toBe(true);
    expect(quoteAppearsVerbatim("“I will never sell a single coin of my DemoCoin. Not one. Not ever.”", source)).toBe(true);
    expect(quoteAppearsVerbatim("I will never sell a single coin … My kids will inherit every coin.", source.replace("...", "…"))).toBe(true);
  });

  it("rejects paraphrases and stitched quotes", () => {
    expect(quoteAppearsVerbatim("I will never sell any of my DemoCoin.", source)).toBe(false);
    expect(quoteAppearsVerbatim("My kids will inherit every coin ... I will never sell", source)).toBe(false);
  });

  it("only keeps extracted statements by tracked people with verbatim quotes", () => {
    const { accepted, rejected } = screenExtracted(
      [
        { person_slug: "dex", exact_quote: "Not one. Not ever." },
        { person_slug: "dex", exact_quote: "I'll never, ever sell" },
        { person_slug: "someone-else", exact_quote: "Not one." },
      ],
      source,
      new Set(["dex"])
    );
    expect(accepted).toHaveLength(1);
    expect(rejected.map((r) => r.reason)).toEqual(["Not found verbatim in the source text", 'Unknown person "someone-else"']);
  });

  it("flags accusatory language and sale claims without sale evidence", () => {
    expect(accusatoryTerms("He is a fraud and a liar")).toEqual(["fraud", "liar"]);
    expect(accusatoryTerms("The prediction aged poorly")).toEqual([]);
    expect(claimsSaleWithoutSaleEvidence("He sold his coins", ["transfer"])).toBe(true);
    expect(claimsSaleWithoutSaleEvidence("He sold his coins", ["sale"])).toBe(false);
  });
});

describe("agents respect the editorial workflow", () => {
  const caseRow = (status: string) => ({ id: "c1", title: "T", status, case_type: "never_sell", person_id: "p1", ai_notes: {}, primary_statement_id: null, prediction_id: null, person: { id: "p1", name: "Demo" } });

  it("refuses to write distribution copy for a case that is not approved", async () => {
    const { db } = fakeDb({ cases: [caseRow("needs_review")], case_evidence: [], case_timeline_events: [], subject_responses: [] });
    const c = claude({ stop_reason: "end_turn", usage: {}, parsed_output: {} });
    await expect(distribute({ db, claude: c }, { case_id: "c1" })).rejects.toThrow(/only for approved or published/);
    expect(c.calls).toHaveLength(0);
  });

  it("refuses to re-draft or re-assess an approved or published case", async () => {
    for (const status of ["approved", "published"]) {
      const { db } = fakeDb({ cases: [caseRow(status)], case_evidence: [], case_timeline_events: [], subject_responses: [] });
      await expect(draftCase({ db, claude: claude({}) }, { case_id: "c1" })).rejects.toThrow(/only work on cases still in research/);
      await expect(assessEvidence({ db, claude: claude({}) }, { case_id: "c1" })).rejects.toThrow(/only work on cases still in research/);
    }
  });

  it("never moves a drafted case past Needs review", async () => {
    const draft = {
      headline: "Demo headline", summary: "S", article_body: "Body without quotes", what_happened: "W", limitations: "L", editorial_conclusion: "E",
      evidence_confidence: "verified", chronology: [], subject_response_status: "none", reasoning_summary: "R", questions_for_editor: [],
    };
    const { db, calls } = fakeDb({ cases: [caseRow("evidence_gathering")], case_evidence: [], case_timeline_events: [], subject_responses: [] }, { ai_spend_today: 0 });
    await draftCase({ db, claude: claude({ stop_reason: "end_turn", usage: {}, parsed_output: draft }) }, { case_id: "c1" });
    const statuses = calls.filter((x) => x.table === "cases" && x.op === "update" && (x.values as { status?: string }).status).map((x) => (x.values as { status: string }).status);
    expect(statuses).toEqual(["draft_ready", "needs_review"]);
    expect(statuses).not.toContain("approved");
    expect(statuses).not.toContain("published");
  });
});
