-- AGED TAKES — hardening from the Supabase security advisor.

-- Trigger functions are only ever run by their triggers; nobody needs to call them through the API.
-- (Postgres checks EXECUTE on a trigger function only when the trigger is created, so the triggers keep working.)
revoke execute on function
  public.audit_profile_change(), public.audit_row_change(), public.enforce_case_rules(), public.enforce_outcome_rules(),
  public.enforce_prediction_rules(), public.enforce_statement_rules(), public.guard_case_evidence(),
  public.guard_newsletter_issue(), public.handle_new_user(), public.keep_one_admin(), public.sync_follower_count(),
  public.set_updated_at(), public.people_set_updated_at(), public.forbid_change()
from public, anon, authenticated;

-- Pin the search path of every remaining helper so a function can never resolve a table from another schema.
alter function public.set_updated_at() set search_path = public;
alter function public.is_staff() set search_path = public;
alter function public.is_editor() set search_path = public;
alter function public.is_admin() set search_path = public;
alter function public.current_actor_label() set search_path = public;
alter function public.is_slug(text) set search_path = public;
alter function public.people_set_updated_at() set search_path = public;
alter function public.legal_checklist_items() set search_path = public;
alter function public.legal_checklist_complete(jsonb) set search_path = public;
alter function public.case_transition_allowed(text, text) set search_path = public;
alter function public.in_seed_mode() set search_path = public;
alter function public.forbid_change() set search_path = public;

-- Note: case_is_public, person_is_public, source_is_public, demo_visible, staff_role and mfa_ok stay callable:
-- the Row Level Security policies use them for every visitor, and they reveal only public facts or the caller's own role.
