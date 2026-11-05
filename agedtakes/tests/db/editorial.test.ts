// Database-level guarantees: what the public can see, who can approve and publish, and the correction trail.
// Runs the real migrations and seed against a throwaway Postgres database (see harness.ts).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";

const available = await canConnect();
const d = available ? describe : describe.skip;

const COMPLETE_CHECKLIST = JSON.stringify({
  quotes_verbatim_and_sourced: true, dates_verified: true, context_included: true, no_unsupported_accusation: true,
  ownership_and_identity_established: true, transfers_not_called_sales: true, opinion_labeled_as_opinion: true,
  right_of_reply_offered: true, limitations_stated: true,
});
const DEX = "d0000000-0000-4000-8000-000000000001";
const DEX_SOURCE = "d1000000-0000-4000-8000-000000000001";
const AI_DRAFT = "d5000000-0000-4000-8000-000000000006";
const PUBLISHED_CASE = "d5000000-0000-4000-8000-000000000002";
const OPEN_PREDICTION = "d3000000-0000-4000-8000-000000000004";

async function rejects(p: Promise<unknown>, pattern: RegExp) {
  await expect(p).rejects.toThrow(pattern);
}

d("editorial safeguards (database)", () => {
  const db = new TestDb();
  let editor: { id: string };
  let researcher: { id: string };
  let admin: { id: string };
  let reader: { id: string };

  beforeAll(async () => {
    await db.setup();
    admin = await db.createStaff("admin");
    editor = await db.createStaff("editor");
    researcher = await db.createStaff("researcher");
    reader = await db.createUser();
  });
  afterAll(() => db.teardown());

  /** Creates a case through the AI path (service role), as the research engine does. */
  async function aiCase(slug: string) {
    const [row] = await db.as<{ id: string }>("service",
      `insert into cases (slug, person_id, title, summary, article_body, case_type, status, origin, evidence_confidence)
       values ($1, $2, 'An AI-drafted headline for testing', 'Summary', 'Body', 'prediction_aged_poorly', 'discovered', 'ai', 'verified') returning id`,
      [slug, DEX]);
    return row.id;
  }

  async function walkToNeedsReview(id: string, actor: "service" | { id: string } = "service") {
    for (const status of ["researching", "evidence_gathering", "draft_ready", "needs_review"]) {
      await db.as(actor, "update cases set status = $2 where id = $1", [id, status]);
    }
  }

  describe("public visibility", () => {
    it("shows visitors only published cases and active people", async () => {
      const cases = await db.as<{ status: string }>("anon", "select status from cases");
      expect(cases.length).toBe(5);
      expect(cases.every((c) => c.status === "published")).toBe(true);
      const people = await db.as<{ status: string }>("anon", "select status from people");
      expect(people.every((p) => p.status === "active")).toBe(true);
      const candidates = await db.as("anon", "select 1 from people where slug = 'warren-buffett'");
      expect(candidates).toHaveLength(0);
    });

    it("hides the AI draft, its review trail and internal statements", async () => {
      expect(await db.as("anon", "select 1 from cases where id = $1", [AI_DRAFT])).toHaveLength(0);
      expect(await db.as("anon", "select 1 from editorial_reviews")).toHaveLength(0);
      expect(await db.as("anon", "select 1 from statements where visibility = 'internal'")).toHaveLength(0);
      expect(await db.as(reader, "select 1 from cases where id = $1", [AI_DRAFT])).toHaveLength(0);
    });

    it("refuses visitors access to private operational tables", async () => {
      await rejects(db.as("anon", "select * from newsletter_subscribers"), /permission denied/);
      await rejects(db.as("anon", "select * from submissions"), /permission denied/);
      expect(await db.as("anon", "select * from audit_logs")).toHaveLength(0);
      expect(await db.as("anon", "select * from ai_runs")).toHaveLength(0);
      expect(await db.as(reader, "select * from research_jobs")).toHaveLength(0);
      expect(await db.as(reader, "select * from source_snapshots")).toHaveLength(0);
    });

    it("hides all demo content when the demo switch is off", async () => {
      await db.owner("update site_settings set value = 'false' where key = 'show_demo_content'");
      expect(await db.as("anon", "select 1 from cases")).toHaveLength(0);
      expect(await db.as("anon", "select 1 from people")).toHaveLength(0);
      expect(await db.as("anon", "select 1 from evidence_sources")).toHaveLength(0);
      expect(await db.as(editor, "select 1 from cases where is_demo")).not.toHaveLength(0);
      await db.owner("update site_settings set value = 'true' where key = 'show_demo_content'");
      expect(await db.as("anon", "select 1 from cases")).toHaveLength(5);
    });

    it("requires two-step verification for staff access", async () => {
      expect(await db.as({ id: editor.id, aal: "aal1" }, "select 1 from cases where id = $1", [AI_DRAFT])).toHaveLength(0);
      expect(await db.as(editor, "select 1 from cases where id = $1", [AI_DRAFT])).toHaveLength(1);
    });
  });

  describe("AI-generated cases cannot be published without human approval", () => {
    it("lets the AI pipeline move a draft to review but never approve or publish it", async () => {
      const id = await aiCase("ai-cannot-publish-test");
      await walkToNeedsReview(id);
      const [row] = await db.as<{ ai_generated: boolean }>("service", "select ai_generated from cases where id = $1", [id]);
      expect(row.ai_generated).toBe(true);

      await db.as("service", "insert into case_evidence (case_id, evidence_source_id, evidence_role) values ($1, $2, 'original_statement')", [id, DEX_SOURCE]);
      await rejects(db.as("service", "update cases set status = 'approved' where id = $1", [id]), /Only a signed-in editor can approve/);
      await rejects(db.as("service", "update cases set legal_review = $2 where id = $1", [id, COMPLETE_CHECKLIST]), /Only an editor/);
      await rejects(db.as("service", "update cases set approved_by = $2, approved_at = now() where id = $1", [id, editor.id]), /Approval fields are set by the workflow/);
      await rejects(db.as("service", "update cases set status = 'published', published_at = now() where id = $1", [id]), /cannot move from needs_review to published/);
      await rejects(db.as("service", "update cases set ai_generated = false where id = $1", [id]), /cannot be removed/);
    });

    it("refuses to insert a case that starts published", async () => {
      await rejects(
        db.as("service", `insert into cases (slug, person_id, title, case_type, status, published_at, approved_by)
                          values ('born-published', $1, 'A case that tries to skip review', 'other', 'published', now(), $2)`, [DEX, editor.id]),
        /must start in the research workflow/
      );
    });

    it("does not let a researcher approve or publish", async () => {
      const id = await aiCase("researcher-cannot-approve");
      await walkToNeedsReview(id, researcher);
      await rejects(db.as(researcher, "update cases set status = 'approved' where id = $1", [id]), /Only a signed-in editor/);
      await rejects(db.as(researcher, "select publish_case($1, 'researcher-cannot-approve')", [id]), /Only an editor can publish/);
    });

    it("publishes only after an editor approves, with evidence, a checklist and typed confirmation", async () => {
      const id = await aiCase("editor-approves-then-publishes");
      await walkToNeedsReview(id);

      await rejects(db.as(editor, "select transition_case($1, 'approved')", [id]), /at least one evidence source/);
      await db.as("service", "insert into case_evidence (case_id, evidence_source_id, evidence_role) values ($1, $2, 'original_statement')", [id, DEX_SOURCE]);
      await rejects(db.as(editor, "select transition_case($1, 'approved')", [id]), /legal review checklist/);
      await db.as(editor, "update cases set legal_review = $2 where id = $1", [id, COMPLETE_CHECKLIST]);

      await db.as(editor, "update cases set evidence_confidence = 'unconfirmed' where id = $1", [id]);
      await rejects(db.as(editor, "select transition_case($1, 'approved')", [id]), /Unconfirmed cannot be published/);
      await db.as(editor, "update cases set evidence_confidence = 'verified' where id = $1", [id]);

      await db.as(editor, "select transition_case($1, 'approved', 'Checked every source')", [id]);
      await rejects(db.as(editor, "update cases set status = 'published' where id = $1", [id]), /explicit confirmation/);
      await rejects(db.as(editor, "select publish_case($1, 'wrong-slug')", [id]), /did not match/);
      await db.as(editor, "select publish_case($1, 'editor-approves-then-publishes')", [id]);

      const [pub] = await db.as<{ status: string; approved_by: string; published_by: string; methodology_version: string }>(
        "anon", "select status, approved_by, published_by, methodology_version from cases where id = $1", [id]);
      expect(pub).toMatchObject({ status: "published", approved_by: editor.id, published_by: editor.id, methodology_version: "1.0" });

      const trail = await db.as<{ decision: string }>(editor, "select decision from editorial_reviews where case_id = $1 order by created_at", [id]);
      expect(trail.map((t) => t.decision)).toEqual(["approve", "publish"]);
    });

    it("sends an approved case back to review when its content is edited", async () => {
      const id = await aiCase("edit-after-approval");
      await walkToNeedsReview(id);
      await db.as("service", "insert into case_evidence (case_id, evidence_source_id, evidence_role) values ($1, $2, 'original_statement')", [id, DEX_SOURCE]);
      await db.as(editor, "update cases set legal_review = $2 where id = $1", [id, COMPLETE_CHECKLIST]);
      await db.as(editor, "select transition_case($1, 'approved')", [id]);
      await db.as(researcher, "update cases set article_body = 'Changed after approval' where id = $1", [id]);
      const [row] = await db.as<{ status: string; approved_by: string | null }>(editor, "select status, approved_by from cases where id = $1", [id]);
      expect(row).toEqual({ status: "needs_review", approved_by: null });
    });
  });

  describe("corrections", () => {
    it("blocks silent edits to a published case and records corrections publicly", async () => {
      await rejects(db.as(editor, "update cases set summary = 'Quietly rewritten' where id = $1", [PUBLISHED_CASE]), /recorded correction/);
      await db.as(editor, "select correct_published_case($1, $2::jsonb, 'Clarified the closing price wording.')", [
        PUBLISHED_CASE, JSON.stringify({ summary: "On 2 January 2024 Marla Quint predicted DemoCorp would reach $500 by year-end. It closed 2024 at $212.40." }),
      ]);
      const corrections = await db.as<{ field: string; reason: string }>("anon",
        "select field, reason from corrections where case_id = $1 order by created_at desc", [PUBLISHED_CASE]);
      expect(corrections[0]).toEqual({ field: "summary", reason: "Clarified the closing price wording." });
      await rejects(db.as("service", "delete from corrections"), /append-only/);
    });

    it("never lets a public prediction's original wording change in place", async () => {
      await rejects(db.as(editor, "update predictions set target_value = 300 where id = $1", [OPEN_PREDICTION]), /cannot be modified retroactively/);
      await rejects(db.as("service", "update predictions set prediction_text = 'rewritten' where id = $1", [OPEN_PREDICTION]), /cannot be modified retroactively/);
      await db.as(editor, "select correct_prediction($1, 'target_value', '400', 'Re-checked against the source: unchanged.')", [OPEN_PREDICTION]);
      const rows = await db.as("anon", "select 1 from corrections where prediction_id = $1", [OPEN_PREDICTION]);
      expect(rows).toHaveLength(1);
    });
  });

  describe("prediction resolution", () => {
    it("only lets a human editor resolve, and requires a reason before the deadline", async () => {
      await rejects(
        db.as("service", "update predictions set status = 'unscorable', outcome = 'n/a' where id = $1", [OPEN_PREDICTION]),
        /Only a signed-in editor can resolve/
      );
      await db.as("service", `insert into prediction_outcomes (prediction_id, result, methodology, evidence_source_id, proposed_by)
                              values ($1, 'incorrect', 'Test outcome proposed by the resolution agent', $2, 'ai')`,
        [OPEN_PREDICTION, "d1000000-0000-4000-8000-000000000005"]);
      const [outcome] = await db.as<{ id: string }>(editor, "select id from prediction_outcomes where prediction_id = $1 and status = 'proposed'", [OPEN_PREDICTION]);
      await rejects(db.as("service", "update prediction_outcomes set status = 'confirmed' where id = $1", [outcome.id]), /Only a signed-in editor/);
      await rejects(db.as(editor, "select confirm_prediction_outcome($1, 'Fell short')", [outcome.id]), /deadline has not passed/);
      await db.as(editor, "select confirm_prediction_outcome($1, 'Fell short', 'Test: company delisted, target can no longer be reached.')", [outcome.id]);
      const [p] = await db.as<{ status: string; resolved_by: string }>("anon", "select status, resolved_by from predictions where id = $1", [OPEN_PREDICTION]);
      expect(p).toEqual({ status: "resolved_incorrect", resolved_by: editor.id });
    });

    it("keeps unresolved predictions out of the accuracy denominator", async () => {
      const [s] = await db.as<{ predictions_resolved: string; predictions_open: string }>("anon",
        "select predictions_resolved, predictions_open from person_stats where person_id = 'd0000000-0000-4000-8000-000000000002'");
      expect(Number(s.predictions_resolved)).toBe(2);
      expect(Number(s.predictions_open)).toBe(0);
    });
  });

  describe("statements and evidence", () => {
    it("only lets editors make statements public, and only when verified and sourced", async () => {
      const [st] = await db.as<{ id: string }>("service",
        `insert into statements (person_id, exact_quote, statement_type, published_at, source_id, verification_status)
         values ($1, 'A quote extracted by the AI', 'opinion', now(), $2, 'verified') returning id`, [DEX, DEX_SOURCE]);
      await rejects(db.as("service", "update statements set visibility = 'public' where id = $1", [st.id]), /Only an editor/);
      await db.as(editor, "update statements set visibility = 'public' where id = $1", [st.id]);
      await rejects(
        db.as(editor, `insert into statements (person_id, exact_quote, statement_type, visibility) values ($1, 'Unsourced quote', 'opinion', 'public')`, [DEX]),
        /statements_public_needs_verification/
      );
    });

    it("never attributes a wallet without a source", async () => {
      await rejects(
        db.as(editor, "insert into wallets (chain, address, attributed_person_id, attribution_status) values ('demochain', 'demo1notsourced0000000000', $1, 'reported_by_third_party')", [DEX]),
        /wallets_attribution_sourced/
      );
    });
  });

  describe("audit log", () => {
    it("records who changed what, and cannot be rewritten", async () => {
      await db.as(editor, "update people set occupation = 'Crypto podcast host (fictional, edited)' where id = $1", [DEX]);
      const [entry] = await db.as<{ actor_id: string; action: string }>(admin,
        "select actor_id, action from audit_logs where entity_type = 'people' and entity_id = $1 order by id desc limit 1", [DEX]);
      expect(entry).toEqual({ actor_id: editor.id, action: "update" });
      expect(await db.as(editor, "select 1 from audit_logs")).toHaveLength(0);
      await rejects(db.as("service", "delete from audit_logs"), /permission denied|append-only/);
      await rejects(db.owner("update audit_logs set action = 'x'"), /append-only/);
    });
  });

  describe("roles", () => {
    it("lets nobody but an admin change roles, and keeps at least one admin", async () => {
      expect(await db.as(researcher, "update profiles set role = 'admin' where id = $1 returning id", [researcher.id])).toHaveLength(0);
      await rejects(db.as(admin, "update profiles set role = 'reader' where id = $1", [admin.id]), /At least one active admin/);
      await rejects(db.as(editor, "select bootstrap_admin($1)", [editor.id]), /permission denied/);
      const [boot] = await db.as<{ bootstrap_admin: boolean }>("service", "select bootstrap_admin($1)", [reader.id]);
      expect(boot.bootstrap_admin).toBe(false);
    });
  });

  describe("readers, newsletter and jobs", () => {
    it("lets readers follow public people without changing the person's updated time", async () => {
      const [before] = await db.owner<{ updated_at: Date; follower_count: number }>("select updated_at, follower_count from people where id = $1", [DEX]);
      await db.as(reader, "insert into user_follows (user_id, person_id) values ($1, $2)", [reader.id, DEX]);
      const [after] = await db.owner<{ updated_at: Date; follower_count: number }>("select updated_at, follower_count from people where id = $1", [DEX]);
      expect(after.follower_count).toBe(before.follower_count + 1);
      expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
      await rejects(db.as(reader, "insert into user_follows (user_id, person_id) values ($1, $2)", [editor.id, DEX]), /row-level security/);
      const candidate = await db.owner<{ id: string }>("select id from people where slug = 'jim-cramer'");
      await rejects(db.as(reader, "insert into user_follows (user_id, person_id) values ($1, $2)", [reader.id, candidate[0].id]), /row-level security/);
    });

    it("refuses to send a newsletter that includes an unpublished case", async () => {
      await rejects(
        db.as(editor, "insert into newsletter_issues (subject, case_ids, status) values ('Weekly', $1, 'sending')", [[AI_DRAFT]]),
        /only include published cases/
      );
      await db.as(editor, "insert into newsletter_issues (subject, case_ids, status) values ('Weekly', $1, 'sending')", [[PUBLISHED_CASE]]);
    });

    it("rate limits per key and window", async () => {
      const results: boolean[] = [];
      for (let i = 0; i < 4; i++) {
        const [r] = await db.as<{ hit_rate_limit: boolean }>("service", "select hit_rate_limit('test:ip', 3, 600)");
        results.push(r.hit_rate_limit);
      }
      expect(results).toEqual([true, true, true, false]);
      await rejects(db.as("anon", "select hit_rate_limit('x', 1, 60)"), /permission denied/);
    });

    it("deduplicates queued jobs and retries failures with backoff", async () => {
      await db.as("service", "insert into research_jobs (job_type, dedupe_key, max_attempts) values ('extract_statements', 'extract:test', 2)");
      await rejects(db.as("service", "insert into research_jobs (job_type, dedupe_key) values ('extract_statements', 'extract:test')"), /duplicate key/);
      const [claimed] = await db.as<{ id: string; attempts: number }>("service", "select * from claim_research_jobs('w1', 5, array['extract_statements'])");
      expect(claimed.attempts).toBe(1);
      expect(await db.as("service", "select * from claim_research_jobs('w2', 5, array['extract_statements'])")).toHaveLength(0);
      await db.as("service", "select fail_research_job($1, 'boom')", [claimed.id]);
      const [retry] = await db.as<{ status: string; run_after: Date }>("service", "select status, run_after from research_jobs where id = $1", [claimed.id]);
      expect(retry.status).toBe("queued");
      expect(retry.run_after.getTime()).toBeGreaterThan(Date.now());
      await db.as("service", "update research_jobs set run_after = now() where id = $1", [claimed.id]);
      const [again] = await db.as<{ id: string }>("service", "select * from claim_research_jobs('w1', 5, array['extract_statements'])");
      await db.as("service", "select fail_research_job($1, 'boom again')", [again.id]);
      const [failed] = await db.as<{ status: string }>("service", "select status from research_jobs where id = $1", [claimed.id]);
      expect(failed.status).toBe("failed");
    });
  });

  describe("public read API", () => {
    it("never returns unpublished cases or research candidates through the page functions", async () => {
      const [{ api_case: draft }] = await db.as<{ api_case: unknown }>("anon", "select api_case('dex-calloway-100k-before-2026-demo')");
      expect(draft).toBeNull();
      const [{ api_person: candidate }] = await db.as<{ api_person: unknown }>("anon", "select api_person('warren-buffett')");
      expect(candidate).toBeNull();
      const [{ api_cases: list }] = await db.as<{ api_cases: { items: { slug: string }[] } }>("anon", "select api_cases(p_limit => 100)");
      expect(list.items.map((i) => i.slug)).not.toContain("dex-calloway-100k-before-2026-demo");
      const [{ api_case: staffView }] = await db.as<{ api_case: unknown }>(editor, "select api_case('dex-calloway-100k-before-2026-demo')");
      expect(staffView).not.toBeNull();
    });

    it("keeps demo records out of the sitemap", async () => {
      const [{ api_sitemap: map }] = await db.as<{ api_sitemap: { cases: unknown[]; people: unknown[] } }>("anon", "select api_sitemap()");
      expect(map.cases).toHaveLength(0);
      expect(map.people).toHaveLength(0);
    });

    it("searches only public records", async () => {
      const rows = await db.as<{ kind: string; title: string }>("anon", "select kind, title from search_archive('bet my house')");
      expect(rows.every((r) => r.kind !== "case")).toBe(true);
    });
  });

  describe("demo cleanup", () => {
    it("is only callable by the server and removes every demo record", async () => {
      await rejects(db.as(admin, "select delete_demo_data()"), /permission denied/);
      await db.as("service", "select delete_demo_data()");
      const [left] = await db.owner<{ n: string }>("select (select count(*) from cases where is_demo) + (select count(*) from people where is_demo) + (select count(*) from statements where is_demo) as n");
      expect(Number(left.n)).toBe(0);
      const [setting] = await db.owner<{ value: boolean }>("select value from site_settings where key = 'show_demo_content'");
      expect(setting.value).toBe(false);
      // Records about a fictional person count as demo content too and are removed with it.
      expect(await db.owner("select 1 from cases where slug = 'editor-approves-then-publishes'")).toHaveLength(0);
      expect(await db.owner("select 1 from people where slug = 'warren-buffett'")).toHaveLength(1);
    });
  });
});
