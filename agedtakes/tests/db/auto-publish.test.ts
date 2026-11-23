// Optional auto-publish for research-agent drafts: off by default, waits out the review window, publishes only
// drafts that pass every automatic check, and never touches a draft a person has acted on.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";

const available = await canConnect();
const d = available ? describe : describe.skip;

const PAGE =
  "Speaking at the conference, the investor said: “Gold will trade above $3,000 an ounce by the end of 2025.” " +
  "He repeated the forecast in a later interview.";
const ALL_OK = Object.fromEntries(
  ["quotes_verbatim_and_sourced", "dates_verified", "context_included", "no_unsupported_accusation", "ownership_and_identity_established",
    "transfers_not_called_sales", "opinion_labeled_as_opinion", "limitations_stated"].map((k) => [k, { ok: true, reason: "Checked." }]),
);

function draft(title: string, overrides: Record<string, unknown> = {}) {
  return {
    person_slug: "robert-kiyosaki",
    case: { title, case_type: "prediction_aged_well", summary: "A summary.", article_body: "## The claim\n\nAn article." },
    sources: [{ key: "s1", source_type: "article", title: "Conference report", url: `https://news.example.org/${encodeURIComponent(title)}`, published_at: "2024-03-01", text: PAGE }],
    statements: [{ source_key: "s1", exact_quote: "Gold will trade above $3,000 an ounce by the end of 2025.", statement_type: "prediction", published_at: "2024-03-01", date_precision: "day" }],
    suggestions: { legal: { ...ALL_OK, right_of_reply_offered: { ok: false, reason: "Not contacted." } }, confidence: { level: "verified", reason: "Primary source." } },
    ...overrides,
  };
}

d("auto-publish (database)", () => {
  const db = new TestDb();
  let admin: { id: string };
  beforeAll(async () => {
    await db.setup();
    admin = await db.createStaff("admin");
  });
  afterAll(() => db.teardown());

  const submit = async (payload: unknown) => {
    const [{ r }] = await db.owner<{ r: { ok: boolean; case_id: string } }>("select public.agent_submit_research($1::jsonb) as r", [JSON.stringify(payload)]);
    expect(r.ok).toBe(true);
    return r.case_id;
  };
  const age = (id: string, hours: number) => db.owner(`update cases set created_at = now() - interval '${hours} hours' where id = $1`, [id]);
  const run = () => db.as<{ r: { enabled: boolean; published?: { case: string }[]; waiting?: { case: string; reason: string }[] } }>("service", "select public.auto_publish_due_cases() as r").then((rows) => rows[0].r);
  const status = (id: string) => db.owner<{ status: string }>("select status from cases where id = $1", [id]).then((rows) => rows[0].status);

  it("does nothing while the setting is off", async () => {
    const id = await submit(draft("Off by default"));
    await age(id, 48);
    expect((await run()).enabled).toBe(false);
    expect(await status(id)).toBe("needs_review");
    await db.owner("update cases set status = 'rejected' where id = $1", [id]);
  });

  it("publishes an eligible draft after the review window, credited to the admin who switched it on", async () => {
    // Switched on just now: drafts already waiting get the full window from this moment, however old they are.
    await db.owner("update site_settings set value = 'true'::jsonb, updated_by = $1, updated_at = now() where key = 'auto_publish_enabled'", [admin.id]);
    const backlog = await submit(draft("Waiting since before it was switched on"));
    await age(backlog, 100);
    expect((await run()).published).toEqual([]);
    expect(await status(backlog)).toBe("needs_review");
    // A day later, the backlog and anything else past its window can go.
    await db.owner("alter table site_settings disable trigger site_settings_updated_at");
    await db.owner("update site_settings set updated_at = now() - interval '30 hours' where key = 'auto_publish_enabled'");
    await db.owner("alter table site_settings enable trigger site_settings_updated_at");
    await db.owner("update cases set status = 'rejected' where id = $1", [backlog]);
    const fresh = await submit(draft("Still inside the window"));
    await age(fresh, 2);
    const due = await submit(draft("Old enough to publish"));
    await age(due, 25);
    const result = await run();
    expect(result.published?.map((p) => p.case)).toEqual([due]);
    expect(await status(fresh)).toBe("needs_review");

    const [c] = await db.owner<Record<string, unknown>>("select status, approved_by, published_by, evidence_confidence, legal_review from cases where id = $1", [due]);
    expect(c).toMatchObject({ status: "published", approved_by: admin.id, published_by: admin.id, evidence_confidence: "verified" });
    expect((c.legal_review as Record<string, unknown>).right_of_reply_offered).toBe(false);
    expect((c.legal_review as Record<string, unknown>).auto_published).toBe(true);
    // Visitors can now see the case, its person and its quotation.
    expect(await db.as("anon", "select id from cases where id = $1", [due])).toHaveLength(1);
    expect(await db.as("anon", "select id from statements where id = (select primary_statement_id from cases where id = $1)", [due])).toHaveLength(1);
    const reviews = await db.owner<{ decision: string }>("select decision from editorial_reviews where case_id = $1", [due]);
    expect(reviews.map((r) => r.decision)).toContain("publish");
  });

  it("leaves drafts that fail a check in review, with the reason", async () => {
    const weak = await submit(draft("Weak evidence", { suggestions: { legal: { ...ALL_OK }, confidence: { level: "unconfirmed" } } }));
    const unchecked = await submit(draft("Missing a legal check", { suggestions: { legal: { quotes_verbatim_and_sourced: { ok: true } }, confidence: { level: "strong" } } }));
    await age(weak, 30);
    await age(unchecked, 30);
    await run();
    for (const id of [weak, unchecked]) {
      const [c] = await db.owner<{ status: string; ai_notes: { auto_publish_skipped?: string } }>("select status, ai_notes from cases where id = $1", [id]);
      expect(c.status).toBe("needs_review");
      expect(c.ai_notes.auto_publish_skipped).toBeTruthy();
    }
  });

  it("never publishes a draft a person has rejected, sent back, or put on hold", async () => {
    const rejected = await submit(draft("Editor rejected this"));
    const held = await submit(draft("Editor held this"));
    await age(rejected, 30);
    await age(held, 30);
    await db.owner("update cases set status = 'rejected' where id = $1", [rejected]);
    await db.owner("update cases set ai_notes = ai_notes || '{\"auto_publish\": \"hold\"}'::jsonb where id = $1", [held]);
    await run();
    expect(await status(rejected)).toBe("rejected");
    expect(await status(held)).toBe("needs_review");
  });

  it("keeps the human rules: no one else can approve or publish without being an editor", async () => {
    const id = await submit(draft("Service role cannot approve directly"));
    await expect(db.as("service", "update cases set status = 'approved' where id = $1", [id])).rejects.toThrow(/Only a signed-in editor/);
    await expect(db.as("anon", "select public.auto_publish_due_cases()")).rejects.toThrow(/permission denied/);
    const reader = await db.createUser();
    await expect(db.as(reader, "select public.auto_publish_due_cases()")).rejects.toThrow(/permission denied/);
  });
});
