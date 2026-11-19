-- SwingIQ Live: core schema.
-- Every table has Row Level Security. A user sees and changes only their own hitters and everything under them.
-- Coaches can READ hitters on teams they coach; they can never change a hitter's data.
-- Billing (subscriptions) and the job queue's status are written only by the server (service role).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  role text not null default 'player' check (role in ('player', 'coach', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60))
  on conflict (id) do nothing;
  insert into public.subscriptions (user_id, plan, status) values (new.id, 'free', 'active') on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger users_touch before update on public.users for each row execute function public.touch_updated_at();

-- Users can't promote themselves.
create or replace function public.guard_user_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and coalesce(current_setting('role', true), '') <> 'service_role' and current_user <> 'postgres' then
    raise exception 'role can only be changed by the server';
  end if;
  return new;
end;
$$;
create trigger users_guard_role before update on public.users for each row execute function public.guard_user_role();

-- ---------------------------------------------------------------------------------------------------------------
-- Subscriptions (written only by the Stripe webhook through the service role)
-- ---------------------------------------------------------------------------------------------------------------
create table public.subscriptions (
  user_id uuid primary key references public.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'elite', 'team')),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_touch before update on public.subscriptions for each row execute function public.touch_updated_at();

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------------------------
-- Hitters and teams
-- ---------------------------------------------------------------------------------------------------------------
create table public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  -- The id the phone generated, so re-syncing never duplicates.
  client_id uuid not null,
  name text not null check (char_length(name) between 1 and 40),
  bats text not null check (bats in ('R', 'L')),
  height_in numeric(4, 1) not null check (height_in between 48 and 90),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_id)
);
create index player_profiles_owner_idx on public.player_profiles (owner_id);
create trigger player_profiles_touch before update on public.player_profiles for each row execute function public.touch_updated_at();

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
create index teams_owner_idx on public.teams (owner_id);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('coach', 'player', 'parent')),
  -- For players: which of their hitters is on this team. The hitter's owner links it, never the coach.
  player_profile_id uuid references public.player_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);
create index team_members_player_idx on public.team_members (player_profile_id);

-- ---------------------------------------------------------------------------------------------------------------
-- Access helpers (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.owns_player(p_player uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.player_profiles where id = p_player and owner_id = auth.uid());
$$;

create or replace function public.can_view_player(p_player uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.owns_player(p_player) or exists (
    select 1
    from public.team_members m
    join public.team_members c on c.team_id = m.team_id and c.role = 'coach' and c.user_id = auth.uid()
    where m.player_profile_id = p_player
  );
$$;

create or replace function public.is_team_member(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid())
      or exists (select 1 from public.teams where id = p_team and owner_id = auth.uid());
$$;

create or replace function public.is_team_coach(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.teams where id = p_team and owner_id = auth.uid())
      or exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid() and role = 'coach');
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Equipment, sessions and swings
-- ---------------------------------------------------------------------------------------------------------------
create table public.player_bats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  client_id uuid not null,
  brand text not null check (char_length(brand) between 1 and 40),
  model text not null check (char_length(model) between 1 and 60),
  length_in numeric(4, 1) check (length_in between 24 and 36),
  weight_oz numeric(4, 1) check (weight_oz between 18 and 34),
  drop_weight numeric(4, 1) generated always as (weight_oz - length_in) stored,
  certification text check (char_length(certification) <= 30),
  swing_count integer not null default 0 check (swing_count >= 0),
  created_at timestamptz not null default now(),
  unique (player_id, client_id)
);
create index player_bats_player_idx on public.player_bats (player_id);

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  client_id uuid not null,
  camera_view text not null check (camera_view in ('side', 'behind', 'front')),
  started_at timestamptz not null,
  ended_at timestamptz,
  swing_count integer not null default 0 check (swing_count >= 0),
  avg_score smallint check (avg_score between 0 and 100),
  best_score smallint check (best_score between 0 and 100),
  camera_fps smallint,
  pose_fps smallint,
  bat_id uuid references public.player_bats (id) on delete set null,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique (player_id, client_id)
);
create index practice_sessions_player_idx on public.practice_sessions (player_id, started_at desc);

create table public.swing_analyses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  client_id uuid not null,
  swing_number integer not null check (swing_number > 0),
  recorded_at timestamptz not null,
  camera_view text not null check (camera_view in ('side', 'behind', 'front')),
  overall_score smallint check (overall_score between 0 and 100),
  score jsonb not null default '{}'::jsonb,
  cue_id text,
  cue_text text check (char_length(cue_text) <= 300),
  phases jsonb not null default '{}'::jsonb,
  quality jsonb not null default '{}'::jsonb,
  engine_version text not null default '1',
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (player_id, client_id)
);
create index swing_analyses_session_idx on public.swing_analyses (session_id, swing_number);
create index swing_analyses_player_idx on public.swing_analyses (player_id, recorded_at desc);

create table public.swing_metrics (
  swing_id uuid not null references public.swing_analyses (id) on delete cascade,
  metric_key text not null check (char_length(metric_key) <= 40),
  value double precision,
  text_value text check (char_length(text_value) <= 200),
  -- measured | cv_estimated | sensor | unavailable: never show a number without its source.
  source text not null check (source in ('measured', 'cv_estimated', 'sensor', 'unavailable')),
  confidence real not null default 0 check (confidence between 0 and 1),
  reason text check (char_length(reason) <= 300),
  primary key (swing_id, metric_key),
  check (source <> 'unavailable' or value is null)
);
create index swing_metrics_key_idx on public.swing_metrics (metric_key);

create table public.swing_events (
  id uuid primary key default gen_random_uuid(),
  swing_id uuid not null references public.swing_analyses (id) on delete cascade,
  event text not null check (event in ('stance', 'load', 'stride', 'foot_plant', 'launch', 'contact', 'finish')),
  -- Milliseconds relative to contact.
  t_ms integer not null,
  source text not null check (source in ('pose', 'audio', 'sensor')),
  unique (swing_id, event)
);

create table public.swing_videos (
  id uuid primary key default gen_random_uuid(),
  swing_id uuid not null unique references public.swing_analyses (id) on delete cascade,
  -- Path in the private "swing-clips" bucket. Always starts with the owner's user id.
  storage_path text not null check (char_length(storage_path) <= 300),
  frame_count integer not null check (frame_count >= 0),
  bytes bigint not null default 0 check (bytes >= 0),
  fps smallint,
  created_at timestamptz not null default now()
);

create table public.body_tracking (
  swing_id uuid primary key references public.swing_analyses (id) on delete cascade,
  model text not null default 'mediapipe-pose-full',
  fps real,
  -- Compressed landmark frames.
  frames jsonb not null,
  created_at timestamptz not null default now()
);

-- Phase 2: filled by the native high-speed bat and ball trackers.
create table public.bat_tracking (
  swing_id uuid primary key references public.swing_analyses (id) on delete cascade,
  model_version text not null,
  fps real not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create table public.ball_tracking (
  swing_id uuid primary key references public.swing_analyses (id) on delete cascade,
  model_version text not null,
  fps real not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table public.spray_chart_events (
  swing_id uuid primary key references public.swing_analyses (id) on delete cascade,
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  direction text check (direction in ('pull', 'center', 'oppo')),
  hit_type text check (hit_type in ('grounder', 'liner', 'fly', 'popup', 'miss', 'foul')),
  source text not null default 'manual' check (source in ('manual', 'auto')),
  created_at timestamptz not null default now()
);
create index spray_chart_events_player_idx on public.spray_chart_events (player_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------------------
-- Coaching, goals and history
-- ---------------------------------------------------------------------------------------------------------------
create table public.practice_drills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  focus text not null,
  description text not null,
  equipment text,
  created_at timestamptz not null default now()
);

create table public.coaching_recommendations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  session_id uuid references public.practice_sessions (id) on delete cascade,
  swing_id uuid references public.swing_analyses (id) on delete cascade,
  kind text not null check (kind in ('cue', 'session_focus', 'coach_answer', 'drill')),
  text text not null check (char_length(text) <= 4000),
  based_on text[] not null default '{}',
  drill_id uuid references public.practice_drills (id) on delete set null,
  created_at timestamptz not null default now()
);
create index coaching_recommendations_player_idx on public.coaching_recommendations (player_id, created_at desc);

create table public.player_goals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  metric_key text not null,
  target double precision not null,
  direction text not null check (direction in ('at_least', 'at_most')),
  due_on date,
  achieved_at timestamptz,
  created_at timestamptz not null default now()
);
create index player_goals_player_idx on public.player_goals (player_id);

-- Daily rollups per metric, maintained by a trigger on swing_metrics. Progress charts read this, not raw rows.
create table public.metric_history (
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  metric_key text not null,
  day date not null,
  n integer not null default 0,
  sum double precision not null default 0,
  best_high double precision,
  best_low double precision,
  primary key (player_id, metric_key, day)
);

create or replace function public.rollup_metric()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_day date;
begin
  if new.value is null or new.source = 'unavailable' then
    return new;
  end if;
  select player_id, (recorded_at at time zone 'utc')::date into v_player, v_day from public.swing_analyses where id = new.swing_id;
  insert into public.metric_history as h (player_id, metric_key, day, n, sum, best_high, best_low)
  values (v_player, new.metric_key, v_day, 1, new.value, new.value, new.value)
  on conflict (player_id, metric_key, day) do update
    set n = h.n + 1,
        sum = h.sum + excluded.sum,
        best_high = greatest(h.best_high, excluded.best_high),
        best_low = least(h.best_low, excluded.best_low);
  return new;
end;
$$;
create trigger swing_metrics_rollup after insert on public.swing_metrics for each row execute function public.rollup_metric();

-- ---------------------------------------------------------------------------------------------------------------
-- Background jobs and usage
-- ---------------------------------------------------------------------------------------------------------------
create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  swing_id uuid not null references public.swing_analyses (id) on delete cascade,
  kind text not null check (kind in ('deep_pose', 'bat_tracking', 'ball_tracking')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts smallint not null default 0,
  max_attempts smallint not null default 3,
  last_error text,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index analysis_jobs_queue_idx on public.analysis_jobs (status, run_after) where status in ('queued', 'running');
create trigger analysis_jobs_touch before update on public.analysis_jobs for each row execute function public.touch_updated_at();

-- Workers claim the next job atomically (skip locked rows so several workers never take the same job).
create or replace function public.claim_analysis_job(p_kind text)
returns public.analysis_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.analysis_jobs;
begin
  select * into j from public.analysis_jobs
  where kind = p_kind and status = 'queued' and run_after <= now() and attempts < max_attempts
  order by run_after
  for update skip locked
  limit 1;
  if j.id is null then
    return null;
  end if;
  update public.analysis_jobs set status = 'running', attempts = attempts + 1, started_at = now() where id = j.id returning * into j;
  return j;
end;
$$;
revoke execute on function public.claim_analysis_job(text) from public, anon, authenticated;
grant execute on function public.claim_analysis_job(text) to service_role;

create table public.usage_records (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('session', 'swing', 'coach_question', 'clip_upload')),
  quantity integer not null default 1 check (quantity > 0),
  occurred_at timestamptz not null default now()
);
create index usage_records_user_idx on public.usage_records (user_id, kind, occurred_at desc);

-- ---------------------------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.subscriptions enable row level security;
alter table public.player_profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.player_bats enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.swing_analyses enable row level security;
alter table public.swing_metrics enable row level security;
alter table public.swing_events enable row level security;
alter table public.swing_videos enable row level security;
alter table public.body_tracking enable row level security;
alter table public.bat_tracking enable row level security;
alter table public.ball_tracking enable row level security;
alter table public.spray_chart_events enable row level security;
alter table public.practice_drills enable row level security;
alter table public.coaching_recommendations enable row level security;
alter table public.player_goals enable row level security;
alter table public.metric_history enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.usage_records enable row level security;

-- Users
create policy users_self_read on public.users for select to authenticated using (id = auth.uid());
create policy users_self_update on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Subscriptions: read your own; only the server writes.
create policy subscriptions_self_read on public.subscriptions for select to authenticated using (user_id = auth.uid());

-- Hitters
create policy players_read on public.player_profiles for select to authenticated using (owner_id = auth.uid() or public.can_view_player(id));
create policy players_insert on public.player_profiles for insert to authenticated with check (owner_id = auth.uid());
create policy players_update on public.player_profiles for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy players_delete on public.player_profiles for delete to authenticated using (owner_id = auth.uid());

-- Teams
create policy teams_read on public.teams for select to authenticated using (owner_id = auth.uid() or public.is_team_member(id));
create policy teams_insert on public.teams for insert to authenticated with check (owner_id = auth.uid());
create policy teams_update on public.teams for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy teams_delete on public.teams for delete to authenticated using (owner_id = auth.uid());

create policy team_members_read on public.team_members for select to authenticated using (public.is_team_member(team_id));
-- Coaches add and remove members. A member can leave, and can link only their own hitter.
create policy team_members_coach_insert on public.team_members for insert to authenticated
  with check (public.is_team_coach(team_id) and (player_profile_id is null or public.owns_player(player_profile_id)));
create policy team_members_coach_delete on public.team_members for delete to authenticated using (public.is_team_coach(team_id) or user_id = auth.uid());
create policy team_members_self_update on public.team_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (player_profile_id is null or public.owns_player(player_profile_id)));

-- Everything under a hitter: owner writes, owner and their coaches read.
create policy bats_read on public.player_bats for select to authenticated using (public.can_view_player(player_id));
create policy bats_write on public.player_bats for all to authenticated using (public.owns_player(player_id)) with check (public.owns_player(player_id));

create policy sessions_read on public.practice_sessions for select to authenticated using (public.can_view_player(player_id));
create policy sessions_write on public.practice_sessions for all to authenticated using (public.owns_player(player_id)) with check (public.owns_player(player_id));

create policy swings_read on public.swing_analyses for select to authenticated using (public.can_view_player(player_id));
create policy swings_write on public.swing_analyses for all to authenticated
  using (public.owns_player(player_id))
  with check (public.owns_player(player_id) and exists (select 1 from public.practice_sessions s where s.id = session_id and s.player_id = swing_analyses.player_id));

create or replace function public.can_view_swing(p_swing uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.swing_analyses where id = p_swing and public.can_view_player(player_id));
$$;
create or replace function public.owns_swing(p_swing uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.swing_analyses where id = p_swing and public.owns_player(player_id));
$$;

create policy metrics_read on public.swing_metrics for select to authenticated using (public.can_view_swing(swing_id));
create policy metrics_write on public.swing_metrics for all to authenticated using (public.owns_swing(swing_id)) with check (public.owns_swing(swing_id));
create policy events_read on public.swing_events for select to authenticated using (public.can_view_swing(swing_id));
create policy events_write on public.swing_events for all to authenticated using (public.owns_swing(swing_id)) with check (public.owns_swing(swing_id));
create policy videos_read on public.swing_videos for select to authenticated using (public.can_view_swing(swing_id));
create policy videos_write on public.swing_videos for all to authenticated
  using (public.owns_swing(swing_id))
  with check (public.owns_swing(swing_id) and split_part(storage_path, '/', 1) = auth.uid()::text);
create policy body_read on public.body_tracking for select to authenticated using (public.can_view_swing(swing_id));
create policy body_write on public.body_tracking for all to authenticated using (public.owns_swing(swing_id)) with check (public.owns_swing(swing_id));
-- Bat and ball tracking come from the server-side trackers only.
create policy bat_read on public.bat_tracking for select to authenticated using (public.can_view_swing(swing_id));
create policy ball_read on public.ball_tracking for select to authenticated using (public.can_view_swing(swing_id));
create policy spray_read on public.spray_chart_events for select to authenticated using (public.can_view_player(player_id));
create policy spray_write on public.spray_chart_events for all to authenticated
  using (public.owns_player(player_id))
  with check (public.owns_player(player_id) and public.owns_swing(swing_id));

create policy drills_read on public.practice_drills for select to anon, authenticated using (true);

create policy recs_read on public.coaching_recommendations for select to authenticated using (public.can_view_player(player_id));
create policy recs_write on public.coaching_recommendations for all to authenticated using (public.owns_player(player_id)) with check (public.owns_player(player_id));
create policy goals_read on public.player_goals for select to authenticated using (public.can_view_player(player_id));
create policy goals_write on public.player_goals for all to authenticated using (public.owns_player(player_id)) with check (public.owns_player(player_id));
create policy history_read on public.metric_history for select to authenticated using (public.can_view_player(player_id));

-- Jobs: owners can queue work for their own swings and watch it; only the server moves a job along.
create policy jobs_read on public.analysis_jobs for select to authenticated using (public.owns_swing(swing_id));
create policy jobs_insert on public.analysis_jobs for insert to authenticated
  with check (public.owns_swing(swing_id) and status = 'queued' and attempts = 0);

create policy usage_read on public.usage_records for select to authenticated using (user_id = auth.uid());
create policy usage_insert on public.usage_records for insert to authenticated with check (user_id = auth.uid());

-- Anonymous visitors get nothing beyond the drill library.
revoke all on all tables in schema public from anon;
grant select on public.practice_drills to anon;

-- ---------------------------------------------------------------------------------------------------------------
-- Private clip storage: each user's files live under a folder named with their user id.
-- ---------------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('swing-clips', 'swing-clips', false, 52428800, array['image/jpeg', 'video/mp4', 'video/quicktime', 'application/octet-stream'])
on conflict (id) do nothing;

create policy clips_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'swing-clips' and (storage.foldername(name))[1] = auth.uid()::text);
create policy clips_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'swing-clips' and (storage.foldername(name))[1] = auth.uid()::text);
create policy clips_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'swing-clips' and (storage.foldername(name))[1] = auth.uid()::text);
create policy clips_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'swing-clips' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------------------------------------------
-- Drill library (slow-pitch specific)
-- ---------------------------------------------------------------------------------------------------------------
insert into public.practice_drills (slug, name, focus, description, equipment) values
  ('stay-back-tee', 'Deep tee, stay back', 'drift', 'Set the tee even with your back hip. Hit line drives up the middle without your head moving forward. Teaches letting the slow-pitch ball travel instead of lunging at it.', 'Tee, balls'),
  ('high-hands-holds', 'Hands-at-the-shoulder holds', 'handDrop', 'Take your stance, load, and freeze for two seconds at launch with your hands still at shoulder height. Ten reps, then swing. Kills the hand drop before launch.', 'Bat'),
  ('quiet-head-mirror', 'Quiet-head mirror swings', 'head', 'Dry swings with a mirror or phone in front. Keep your head inside an imaginary box from stance to contact.', 'Bat, mirror'),
  ('finish-and-hold', 'Finish and hold', 'balance', 'Every swing, hold your finish for a three count with your weight over your front leg. If you have to step to catch yourself, swing at 80%.', 'Bat, balls'),
  ('step-and-pause', 'Step, pause, swing', 'lateFoot', 'Stride and plant, pause one beat, then swing. Front tosses with a high arc. Gets the front foot down early.', 'Bat, toss partner'),
  ('hip-lead-walkthrough', 'Hip-lead walk-throughs', 'armsFirst', 'Slow-motion swings starting with the back hip. Hands stay back until the belt buckle faces the pitcher.', 'Bat'),
  ('short-stride-line', 'Chalk-line stride', 'overstride', 'Mark a line 6 inches in front of your front foot. Stride to it, not past it, for a full round of front toss.', 'Chalk or tape'),
  ('separation-stretch', 'Separation stretch swings', 'noSeparation', 'Load and turn your front shoulder in while your hips start to open. Hold the stretch a beat, then swing.', 'Bat')
on conflict (slug) do nothing;
