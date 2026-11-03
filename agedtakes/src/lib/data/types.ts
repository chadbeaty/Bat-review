// Shapes returned by the public read API (supabase/migrations/*_public_api.sql).

import type { CaseStatus, CaseType, Confidence, PredictionStatus, StatementType, OutreachStatus, EvidenceRole } from "@/lib/editorial";

export type Source = {
  id: string;
  source_type: string;
  publisher: string | null;
  author: string | null;
  title: string;
  canonical_url: string | null;
  archive_url: string | null;
  published_at: string | null;
  collected_at: string;
  source_excerpt: string | null;
  is_primary: boolean;
  verification_status: string;
  reliability_notes: string | null;
  is_demo: boolean;
};

export type Category = { slug: string; name: string; kind: "person" | "industry" | "topic" };

export type PersonCard = {
  id: string;
  name: string;
  slug: string;
  occupation: string | null;
  organization: string | null;
  image_url: string | null;
  image_credit: string | null;
  is_demo: boolean;
  follower_count: number;
  updated_at: string;
  categories: Category[];
  cases_published: number;
};

export type CaseCard = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  case_type: CaseType;
  status: CaseStatus;
  evidence_confidence: Confidence | null;
  published_at: string;
  last_updated_at: string;
  is_demo: boolean;
  is_sponsored: boolean;
  social_graphic_text: string | null;
  person: { name: string; slug: string; image_url: string | null; occupation: string | null } | null;
  prediction_status: PredictionStatus | null;
  quote: string | null;
};

export type Statement = {
  id: string;
  exact_quote: string;
  normalized_summary: string | null;
  statement_type: StatementType;
  asset_or_topic: string | null;
  published_at: string | null;
  date_precision: string;
  source_timecode: string | null;
  context: string | null;
  conditions: string | null;
  verification_status: string;
  quote_verified_verbatim: boolean;
  is_demo: boolean;
  source: Source | null;
  person: { name: string; slug: string } | null;
  cases: { slug: string; title: string }[];
};

export type Prediction = {
  id: string;
  prediction_text: string;
  asset: string | null;
  target_value: number | null;
  target_currency: string | null;
  target_direction: string | null;
  prediction_date: string;
  deadline: string | null;
  resolution_method: string | null;
  resolution_criteria: string | null;
  price_provider: string | null;
  timezone: string;
  status: PredictionStatus;
  outcome: string | null;
  early_resolution_reason: string | null;
  resolved_at: string | null;
  is_demo: boolean;
  updated_at: string;
  person: { name: string; slug: string; image_url: string | null } | null;
  statement: { exact_quote: string; published_at: string | null; source_timecode: string | null; source: Source | null } | null;
  outcome_source: Source | null;
  observation: {
    observed_value: number | null;
    observed_currency: string | null;
    price_provider: string | null;
    asset_identifier: string | null;
    timezone: string;
    observation_time: string | null;
    methodology: string;
    original_target: string | null;
  } | null;
  case_slug: string | null;
};

export type PersonStatsRow = Record<string, number | string | null>;

export type Transaction = {
  id: string;
  asset: string;
  transaction_type: string;
  owner: string;
  quantity: number | null;
  amount: number | null;
  amount_low: number | null;
  amount_high: number | null;
  currency: string | null;
  transaction_date: string | null;
  disclosed_at: string | null;
  filing_reference: string | null;
  notes: string | null;
  is_demo: boolean;
  source: Source | null;
};

export type Wallet = {
  id: string;
  chain: string;
  address: string;
  label: string | null;
  attribution_status: string;
  notes: string | null;
  attribution_source: Source | null;
  events: {
    tx_hash: string;
    event_type: string;
    asset: string;
    amount: number | null;
    counterparty_label: string | null;
    occurred_at: string;
    notes: string | null;
    source: Source | null;
  }[];
};

export type PersonPage = {
  person: PersonCard & { biography: string | null; website_url: string | null; image_license: string | null };
  stats: PersonStatsRow | null;
  statements: Statement[];
  predictions: Prediction[];
  cases: CaseCard[];
  transactions: Transaction[];
  wallets: Wallet[];
};

export type CasePage = {
  case: {
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    article_body: string | null;
    what_happened: string | null;
    limitations: string | null;
    case_type: CaseType;
    status: CaseStatus;
    evidence_confidence: Confidence | null;
    editorial_conclusion: string | null;
    is_sponsored: boolean;
    sponsor_disclosure: string | null;
    methodology_version: string | null;
    social_headline: string | null;
    social_post: string | null;
    seo_description: string | null;
    social_graphic_text: string | null;
    is_demo: boolean;
    ai_generated: boolean;
    published_at: string;
    last_updated_at: string;
  };
  person: PersonCard;
  statement: Statement | null;
  prediction: Prediction | null;
  evidence: {
    role: EvidenceRole;
    classification: Confidence | null;
    notes: string | null;
    what_it_proves: string | null;
    what_it_does_not_prove: string | null;
    limitations: string | null;
    identity_established: boolean | null;
    source: Source;
  }[];
  timeline: { occurred_at: string; date_precision: string; label: string; description: string | null; kind: string; source: Source | null }[];
  responses: {
    outreach_status: OutreachStatus;
    contact_method: string | null;
    contacted_at: string | null;
    response_deadline: string | null;
    response_text: string | null;
    response_source: string | null;
    received_at: string | null;
  }[];
  corrections: { field: string | null; previous_text: string | null; corrected_text: string | null; reason: string; created_at: string }[];
  related: CaseCard[];
};

export type HomePage = {
  latest: CaseCard[];
  aged_poorly: CaseCard[];
  aged_well: CaseCard[];
  did_they_sell: CaseCard[];
  never_sell: Statement[];
  resolved: Prediction[];
  trending: PersonCard[];
  has_demo: boolean;
  counts: { people: number; cases: number; predictions: number };
};

export type Paged<T> = { total: number; items: T[] };

export type CorrectionItem = {
  id: string;
  field: string | null;
  previous_text: string | null;
  corrected_text: string | null;
  reason: string;
  created_at: string;
  case: { slug: string; title: string; is_demo: boolean } | null;
  prediction: { text: string; person_slug: string; person_name: string } | null;
  statement: { quote: string; person_slug: string; person_name: string } | null;
};

export type Filters = {
  categories: Category[];
  people: { slug: string; name: string }[];
  methodology: { version: string; effective_at: string; summary: string }[];
  settings: Record<string, unknown>;
};

export type SearchResult = {
  kind: "person" | "case" | "statement" | "prediction";
  id: string;
  slug: string;
  title: string;
  snippet: string;
  person_name: string;
  person_slug: string;
  occurred_at: string | null;
  rank: number;
};
