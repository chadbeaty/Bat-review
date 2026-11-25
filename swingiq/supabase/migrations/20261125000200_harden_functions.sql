-- Security advisor clean-up (2026-11-25), from Supabase's linter on the new Gapper project.
-- 1. Fix the search path on the two trigger helpers that didn't set one.
-- 2. Trigger functions can't be called from the API at all.
-- 3. The access helpers used inside Row Level Security policies are for signed-in users only, never visitors.

alter function public.touch_updated_at() set search_path = public;
alter function public.guard_user_role() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rollup_metric() from public, anon, authenticated;

revoke execute on function public.owns_player(uuid) from public, anon;
revoke execute on function public.can_view_player(uuid) from public, anon;
revoke execute on function public.is_team_member(uuid) from public, anon;
revoke execute on function public.is_team_coach(uuid) from public, anon;
revoke execute on function public.can_view_swing(uuid) from public, anon;
revoke execute on function public.owns_swing(uuid) from public, anon;
grant execute on function public.owns_player(uuid) to authenticated;
grant execute on function public.can_view_player(uuid) to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.is_team_coach(uuid) to authenticated;
grant execute on function public.can_view_swing(uuid) to authenticated;
grant execute on function public.owns_swing(uuid) to authenticated;
