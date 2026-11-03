-- AGED TAKES — editorial content: people, sources, statements, predictions, cases, evidence, transactions.
-- Vocabulary is deliberately not finance-specific ("asset_or_topic", "subject") so the same tables serve
-- politicians, executives, athletes and entertainers later.

create or replace function public.is_slug(p text)
returns boolean
language sql
immutable
as $$
  select p ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(p) between 2 and 120;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Categories and people
-- ---------------------------------------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (public.is_slug(slug)),
  name text not null check (char_length(name) between 2 and 80),
  kind text not null default 'person' check (kind in ('person', 'industry', 'topic')),
  description text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (public.is_slug(slug)),
  biography text check (char_length(biography) <= 4000),
  occupation text check (char_length(occupation) <= 200),
  organization text check (char_length(organization) <= 200),
  image_url text check (image_url is null or image_url ~ '^https://'),
  image_credit text,
  image_license text,
  website_url text check (website_url is null or website_url ~ '^https?://'),
  -- draft: not public. research_candidate: on the internal research list only. active: public. archived: hidden.
  status text not null default 'draft' check (status in ('draft', 'research_candidate', 'active', 'archived')),
  is_demo boolean not null default false,
  follower_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(occupation, '') || ' ' || coalesce(organization, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(biography, '')), 'C')
  ) stored,
  constraint people_image_needs_credit check (image_url is null or image_credit is not null)
);

create index people_status_idx on public.people (status, updated_at desc);
create index people_search_idx on public.people using gin (search);
create index people_name_lower_idx on public.people (lower(name));
create or replace function public.people_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- A follow or unfollow is not an editorial update.
  if (to_jsonb(new) - 'follower_count' - 'updated_at' - 'search') <> (to_jsonb(old) - 'follower_count' - 'updated_at' - 'search') then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger people_updated_at before update on public.people for each row execute function public.people_set_updated_at();

create table public.person_categories (
  person_id uuid not null references public.people (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (person_id, category_id)
);
create index person_categories_category_idx on public.person_categories (category_id);

-- ---------------------------------------------------------------------------------------------------------
-- Evidence sources (provenance for every public claim)
-- ---------------------------------------------------------------------------------------------------------

create table public.evidence_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in (
    'video', 'podcast', 'social_post', 'article', 'interview', 'official_filing', 'congressional_disclosure',
    'senate_disclosure', 'sec_filing', 'earnings_call', 'press_release', 'official_website', 'newsletter',
    'market_data', 'blockchain_record', 'court_record', 'book', 'other')),
  publisher text check (char_length(publisher) <= 200),
  author text check (char_length(author) <= 200),
  title text not null check (char_length(title) between 2 and 400),
  canonical_url text check (canonical_url is null or canonical_url ~ '^https?://'),
  archive_url text check (archive_url is null or archive_url ~ '^https?://'),
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  source_excerpt text check (char_length(source_excerpt) <= 4000),
  content_hash text check (content_hash is null or content_hash ~ '^[a-f0-9]{64}$'),
  reliability_notes text,
  is_primary boolean not null default false,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'disputed', 'retracted', 'unavailable')),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evidence_sources_has_location check (canonical_url is not null or archive_url is not null or source_type in ('book', 'court_record', 'other'))
);

create unique index evidence_sources_canonical_url_key on public.evidence_sources (canonical_url) where canonical_url is not null;
create index evidence_sources_hash_idx on public.evidence_sources (content_hash);
create trigger evidence_sources_updated_at before update on public.evidence_sources for each row execute function public.set_updated_at();

-- Full text captured from a source (transcripts, filings). Staff-only: may be copyrighted. Used to verify that
-- quotations are verbatim and to give the AI agents the exact text rather than letting them recall it.
create table public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  evidence_source_id uuid not null references public.evidence_sources (id) on delete cascade,
  content_text text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  fetched_at timestamptz not null default now(),
  fetched_from text,
  unique (evidence_source_id, content_hash)
);

-- ---------------------------------------------------------------------------------------------------------
-- Statements
-- ---------------------------------------------------------------------------------------------------------

create table public.statements (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  exact_quote text not null check (char_length(exact_quote) between 3 and 4000),
  normalized_summary text check (char_length(normalized_summary) <= 1000),
  statement_type text not null check (statement_type in (
    'opinion', 'prediction', 'explicit_commitment', 'documented_action', 'factual_claim', 'other')),
  asset_or_topic text check (char_length(asset_or_topic) <= 120),
  published_at timestamptz,
  date_precision text not null default 'day' check (date_precision in ('exact', 'day', 'month', 'year', 'unknown')),
  source_id uuid references public.evidence_sources (id) on delete restrict,
  source_timecode text check (source_timecode is null or source_timecode ~ '^\d{1,2}(:\d{2}){1,2}$'),
  context text check (char_length(context) <= 4000),
  conditions text check (char_length(conditions) <= 1000),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'disputed', 'unverifiable')),
  -- Set by code after checking the quotation appears word for word in a stored source snapshot.
  quote_verified_verbatim boolean not null default false,
  visibility text not null default 'internal' check (visibility in ('internal', 'public')),
  extraction_confidence numeric(3, 2) check (extraction_confidence between 0 and 1),
  extraction_notes text,
  ai_run_id uuid,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(exact_quote, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(asset_or_topic, '') || ' ' || coalesce(normalized_summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(context, '')), 'C')
  ) stored,
  -- A statement can only be public once it is verified against a recorded source.
  constraint statements_public_needs_verification check (
    visibility = 'internal' or (verification_status in ('verified', 'disputed') and source_id is not null and published_at is not null))
);

create index statements_person_idx on public.statements (person_id, published_at desc);
create index statements_visibility_idx on public.statements (visibility, statement_type);
create index statements_search_idx on public.statements using gin (search);
create unique index statements_dedupe_key on public.statements (person_id, md5(exact_quote), coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid));
create trigger statements_updated_at before update on public.statements for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------
-- Predictions and outcomes
-- ---------------------------------------------------------------------------------------------------------

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  statement_id uuid not null references public.statements (id) on delete restrict,
  prediction_text text not null check (char_length(prediction_text) between 3 and 2000),
  asset text check (char_length(asset) <= 120),
  asset_identifier text check (char_length(asset_identifier) <= 120),
  target_value numeric,
  target_currency text check (target_currency is null or target_currency ~ '^[A-Z]{3,5}$'),
  target_direction text check (target_direction in ('at_or_above', 'at_or_below', 'event_occurs', 'event_does_not_occur', 'other')),
  prediction_date date not null,
  deadline date,
  resolution_method text check (char_length(resolution_method) <= 2000),
  resolution_criteria text check (char_length(resolution_criteria) <= 2000),
  price_provider text check (price_provider in ('coingecko', 'financial_modeling_prep', 'manual', 'other')),
  timezone text not null default 'UTC',
  status text not null default 'open' check (status in (
    'open', 'resolved_correct', 'resolved_incorrect', 'partially_correct', 'unscorable', 'disputed')),
  outcome text check (char_length(outcome) <= 4000),
  outcome_source_id uuid references public.evidence_sources (id) on delete restrict,
  early_resolution_reason text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'internal' check (visibility in ('internal', 'public')),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(prediction_text, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(asset, '')), 'B')
  ) stored,
  constraint predictions_deadline_after_date check (deadline is null or deadline >= prediction_date),
  constraint predictions_resolved_has_evidence check (
    status in ('open', 'disputed', 'unscorable') or (outcome_source_id is not null and outcome is not null and resolved_at is not null)),
  constraint predictions_unscorable_explained check (status <> 'unscorable' or outcome is not null)
);

create index predictions_person_idx on public.predictions (person_id, prediction_date desc);
create index predictions_status_idx on public.predictions (status, deadline);
create index predictions_search_idx on public.predictions using gin (search);
create trigger predictions_updated_at before update on public.predictions for each row execute function public.set_updated_at();

create table public.prediction_outcomes (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions (id) on delete cascade,
  result text not null check (result in ('correct', 'incorrect', 'partially_correct', 'unscorable', 'disputed', 'not_yet_resolvable')),
  observed_value numeric,
  observed_currency text,
  price_provider text,
  asset_identifier text,
  timezone text not null default 'UTC',
  observation_time timestamptz,
  methodology text not null check (char_length(methodology) between 5 and 4000),
  original_target text,
  notes text,
  evidence_source_id uuid references public.evidence_sources (id) on delete restrict,
  proposed_by text not null default 'editor' check (proposed_by in ('editor', 'ai', 'system')),
  ai_run_id uuid,
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected')),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index prediction_outcomes_prediction_idx on public.prediction_outcomes (prediction_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------------
-- Cases (investigations)
-- ---------------------------------------------------------------------------------------------------------

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (public.is_slug(slug)),
  person_id uuid not null references public.people (id) on delete restrict,
  primary_statement_id uuid references public.statements (id) on delete set null,
  prediction_id uuid references public.predictions (id) on delete set null,
  title text not null check (char_length(title) between 5 and 200),
  summary text check (char_length(summary) <= 1200),
  article_body text check (char_length(article_body) <= 60000),
  what_happened text check (char_length(what_happened) <= 8000),
  limitations text check (char_length(limitations) <= 8000),
  case_type text not null check (case_type in (
    'prediction_aged_poorly', 'prediction_aged_well', 'did_they_sell', 'never_sell', 'broken_promise',
    'kept_promise', 'changed_position', 'followed_own_advice', 'other')),
  status text not null default 'discovered' check (status in (
    'discovered', 'researching', 'evidence_gathering', 'draft_ready', 'needs_review', 'approved', 'published',
    'rejected', 'needs_more_evidence', 'disputed', 'archived')),
  evidence_confidence text check (evidence_confidence in ('verified', 'strong', 'unconfirmed', 'disputed')),
  editorial_conclusion text check (char_length(editorial_conclusion) <= 4000),
  origin text not null default 'editor' check (origin in ('editor', 'ai', 'submission')),
  ai_generated boolean not null default false,
  ai_notes jsonb not null default '{}'::jsonb,
  -- Defamation-risk checklist. Every item must be true before a case can be approved.
  legal_review jsonb not null default '{}'::jsonb,
  legal_reviewed_by uuid references auth.users (id) on delete set null,
  legal_reviewed_at timestamptz,
  is_sponsored boolean not null default false,
  sponsor_disclosure text,
  methodology_version text,
  social_headline text check (char_length(social_headline) <= 200),
  social_post text check (char_length(social_post) <= 600),
  newsletter_summary text check (char_length(newsletter_summary) <= 1200),
  seo_description text check (char_length(seo_description) <= 300),
  social_graphic_text text check (char_length(social_graphic_text) <= 200),
  is_demo boolean not null default false,
  published_at timestamptz,
  last_updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(article_body, '')), 'C')
  ) stored,
  constraint cases_sponsor_disclosed check (not is_sponsored or sponsor_disclosure is not null),
  constraint cases_published_has_date check (status <> 'published' or (published_at is not null and (approved_by is not null or is_demo)))
);

create index cases_status_idx on public.cases (status, published_at desc);
create index cases_person_idx on public.cases (person_id, published_at desc);
create index cases_type_idx on public.cases (case_type, published_at desc);
create index cases_search_idx on public.cases using gin (search);
create trigger cases_updated_at before update on public.cases for each row execute function public.set_updated_at();

create table public.case_evidence (
  case_id uuid not null references public.cases (id) on delete cascade,
  evidence_source_id uuid not null references public.evidence_sources (id) on delete restrict,
  evidence_role text not null check (evidence_role in (
    'original_statement', 'outcome', 'supporting', 'contradicting', 'context', 'disclosure', 'market_data', 'subject_response')),
  notes text,
  -- Evidence assessment, written by an editor or proposed by the evidence agent.
  classification text check (classification in ('verified', 'strong', 'unconfirmed', 'disputed')),
  what_it_proves text,
  what_it_does_not_prove text,
  limitations text,
  identity_established boolean,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  primary key (case_id, evidence_source_id, evidence_role)
);
create index case_evidence_source_idx on public.case_evidence (evidence_source_id);

create table public.case_timeline_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  occurred_at timestamptz not null,
  date_precision text not null default 'day' check (date_precision in ('exact', 'day', 'month', 'year')),
  label text not null check (char_length(label) between 2 and 200),
  description text check (char_length(description) <= 2000),
  kind text not null default 'event' check (kind in ('statement', 'action', 'market', 'disclosure', 'event', 'response', 'correction')),
  evidence_source_id uuid references public.evidence_sources (id) on delete set null,
  created_at timestamptz not null default now()
);
create index case_timeline_case_idx on public.case_timeline_events (case_id, occurred_at);

create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases (id) on delete cascade,
  prediction_id uuid references public.predictions (id) on delete cascade,
  statement_id uuid references public.statements (id) on delete cascade,
  field text,
  previous_text text,
  corrected_text text,
  reason text not null check (char_length(reason) between 5 and 2000),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint corrections_has_target check (num_nonnulls(case_id, prediction_id, statement_id) = 1)
);
create index corrections_created_idx on public.corrections (created_at desc);

create table public.subject_responses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  outreach_status text not null check (outreach_status in (
    'not_contacted', 'contact_attempted', 'awaiting_response', 'responded', 'declined_to_comment', 'no_response')),
  contact_method text check (contact_method in ('email', 'social_dm', 'representative', 'press_office', 'phone', 'other')),
  contacted_at timestamptz,
  response_deadline timestamptz,
  response_text text check (char_length(response_text) <= 8000),
  response_source text,
  received_at timestamptz,
  internal_notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint subject_responses_response_has_text check (outreach_status <> 'responded' or response_text is not null)
);
create index subject_responses_case_idx on public.subject_responses (case_id, created_at desc);

create table public.editorial_reviews (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  reviewer_id uuid references auth.users (id) on delete set null,
  decision text not null check (decision in ('comment', 'request_research', 'request_changes', 'needs_more_evidence', 'reject', 'approve', 'publish', 'unpublish', 'status_change')),
  from_status text,
  to_status text,
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now()
);
create index editorial_reviews_case_idx on public.editorial_reviews (case_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------------
-- Documented financial activity. Ownership is recorded exactly as the source states it — a spouse's trade,
-- a fund's holding and a wallet transfer are never collapsed into "they sold".
-- ---------------------------------------------------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  asset text not null check (char_length(asset) <= 120),
  asset_identifier text,
  transaction_type text not null check (transaction_type in (
    'purchase', 'sale', 'partial_sale', 'exchange', 'gift', 'option_exercise', 'transfer', 'other')),
  owner text not null default 'unknown' check (owner in ('self', 'spouse', 'dependent_child', 'joint', 'entity', 'institution', 'unknown')),
  quantity numeric,
  amount numeric,
  amount_low numeric,
  amount_high numeric,
  currency text check (currency is null or currency ~ '^[A-Z]{3,5}$'),
  transaction_date date,
  disclosed_at date,
  filing_reference text,
  source_id uuid not null references public.evidence_sources (id) on delete restrict,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'disputed')),
  notes text,
  visibility text not null default 'internal' check (visibility in ('internal', 'public')),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_range_order check (amount_low is null or amount_high is null or amount_low <= amount_high),
  constraint transactions_public_verified check (visibility = 'internal' or verification_status = 'verified')
);
create index transactions_person_idx on public.transactions (person_id, transaction_date desc);
create trigger transactions_updated_at before update on public.transactions for each row execute function public.set_updated_at();

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  chain text not null check (char_length(chain) between 2 and 40),
  address text not null check (char_length(address) between 10 and 128),
  label text,
  attributed_person_id uuid references public.people (id) on delete set null,
  -- A third-party label is not proof of ownership. Only 'claimed_by_subject' or 'independently_verified'
  -- may be described publicly as the person's wallet.
  attribution_status text not null default 'unattributed' check (attribution_status in (
    'unattributed', 'reported_by_third_party', 'claimed_by_subject', 'independently_verified')),
  attribution_source_id uuid references public.evidence_sources (id) on delete set null,
  notes text,
  visibility text not null default 'internal' check (visibility in ('internal', 'public')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain, address),
  constraint wallets_attribution_sourced check (attribution_status = 'unattributed' or attribution_source_id is not null)
);
create trigger wallets_updated_at before update on public.wallets for each row execute function public.set_updated_at();

create table public.wallet_events (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  tx_hash text not null,
  event_type text not null check (event_type in (
    'transfer_in', 'transfer_out', 'exchange_deposit', 'exchange_withdrawal', 'swap', 'contract_interaction', 'other')),
  asset text not null,
  amount numeric,
  counterparty text,
  counterparty_label text,
  occurred_at timestamptz not null,
  source_id uuid references public.evidence_sources (id) on delete set null,
  notes text,
  visibility text not null default 'internal' check (visibility in ('internal', 'public')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (wallet_id, tx_hash, event_type, asset)
);
create index wallet_events_wallet_idx on public.wallet_events (wallet_id, occurred_at desc);

-- Published methodology versions ("record methodology version changes").
create table public.methodology_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  effective_at date not null,
  summary text not null,
  created_at timestamptz not null default now()
);
insert into public.methodology_versions (version, effective_at, summary) values
  ('1.0', date '2026-11-03', 'Initial methodology: four evidence classifications (Verified, Strong, Unconfirmed, Disputed); predictions scored only after their documented resolution criteria and deadline; separate counts for prediction accuracy and documented contradictions; no composite reputation score.');

-- Readers following people (requires a reader account).
create table public.user_follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, person_id)
);
create index user_follows_person_idx on public.user_follows (person_id);

create or replace function public.sync_follower_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.people set follower_count = follower_count + 1 where id = new.person_id;
  elsif tg_op = 'DELETE' then
    update public.people set follower_count = greatest(follower_count - 1, 0) where id = old.person_id;
  end if;
  return null;
end;
$$;
create trigger user_follows_count after insert or delete on public.user_follows
  for each row execute function public.sync_follower_count();
