-- AGED TAKES — operations: monitored sources, discovered items, research and ingestion jobs, AI usage,
-- reader submissions, newsletter.

-- Sources the Source Monitor checks on a schedule (an RSS feed, a YouTube channel, an SEC filer, ...).
create table public.monitored_sources (
  id uuid primary key default gen_random_uuid(),
  connector text not null check (connector in (
    'rss', 'youtube', 'sec_edgar', 'house_disclosures', 'senate_disclosures', 'coingecko', 'fmp', 'manual_url')),
  label text not null check (char_length(label) between 2 and 200),
  config jsonb not null default '{}'::jsonb,
  person_id uuid references public.people (id) on delete set null,
  enabled boolean not null default true,
  check_interval_hours integer not null default 24 check (check_interval_hours between 1 and 720),
  last_checked_at timestamptz,
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger monitored_sources_updated_at before update on public.monitored_sources for each row execute function public.set_updated_at();

-- Items a connector found. Deduplicated per connector by external id.
create table public.source_items (
  id uuid primary key default gen_random_uuid(),
  monitored_source_id uuid references public.monitored_sources (id) on delete set null,
  connector text not null,
  external_id text not null,
  url text check (url is null or url ~ '^https?://'),
  title text,
  author text,
  published_at timestamptz,
  content_text text,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  person_id uuid references public.people (id) on delete set null,
  evidence_source_id uuid references public.evidence_sources (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'queued', 'processed', 'ignored', 'failed')),
  created_at timestamptz not null default now(),
  unique (connector, external_id)
);
create index source_items_status_idx on public.source_items (status, created_at);

create table public.research_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in (
    'monitor_sources', 'extract_statements', 'match_history', 'assess_evidence', 'draft_case',
    'resolve_prediction', 'distribution')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  priority integer not null default 100,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  -- Identical work is queued once (e.g. 'extract:<source_item_id>').
  dedupe_key text,
  attempts integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  person_id uuid references public.people (id) on delete set null,
  case_id uuid references public.cases (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index research_jobs_dedupe_key on public.research_jobs (dedupe_key) where dedupe_key is not null and status in ('queued', 'running');
create index research_jobs_queue_idx on public.research_jobs (status, run_after, priority);
create trigger research_jobs_updated_at before update on public.research_jobs for each row execute function public.set_updated_at();

-- Claims the next runnable jobs for a worker (skip locked rows so overlapping cron runs never double-process).
-- Jobs stuck in 'running' for over 15 minutes (a timed-out serverless function) are reclaimed.
create or replace function public.claim_research_jobs(p_worker text, p_limit integer default 3, p_types text[] default null)
returns setof public.research_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.research_jobs set status = 'queued', locked_at = null, locked_by = null
  where status = 'running' and locked_at < now() - interval '15 minutes';

  return query
  update public.research_jobs j set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
  where j.id in (
    select id from public.research_jobs
    where status = 'queued' and run_after <= now() and attempts < max_attempts
      and (p_types is null or job_type = any (p_types))
    order by priority, run_after
    limit p_limit
    for update skip locked
  )
  returning j.*;
end;
$$;

-- Records a job failure: retries with exponential backoff until max_attempts, then marks it failed.
create or replace function public.fail_research_job(p_job uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.research_jobs
  set last_error = left(p_error, 2000),
      locked_at = null,
      locked_by = null,
      status = case when attempts >= max_attempts then 'failed' else 'queued' end,
      run_after = now() + make_interval(mins => (power(4, least(attempts, 5)))::int),
      finished_at = case when attempts >= max_attempts then now() else null end
  where id = p_job;
end;
$$;

create table public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  connector text not null,
  monitored_source_id uuid references public.monitored_sources (id) on delete set null,
  triggered_by text not null default 'cron' check (triggered_by in ('cron', 'manual')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'skipped')),
  items_found integer not null default 0,
  items_new integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ingestion_jobs_started_idx on public.ingestion_jobs (started_at desc);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  agent text not null,
  model text not null,
  prompt_version text not null,
  research_job_id uuid references public.research_jobs (id) on delete set null,
  case_id uuid references public.cases (id) on delete set null,
  input_summary text,
  output_summary text,
  output jsonb,
  token_usage jsonb not null default '{}'::jsonb,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost numeric(10, 5) not null default 0,
  duration_ms integer,
  stop_reason text,
  request_id text,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'rejected_output')),
  error_message text,
  created_at timestamptz not null default now()
);
create index ai_runs_created_idx on public.ai_runs (created_at desc);
create index ai_runs_agent_idx on public.ai_runs (agent, created_at desc);

alter table public.statements add constraint statements_ai_run_fk foreign key (ai_run_id) references public.ai_runs (id) on delete set null;
alter table public.prediction_outcomes add constraint prediction_outcomes_ai_run_fk foreign key (ai_run_id) references public.ai_runs (id) on delete set null;

-- Estimated AI spend today (UTC), for the daily budget guard.
create or replace function public.ai_spend_today()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(estimated_cost), 0) from public.ai_runs where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  person_name text not null check (char_length(person_name) between 2 and 160),
  statement_text text not null check (char_length(statement_text) between 5 and 4000),
  statement_date text check (char_length(statement_date) <= 40),
  source_url text not null check (source_url ~ '^https?://' and char_length(source_url) <= 2000),
  supporting_urls text[] not null default '{}' check (cardinality(supporting_urls) <= 10),
  context text check (char_length(context) <= 4000),
  submitter_name text check (char_length(submitter_name) <= 120),
  -- Optional, private, only used to follow up. Never shown publicly.
  submitter_email text check (submitter_email is null or (submitter_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(submitter_email) <= 254)),
  status text not null default 'new' check (status in ('new', 'reviewing', 'accepted', 'rejected', 'spam')),
  reviewer_id uuid references auth.users (id) on delete set null,
  reviewer_notes text,
  case_id uuid references public.cases (id) on delete set null,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index submissions_status_idx on public.submissions (status, created_at desc);
create trigger submissions_updated_at before update on public.submissions for each row execute function public.set_updated_at();

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed', 'bounced', 'complained')),
  -- Only hashes of the emailed tokens are stored.
  confirm_token_hash text,
  confirm_sent_at timestamptz,
  unsubscribe_token_hash text not null,
  consent_source text not null default 'website',
  consent_text text,
  consent_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  alerts_opt_in boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index newsletter_subscribers_email_key on public.newsletter_subscribers (lower(email));
create index newsletter_subscribers_status_idx on public.newsletter_subscribers (status);
create trigger newsletter_subscribers_updated_at before update on public.newsletter_subscribers for each row execute function public.set_updated_at();

create table public.newsletter_issues (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'weekly' check (kind in ('weekly', 'alert')),
  subject text not null check (char_length(subject) between 3 and 200),
  intro text check (char_length(intro) <= 4000),
  case_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed')),
  sent_count integer not null default 0,
  sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
