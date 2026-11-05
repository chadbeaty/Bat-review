-- AGED TAKES — foundation: helpers, staff profiles and roles, site settings, append-only audit log.
--
-- Security model (read this before changing anything):
--   * Public visitors (anon) and signed-in readers only ever see published / public rows. Row Level Security
--     enforces this; hiding things in the UI is never the protection.
--   * Staff (researcher, editor, admin) write through their own signed-in session, so auth.uid() is known and
--     every change is attributed in the audit log. Staff access also requires two-step verification (aal2)
--     unless the admin turns that off in site_settings.
--   * Automated jobs (cron, AI research) run with the service role. The service role can create drafts and
--     proposals, but database triggers refuse to let it approve or publish anything: only a human editor can.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Site settings (feature switches and editorial configuration). Public keys are readable by everyone.
-- ---------------------------------------------------------------------------------------------------------

create table public.site_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  value jsonb not null,
  is_public boolean not null default false,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

insert into public.site_settings (key, value, is_public, description) values
  ('show_demo_content', 'true', true, 'Show records marked DEMO ONLY on the public site. Turn off before launch.'),
  ('staff_mfa_required', 'true', false, 'Require two-step verification (authenticator app) for all newsroom staff.'),
  ('methodology_version', '"1.0"', true, 'Current scoring and evidence methodology version shown on pages.'),
  ('ai_daily_budget_usd', '5', false, 'Maximum estimated AI spend per UTC day. Jobs stop when it is reached.'),
  ('ai_research_enabled', 'true', false, 'Allow scheduled AI research jobs to run.'),
  ('newsletter_enabled', 'true', true, 'Show the newsletter signup on the public site.'),
  ('submissions_enabled', 'true', true, 'Accept reader submissions at /submit.');

-- Reads a setting as jsonb. Security definer so RLS-protected policies can consult private settings.
create or replace function public.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.site_settings where key = p_key;
$$;

create or replace function public.demo_visible()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value = 'true'::jsonb from public.site_settings where key = 'show_demo_content'), true);
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Profiles and staff roles
-- ---------------------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text check (char_length(display_name) <= 80),
  role text not null default 'reader' check (role in ('reader', 'researcher', 'editor', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Every new sign-in account gets a reader profile. Roles are only ever raised by an admin (or the one-time
-- bootstrap below), never by the user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- The signed-in user's staff role, ignoring suspended accounts. Null for readers and visitors.
create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and status = 'active' and role in ('researcher', 'editor', 'admin');
$$;

-- True when the session has passed two-step verification, or when the admin has turned the requirement off.
create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or coalesce((select value = 'false'::jsonb from public.site_settings where key = 'staff_mfa_required'), false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select public.staff_role() is not null and public.mfa_ok();
$$;

create or replace function public.is_editor()
returns boolean
language sql
stable
as $$
  select public.staff_role() in ('editor', 'admin') and public.mfa_ok();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.staff_role() = 'admin' and public.mfa_ok();
$$;

-- One-time bootstrap: makes a user the first admin. Only callable by the server (service role), which checks
-- the user's verified email against ADMIN_EMAIL. Refuses once any admin exists.
create or replace function public.bootstrap_admin(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    return false;
  end if;
  update public.profiles set role = 'admin' where id = p_user;
  insert into public.audit_logs (actor_id, actor_label, action, entity_type, entity_id, new_value)
  values (p_user, 'system:bootstrap', 'bootstrap_admin', 'profiles', p_user::text, jsonb_build_object('role', 'admin'));
  return found;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Audit log (append-only). Written by triggers on every editorial table and by server actions.
-- ---------------------------------------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  actor_label text,
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

-- Who is acting: the signed-in user, or a label set by a server job (e.g. 'system:cron', 'ai:draft').
create or replace function public.current_actor_label()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('agedtakes.actor', true), ''),
    case when auth.uid() is not null then 'user' when current_user = 'service_role' then 'system:service' else 'system:owner' end
  );
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  -- Never copy search vectors or bulky generated values into the log.
  v_old := v_old - 'search' - 'follower_count';
  v_new := v_new - 'search' - 'follower_count';
  if tg_op = 'UPDATE' and v_old - 'updated_at' - 'last_updated_at' = v_new - 'updated_at' - 'last_updated_at' then
    return new;
  end if;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'case_id', v_old ->> 'case_id', v_new ->> 'key', v_old ->> 'key');
  insert into public.audit_logs (actor_id, actor_label, action, entity_type, entity_id, previous_value, new_value)
  values (auth.uid(), public.current_actor_label(), lower(tg_op), tg_table_name, v_id, v_old, v_new);
  return coalesce(new, old);
end;
$$;

create trigger audit_site_settings after insert or update or delete on public.site_settings
  for each row execute function public.audit_row_change();

-- Role and status changes on profiles are audited (emails are not copied).
create or replace function public.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role or old.status is distinct from new.status then
    insert into public.audit_logs (actor_id, actor_label, action, entity_type, entity_id, previous_value, new_value)
    values (auth.uid(), public.current_actor_label(), 'role_change', 'profiles', new.id::text,
            jsonb_build_object('role', old.role, 'status', old.status),
            jsonb_build_object('role', new.role, 'status', new.status));
  end if;
  return new;
end;
$$;

create trigger audit_profiles after update on public.profiles
  for each row execute function public.audit_profile_change();

-- Admins may not remove the last active admin (prevents locking everyone out of the newsroom).
create or replace function public.keep_one_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'admin' and (new.role <> 'admin' or new.status <> 'active')
     and not exists (select 1 from public.profiles where role = 'admin' and status = 'active' and id <> old.id) then
    raise exception 'At least one active admin is required';
  end if;
  return new;
end;
$$;

create trigger profiles_keep_one_admin before update on public.profiles
  for each row execute function public.keep_one_admin();

-- Rate limiting for public forms and API routes (works on serverless: state lives in Postgres).
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  delete from public.rate_limits where window_start < now() - interval '2 days';
  return v_hits <= p_limit;
end;
$$;
