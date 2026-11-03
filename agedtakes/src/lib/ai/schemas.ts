import { z } from "zod";

// Structured-output schemas for each research agent. Every field is required (nullable where unknown), which is
// what Claude's structured outputs expect; the same schemas validate the response again in code.

export const TriageSchema = z.object({
  items: z.array(z.object({
    item_id: z.string(),
    worth_extracting: z.boolean(),
    person_slug: z.string().nullable(),
    reason: z.string(),
  })),
});

export const ExtractionSchema = z.object({
  statements: z.array(z.object({
    person_slug: z.string().describe("Slug of the tracked person who made the statement"),
    exact_quote: z.string().describe("Exact substring of the source text"),
    normalized_summary: z.string(),
    statement_type: z.enum(["opinion", "prediction", "explicit_commitment", "documented_action", "factual_claim", "other"]),
    asset_or_topic: z.string().nullable(),
    statement_date: z.string().nullable().describe("ISO date (YYYY-MM-DD) if stated in the source, else null"),
    source_timecode: z.string().nullable(),
    context: z.string().nullable(),
    conditions: z.string().nullable(),
    prediction: z.object({
      target_value: z.number().nullable(),
      target_currency: z.string().nullable(),
      target_direction: z.enum(["at_or_above", "at_or_below", "event_occurs", "event_does_not_occur", "other"]).nullable(),
      deadline: z.string().nullable().describe("ISO date if the statement gives one"),
      resolution_criteria: z.string().nullable(),
    }).nullable(),
    confidence: z.number().min(0).max(1),
    uncertainty: z.string().nullable(),
  })),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const MatchingSchema = z.object({
  candidates: z.array(z.object({
    kind: z.enum(["contradiction", "changed_position", "broken_commitment", "kept_commitment", "approaching_deadline", "resolvable_prediction", "followed_by_activity"]),
    related_record_ids: z.array(z.string()),
    proposed_case_type: z.enum(["prediction_aged_poorly", "prediction_aged_well", "did_they_sell", "never_sell", "broken_promise", "kept_promise", "changed_position", "followed_own_advice", "other"]),
    working_title: z.string(),
    explanation: z.string(),
    reasons_it_may_not_be_a_story: z.string(),
    strength: z.number().min(0).max(1),
  })),
});
export type Matching = z.infer<typeof MatchingSchema>;

export const EvidenceSchema = z.object({
  sources: z.array(z.object({
    source_id: z.string(),
    classification: z.enum(["verified", "strong", "unconfirmed", "disputed"]),
    what_it_proves: z.string(),
    what_it_does_not_prove: z.string(),
    limitations: z.string(),
    conflicts: z.string().nullable(),
    identity_established: z.boolean(),
  })),
  overall_classification: z.enum(["verified", "strong", "unconfirmed", "disputed"]),
  overall_reasoning: z.string(),
  missing_evidence: z.array(z.string()),
});
export type EvidenceAssessment = z.infer<typeof EvidenceSchema>;

export const DraftSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  article_body: z.string(),
  what_happened: z.string(),
  limitations: z.string(),
  editorial_conclusion: z.string(),
  evidence_confidence: z.enum(["verified", "strong", "unconfirmed", "disputed"]),
  chronology: z.array(z.object({ date: z.string(), label: z.string(), source_id: z.string().nullable() })),
  subject_response_status: z.string(),
  reasoning_summary: z.string(),
  questions_for_editor: z.array(z.string()),
});
export type Draft = z.infer<typeof DraftSchema>;

export const ResolutionSchema = z.object({
  result: z.enum(["correct", "incorrect", "partially_correct", "unscorable", "disputed", "not_yet_resolvable"]),
  methodology: z.string(),
  observed_value: z.number().nullable(),
  supporting_source_id: z.string().nullable(),
  explanation: z.string(),
});

export const DistributionSchema = z.object({
  social_headline: z.string(),
  social_post: z.string(),
  newsletter_summary: z.string(),
  seo_description: z.string(),
  social_graphic_text: z.string(),
  suggested_related_slugs: z.array(z.string()),
});
export type Distribution = z.infer<typeof DistributionSchema>;
