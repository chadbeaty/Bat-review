-- Product Radar: core schema.
-- Principles: UUID keys, timestamps everywhere, history is appended (snapshots, score history) instead of
-- overwritten, and every factual observation carries a source URL and the time it was observed.
-- Unknown values are stored as NULL, never as zero: "no data" must never read as "no competition".

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------------------------------------
-- People who can use the app. Mirrors auth.users; only rows here can see any data (see security migration).
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  receives_alerts boolean not null default true,
  receives_digest boolean not null default true,
  created_at timestamptz not null default now()
);

-- Every data connector the system knows about (YouTube, TikTok, Reddit, ...) and any extra source URLs.
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('youtube', 'tiktok', 'instagram', 'reddit', 'amazon', 'aliexpress', 'temu', 'google_shopping', 'google_trends', 'manual', 'web')),
  name text not null,
  url text,
  status text not null default 'active' check (status in ('active', 'paused', 'unavailable', 'planned')),
  config jsonb not null default '{}'::jsonb,
  notes text,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sources_kind_url_key on public.sources (kind, coalesce(url, ''));

-- Monitored creators. A creator is only polled once its channel identity is verified and it is active.
create table public.creators (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'youtube' check (platform in ('youtube', 'tiktok', 'instagram')),
  display_name text not null,
  handle text,
  channel_id text,
  channel_url text,
  uploads_playlist_id text,
  subscriber_count bigint,
  channel_title text,
  verification_status text not null default 'unresolved'
    check (verification_status in ('verified', 'candidate', 'unresolved', 'rejected')),
  verification_notes text,
  verified_at timestamptz,
  is_active boolean not null default false,
  last_polled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creators_active_needs_verified check (not is_active or (verification_status = 'verified' and channel_id is not null))
);
create unique index creators_platform_channel_key on public.creators (platform, channel_id) where channel_id is not null;

-- Videos/posts collected from creators or submitted by hand. Raw facts only.
create table public.creator_videos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.creators (id) on delete set null,
  source_id uuid references public.sources (id) on delete set null,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram', 'reddit', 'web')),
  external_id text not null,
  url text not null,
  title text,
  description text,
  tags text[] not null default '{}',
  thumbnail_url text,
  author_name text,
  published_at timestamptz,
  duration_seconds integer,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  stats_observed_at timestamptz,
  -- YouTube only releases caption files to people who can edit the video, so third-party transcripts are
  -- not legitimately available through the API. Stays false unless a permitted source provides one.
  transcript_available boolean not null default false,
  owner_notes text,
  analysis_status text not null default 'pending' check (analysis_status in ('pending', 'skipped', 'analyzed', 'failed')),
  analysis_attempts integer not null default 0,
  analysis_error text,
  analyzed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  unique (platform, external_id)
);
create index creator_videos_creator_idx on public.creator_videos (creator_id, published_at desc);
create index creator_videos_pending_idx on public.creator_videos (analysis_status, first_seen_at) where analysis_status in ('pending', 'failed');

-- Engagement history for each video, so engagement growth can be measured instead of guessed.
create table public.video_stat_snapshots (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.creator_videos (id) on delete cascade,
  observed_at timestamptz not null default now(),
  view_count bigint,
  like_count bigint,
  comment_count bigint
);
create index video_stat_snapshots_video_idx on public.video_stat_snapshots (video_id, observed_at);

-- One row per underlying product (the canonical record that different names are grouped under).
create table public.products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  slug text not null unique,
  function_summary text,
  description text,
  category text,
  physical_attributes text[] not null default '{}',
  visual_description text,
  problem_solved text,
  status text not null default 'new' check (status in ('new', 'tracking', 'saturated', 'not_a_product', 'merged')),
  status_changed_at timestamptz not null default now(),
  merged_into uuid references public.products (id),
  first_observed_at timestamptz,
  first_observed_platform text,
  first_observed_creator_id uuid references public.creators (id) on delete set null,
  first_observed_url text,
  primary_image_url text,
  -- Estimates (from the AI assessment, clearly labelled in the UI). NULL = unknown.
  est_supplier_cost_low numeric(10, 2),
  est_supplier_cost_high numeric(10, 2),
  est_shipping_cost numeric(10, 2),
  suggested_price_low numeric(10, 2),
  suggested_price_high numeric(10, 2),
  price_basis text,
  ai_recommendation text,
  ai_verdict text check (ai_verdict in ('test_now', 'watch', 'avoid', 'insufficient_data')),
  ai_risks text[] not null default '{}',
  ai_recommendation_at timestamptz,
  -- AI judgements (0-100) from the latest assessment, with the reasons given.
  ai_organic_score numeric(5, 1),
  ai_problem_score numeric(5, 1),
  ai_reasons jsonb not null default '{}'::jsonb,
  assessed_at timestamptz,
  assessment_mentions integer,
  latest_score numeric(5, 1),
  latest_confidence text check (latest_confidence in ('high', 'medium', 'low')),
  latest_acceleration numeric(8, 2),
  latest_competition numeric(5, 1),
  latest_creators integer,
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_merged_has_target check ((status = 'merged') = (merged_into is not null))
);
create index products_status_score_idx on public.products (status, latest_score desc nulls last);
create index products_created_idx on public.products (created_at desc);

create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  alias text not null,
  alias_normalized text not null,
  source text not null default 'ai' check (source in ('ai', 'manual', 'mention', 'search_term')),
  confidence numeric(4, 3),
  created_at timestamptz not null default now(),
  unique (product_id, alias_normalized)
);
create index product_aliases_trgm_idx on public.product_aliases using gin (alias_normalized extensions.gin_trgm_ops);

-- Every time a product is seen somewhere. The evidence trail behind every number on the dashboard.
create table public.product_mentions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete cascade,
  video_id uuid references public.creator_videos (id) on delete cascade,
  creator_id uuid references public.creators (id) on delete set null,
  source_id uuid references public.sources (id) on delete set null,
  platform text not null,
  url text not null,
  author_name text,
  mentioned_name text not null,
  evidence_location text check (evidence_location in ('title', 'description', 'tags', 'thumbnail', 'owner_notes', 'page')),
  evidence_quote text,
  mention_type text not null default 'unknown'
    check (mention_type in ('organic_demo', 'affiliate', 'storefront', 'paid_ad', 'education', 'discussion', 'unknown')),
  -- When the post itself was published (falls back to when we first saw it).
  observed_at timestamptz not null,
  detected_at timestamptz not null default now(),
  match_method text not null default 'new' check (match_method in ('new', 'alias', 'ai', 'manual')),
  match_confidence numeric(4, 3),
  extraction jsonb not null default '{}'::jsonb,
  ai_run_id uuid
);
create index product_mentions_product_idx on public.product_mentions (product_id, observed_at desc);
create index product_mentions_video_idx on public.product_mentions (video_id);

-- Low-confidence matches waiting for a person to decide ("are these the same product?").
create table public.match_suggestions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  candidate_product_id uuid not null references public.products (id) on delete cascade,
  confidence numeric(4, 3),
  reason text,
  status text not null default 'open' check (status in ('open', 'merged', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (product_id, candidate_product_id)
);

-- Point-in-time trend metrics. Appended every scoring cycle so growth is measured over real history.
create table public.trend_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  captured_at timestamptz not null default now(),
  mentions_24h integer not null,
  mentions_72h integer not null,
  mentions_7d integer not null,
  mentions_prev_7d integer not null,
  mentions_total integer not null,
  unique_creators_7d integer not null,
  unique_creators_total integer not null,
  unique_platforms integer not null,
  views_7d bigint,
  engagement_growth numeric(10, 3),
  search_interest numeric(6, 2),
  search_interest_growth numeric(10, 3),
  sellers_detected integer,
  growth_rate numeric(10, 3),
  acceleration numeric(10, 3),
  age_days numeric(8, 2),
  coverage jsonb not null default '{}'::jsonb
);
create index trend_snapshots_product_idx on public.trend_snapshots (product_id, captured_at desc);

-- Competition estimates per source with a confidence level. Never presented as an exact market count.
create table public.competition_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  captured_at timestamptz not null default now(),
  source text not null,
  method text not null,
  unique_sellers integer,
  unique_creators integer,
  promo_videos integer,
  new_sellers_7d integer,
  earliest_seller_at timestamptz,
  names_in_use integer,
  organic_creators integer,
  affiliates integer,
  storefronts integer,
  paid_ads integer,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  notes text,
  evidence jsonb not null default '[]'::jsonb
);
create index competition_snapshots_product_idx on public.competition_snapshots (product_id, captured_at desc);

create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  platform text not null,
  url text,
  normalized_key text not null unique,
  seller_type text not null default 'unknown' check (seller_type in ('storefront', 'affiliate', 'creator', 'marketplace_seller', 'paid_advertiser', 'unknown')),
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.seller_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  listing_title text,
  evidence_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (seller_id, product_id)
);
create index seller_products_product_idx on public.seller_products (product_id);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url text not null,
  source_url text,
  kind text not null default 'thumbnail' check (kind in ('thumbnail', 'listing', 'manual')),
  mention_id uuid references public.product_mentions (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (product_id, url)
);

-- Score history: one row per scoring run, each category shown separately.
create table public.opportunity_scores (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  scored_at timestamptz not null default now(),
  overall numeric(5, 1) not null,
  early_momentum numeric(5, 1),
  demand_acceleration numeric(5, 1),
  competition numeric(5, 1),
  organic_video_potential numeric(5, 1),
  problem_solving numeric(5, 1),
  profit_potential numeric(5, 1),
  weights jsonb not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  missing text[] not null default '{}',
  reasons jsonb not null default '{}'::jsonb,
  trend_snapshot_id uuid references public.trend_snapshots (id) on delete set null,
  version text not null
);
create index opportunity_scores_product_idx on public.opportunity_scores (product_id, scored_at desc);

create table public.video_ideas (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  generated_at timestamptz not null default now(),
  ideas jsonb not null,
  ai_run_id uuid,
  is_current boolean not null default true
);
create index video_ideas_product_idx on public.video_ideas (product_id, generated_at desc);

create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  status text not null default 'saved' check (status in ('saved', 'following', 'testing', 'tested', 'launched', 'rejected')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- Alerts that went out. The fingerprint stops repeats unless something material changes.
create table public.product_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete cascade,
  alert_type text not null check (alert_type in ('score_80', 'high_momentum', 'multi_source', 'low_competition_strong_demand', 'saturated', 'daily_digest')),
  fingerprint text not null,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'not_configured')),
  email_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (alert_type, fingerprint)
);
create index product_alerts_created_idx on public.product_alerts (created_at desc);

-- Every scheduled or manual job. Also the lock that stops two copies of the same job running at once.
create table public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed', 'skipped')),
  triggered_by text not null default 'cron',
  lock_key text,
  source_id uuid references public.sources (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_found integer not null default 0,
  items_new integer not null default 0,
  items_failed integer not null default 0,
  error_message text,
  details jsonb not null default '{}'::jsonb
);
create unique index ingestion_jobs_one_running on public.ingestion_jobs (lock_key) where status = 'running' and lock_key is not null;
create index ingestion_jobs_started_idx on public.ingestion_jobs (started_at desc);

-- Corrections, test results and sales records from the owner. Feeds later adaptive scoring (Phase 5).
create table public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  kind text not null check (kind in ('test_result', 'sales', 'match_correction', 'score_feedback', 'note')),
  period_start date,
  period_end date,
  ad_spend numeric(12, 2),
  revenue numeric(12, 2),
  orders integer,
  units_cost numeric(12, 2),
  video_views bigint,
  verdict text check (verdict in ('winner', 'promising', 'loser', 'inconclusive')),
  notes text,
  created_at timestamptz not null default now()
);
create index user_feedback_product_idx on public.user_feedback (product_id, created_at desc);

-- Manual URL submissions (TikTok, YouTube, product pages ...).
create table public.manual_submissions (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  platform text not null,
  notes text,
  status text not null default 'received' check (status in ('received', 'processing', 'analyzed', 'failed', 'stored')),
  result text,
  video_id uuid references public.creator_videos (id) on delete set null,
  submitted_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Claude API usage: tokens and estimated cost per call (for the cost dashboard and the daily budget guard).
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  task text not null,
  model text not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'rejected_output')),
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric(10, 5),
  stop_reason text,
  request_id text,
  input_summary text,
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index ai_runs_created_idx on public.ai_runs (created_at desc);

-- Usage of other metered APIs (YouTube quota units, emails sent, ...), one row per call batch.
create table public.api_usage (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  operation text not null,
  units integer not null default 1,
  estimated_cost numeric(10, 5) not null default 0,
  created_at timestamptz not null default now()
);
create index api_usage_provider_idx on public.api_usage (provider, created_at desc);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
