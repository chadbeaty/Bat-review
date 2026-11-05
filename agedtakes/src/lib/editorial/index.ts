// Editorial vocabulary shared by pages, server actions and tests. The database enforces the same rules
// (supabase/migrations/*_editorial_rules.sql); tests check the two stay in sync.

export const CASE_STATUSES = [
  "discovered", "researching", "evidence_gathering", "draft_ready", "needs_review", "approved", "published",
  "rejected", "needs_more_evidence", "disputed", "archived",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  discovered: "Discovered",
  researching: "Researching",
  evidence_gathering: "Evidence gathering",
  draft_ready: "Draft ready",
  needs_review: "Needs review",
  approved: "Approved",
  published: "Published",
  rejected: "Rejected",
  needs_more_evidence: "Needs more evidence",
  disputed: "Disputed",
  archived: "Archived",
};

/** The main pipeline, in order, for the progress indicator. */
export const PIPELINE: CaseStatus[] = ["discovered", "researching", "evidence_gathering", "draft_ready", "needs_review", "approved", "published"];

const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  discovered: ["researching", "rejected", "archived"],
  researching: ["evidence_gathering", "needs_more_evidence", "rejected", "archived"],
  evidence_gathering: ["draft_ready", "needs_more_evidence", "rejected", "archived"],
  draft_ready: ["needs_review", "evidence_gathering", "rejected", "archived"],
  needs_review: ["approved", "needs_more_evidence", "researching", "disputed", "rejected", "draft_ready"],
  needs_more_evidence: ["researching", "evidence_gathering", "rejected", "archived"],
  approved: ["published", "needs_review", "rejected"],
  published: ["disputed", "archived", "needs_review"],
  disputed: ["needs_review", "researching", "published", "archived"],
  rejected: ["discovered", "archived"],
  archived: ["discovered"],
};

export function allowedTransitions(from: CaseStatus): CaseStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return from === to || allowedTransitions(from).includes(to);
}

/** Statuses only an editor or admin may move a case into (the database enforces this too). */
export const EDITOR_ONLY_TARGETS: CaseStatus[] = ["approved", "published"];

export const CASE_TYPES = [
  "prediction_aged_poorly", "prediction_aged_well", "did_they_sell", "never_sell", "broken_promise", "kept_promise",
  "changed_position", "followed_own_advice", "other",
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  prediction_aged_poorly: "Aged poorly",
  prediction_aged_well: "Aged well",
  did_they_sell: "Did they sell?",
  never_sell: "Never Sell",
  broken_promise: "Broken promise",
  kept_promise: "Promise kept",
  changed_position: "Changed position",
  followed_own_advice: "Followed own advice?",
  other: "Investigation",
};

export const CONFIDENCE_LEVELS = ["verified", "strong", "unconfirmed", "disputed"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const CONFIDENCE: Record<Confidence, { label: string; short: string; description: string; publishable: boolean }> = {
  verified: {
    label: "Verified",
    short: "A primary or official record directly supports the claim.",
    description: "A primary or official record — a filing, an original broadcast, an on-chain transaction, an official price series — directly supports the specific factual claim.",
    publishable: true,
  },
  strong: {
    label: "Strong",
    short: "Multiple reliable, independent sources corroborate the claim.",
    description: "Multiple reliable and independent sources corroborate the claim, but no single primary record establishes it on its own.",
    publishable: true,
  },
  unconfirmed: {
    label: "Unconfirmed",
    short: "Evidence is incomplete. Not published as fact.",
    description: "The evidence is incomplete. Aged Takes does not publish an unconfirmed claim as an established fact; such cases stay in research.",
    publishable: false,
  },
  disputed: {
    label: "Disputed",
    short: "Credible evidence or interpretations materially conflict.",
    description: "Credible evidence or reasonable interpretations materially conflict. Published cases marked Disputed present each side and the conflict itself.",
    publishable: true,
  },
};

export const STATEMENT_TYPES = ["opinion", "prediction", "explicit_commitment", "documented_action", "factual_claim", "other"] as const;
export type StatementType = (typeof STATEMENT_TYPES)[number];
export const STATEMENT_TYPE_LABELS: Record<StatementType, string> = {
  opinion: "Opinion",
  prediction: "Prediction",
  explicit_commitment: "Explicit commitment",
  documented_action: "Documented action",
  factual_claim: "Factual claim",
  other: "Statement",
};

export const PREDICTION_STATUSES = ["open", "resolved_correct", "resolved_incorrect", "partially_correct", "unscorable", "disputed"] as const;
export type PredictionStatus = (typeof PREDICTION_STATUSES)[number];
export const PREDICTION_STATUS_LABELS: Record<PredictionStatus, string> = {
  open: "Open",
  resolved_correct: "Resolved correct",
  resolved_incorrect: "Resolved incorrect",
  partially_correct: "Partially correct",
  unscorable: "Unscorable",
  disputed: "Disputed",
};

export const EVIDENCE_ROLES = ["original_statement", "outcome", "supporting", "contradicting", "context", "disclosure", "market_data", "subject_response"] as const;
export type EvidenceRole = (typeof EVIDENCE_ROLES)[number];
export const EVIDENCE_ROLE_LABELS: Record<EvidenceRole, string> = {
  original_statement: "Original statement",
  outcome: "Outcome",
  supporting: "Supporting",
  contradicting: "Contradicting",
  context: "Context",
  disclosure: "Disclosure",
  market_data: "Market data",
  subject_response: "Subject response",
};

export const OUTREACH_STATUSES = ["not_contacted", "contact_attempted", "awaiting_response", "responded", "declined_to_comment", "no_response"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];
export const OUTREACH_LABELS: Record<OutreachStatus, string> = {
  not_contacted: "Not yet contacted",
  contact_attempted: "Contact attempted",
  awaiting_response: "Awaiting response",
  responded: "Responded",
  declined_to_comment: "Declined to comment",
  no_response: "Did not respond",
};

export const SOURCE_TYPES = [
  "video", "podcast", "social_post", "article", "interview", "official_filing", "congressional_disclosure", "senate_disclosure",
  "sec_filing", "earnings_call", "press_release", "official_website", "newsletter", "market_data", "blockchain_record",
  "court_record", "book", "other",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export const TRANSACTION_OWNER_LABELS: Record<string, string> = {
  self: "The person",
  spouse: "Spouse",
  dependent_child: "Dependent child",
  joint: "Joint",
  entity: "An entity they control or represent",
  institution: "An institution, not personally",
  unknown: "Owner not stated",
};

export const WALLET_EVENT_LABELS: Record<string, { label: string; caveat?: string }> = {
  transfer_in: { label: "Transfer in" },
  transfer_out: { label: "Transfer out", caveat: "A transfer is not a sale." },
  exchange_deposit: { label: "Exchange deposit", caveat: "A deposit to an exchange is not, by itself, a sale." },
  exchange_withdrawal: { label: "Exchange withdrawal" },
  swap: { label: "Swap" },
  contract_interaction: { label: "Contract interaction" },
  other: { label: "Other" },
};

export const WALLET_ATTRIBUTION_LABELS: Record<string, { label: string; public: boolean }> = {
  unattributed: { label: "Not attributed to anyone", public: false },
  reported_by_third_party: { label: "Attributed by a third party only — not proof of ownership", public: false },
  claimed_by_subject: { label: "Identified by the person themselves", public: true },
  independently_verified: { label: "Ownership independently verified", public: true },
};
