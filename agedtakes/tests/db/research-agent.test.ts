// The scheduled research agent's intake: it may only create internal records and a case waiting for review,
// and every quotation must appear word for word in the captured source text.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";

const available = await canConnect();
const d = available ? describe : describe.skip;

const PAGE =
  "In an interview on Tuesday the fund manager said: “We think bitcoin will reach $1 million by 2030.” " +
  "She added that volatility would remain high in the short term.";

function submission(overrides: Record<string, unknown> = {}) {
  return {
    person_slug: "cathie-wood",
    case: { title: "A test prediction about bitcoin by 2030", case_type: "prediction_aged_poorly", summary: "Test summary.", article_body: "## The claim\n\nA test article.", seo_description: "A test description." },
    sources: [{ key: "s1", source_type: "interview", title: "Test interview", url: "https://news.example.org/interview", publisher: "Example News", published_at: "2023-02-01", text: PAGE }],
    statements: [{ source_key: "s1", exact_quote: '"We think bitcoin will reach $1 million by 2030."', statement_type: "prediction", published_at: "2023-02-01", date_precision: "day" }],
    evidence: [{ source_key: "s1", role: "original_statement", what_it_proves: "She made the prediction." }],
    flags: ["Check the interview date."],
    ...overrides,
  };
}

d("research agent intake (database)", () => {
  const db = new TestDb();
  beforeAll(() => db.setup());
  afterAll(() => db.teardown());

  const submit = (payload: unknown) =>
    db.owner<{ r: Record<string, unknown> }>("select public.agent_submit_research($1::jsonb) as r", [JSON.stringify(payload)]).then((rows) => rows[0].r);

  it("creates an internal, unverified draft waiting for review", async () => {
    const r = await submit(submission());
    expect(r.ok).toBe(true);
    const [c] = await db.owner<Record<string, unknown>>("select status, origin, ai_generated, approved_by, published_at, article_body, seo_description from cases where id = $1", [r.case_id]);
    expect(c).toMatchObject({ status: "needs_review", origin: "ai", ai_generated: true, approved_by: null, published_at: null, article_body: "## The claim\n\nA test article.", seo_description: "A test description." });
    const [s] = await db.owner<Record<string, unknown>>(
      "select visibility, verification_status, quote_verified_verbatim from statements where id = (select primary_statement_id from cases where id = $1)", [r.case_id]);
    expect(s).toMatchObject({ visibility: "internal", verification_status: "unverified", quote_verified_verbatim: true });
    const [snap] = await db.owner<{ n: number }>("select count(*)::int as n from source_snapshots ss join case_evidence ce on ce.evidence_source_id = ss.evidence_source_id where ce.case_id = $1", [r.case_id]);
    expect(snap.n).toBeGreaterThan(0);
    // Nobody outside the newsroom can see it.
    const visible = await db.as("anon", "select id from cases where id = $1", [r.case_id]);
    expect(visible).toHaveLength(0);
  });

  it("rejects quotations that are not in the captured text, and creates nothing without one", async () => {
    const r = await submit(submission({
      case: { title: "A made-up quote should never become a draft", case_type: "other" },
      statements: [{ source_key: "s1", exact_quote: "Bitcoin will definitely hit ten million dollars next year", statement_type: "prediction" }],
    }));
    expect(r.ok).toBe(false);
    const rows = await db.owner("select id from cases where title = 'A made-up quote should never become a draft'");
    expect(rows).toHaveLength(0);
  });

  it("skips duplicates, unknown people and demo records", async () => {
    expect((await submit(submission())).skipped).toBe(true);
    expect((await submit(submission({ person_slug: "nobody-at-all" }))).ok).toBe(false);
    expect((await submit(submission({ person_slug: "dex-calloway-demo", case: { title: "Demo people are off limits", case_type: "other" } }))).ok).toBe(false);
  });

  it("lists research candidates but never demo people in the brief", async () => {
    const [{ b }] = await db.owner<{ b: { people: { slug: string }[]; instructions: unknown } }>("select public.agent_research_brief() as b");
    const slugs = b.people.map((p) => p.slug);
    expect(slugs).toContain("cathie-wood");
    expect(slugs.some((s) => s.endsWith("-demo"))).toBe(false);
    expect(typeof b.instructions).toBe("string");
  });

  it("cannot be called by visitors or signed-in users", async () => {
    await expect(db.as("anon", "select public.agent_submit_research('{}'::jsonb)")).rejects.toThrow(/permission denied/);
    const user = await db.createUser();
    await expect(db.as(user, "select public.agent_research_brief()")).rejects.toThrow(/permission denied/);
  });
});
