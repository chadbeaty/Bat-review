-- Sign in and use Gapper on more than one device (2026-11-25).
--
-- Every hitter, bat, session and swing now carries its full on-device record in `data`, so a second phone or a laptop
-- can rebuild the same history after signing in. The swing's tracked body points go in body_tracking.frames. Video
-- never leaves the phone that recorded it.
--
-- Deletes are soft (`deleted_at`), so deleting a swing on one device removes it from the others on their next sync.
-- `updated_at` moves on every write and drives incremental pulls.

alter table public.player_profiles
  add column data jsonb not null default '{}'::jsonb,
  add column deleted_at timestamptz;

alter table public.player_bats
  add column data jsonb not null default '{}'::jsonb,
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz;

alter table public.practice_sessions
  add column data jsonb not null default '{}'::jsonb,
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz;

alter table public.swing_analyses
  add column data jsonb not null default '{}'::jsonb,
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz;

create trigger player_bats_touch before update on public.player_bats for each row execute function public.touch_updated_at();
create trigger practice_sessions_touch before update on public.practice_sessions for each row execute function public.touch_updated_at();
create trigger swing_analyses_touch before update on public.swing_analyses for each row execute function public.touch_updated_at();

-- Size guards: a hitter or session record is a few KB, a swing record (analysis, hand and bat paths) without its body
-- points well under 256 KB, and a swing's body points under 1 MB.
alter table public.player_profiles add constraint player_profiles_data_size check (pg_column_size(data) <= 65536);
alter table public.player_bats add constraint player_bats_data_size check (pg_column_size(data) <= 16384);
alter table public.practice_sessions add constraint practice_sessions_data_size check (pg_column_size(data) <= 16384);
alter table public.swing_analyses add constraint swing_analyses_data_size check (pg_column_size(data) <= 262144);
alter table public.body_tracking add constraint body_tracking_frames_size check (pg_column_size(frames) <= 1048576);

-- Incremental pulls: "everything of mine that changed since my last sync".
create index player_profiles_owner_updated_idx on public.player_profiles (owner_id, updated_at);
create index player_bats_player_updated_idx on public.player_bats (player_id, updated_at);
create index practice_sessions_player_updated_idx on public.practice_sessions (player_id, updated_at);
create index swing_analyses_player_updated_idx on public.swing_analyses (player_id, updated_at);

-- Delete my account: removes the signed-in user, and through the cascades every hitter, session and swing they backed
-- up. Runs as the database owner so a player can do it without the server's secret key; it only ever touches the
-- caller's own user row.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = me;
end;
$$;
revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
