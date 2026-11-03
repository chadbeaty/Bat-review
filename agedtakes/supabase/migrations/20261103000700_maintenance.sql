-- AGED TAKES — maintenance functions.

-- Removes every DEMO ONLY record. The demo fixtures were loaded as already-published content, so normal editorial
-- rules (append-only corrections, no deleting published cases) would block their removal; this function runs as
-- the database owner in seed mode for exactly that purpose, and touches only rows flagged is_demo.
-- Callable only by the server (service role) after an admin confirms in the newsroom.
create or replace function public.delete_demo_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cases integer;
  v_people integer;
begin
  perform set_config('agedtakes.seed_mode', 'on', true);
  perform set_config('agedtakes.actor', 'system:delete_demo_data', true);

  -- Anything about a fictional person is itself demonstration content.
  create temporary table demo_people on commit drop as select id from public.people where is_demo;

  delete from public.cases where is_demo or person_id in (select id from demo_people);
  get diagnostics v_cases = row_count;
  delete from public.prediction_outcomes where prediction_id in (select id from public.predictions where is_demo or person_id in (select id from demo_people));
  delete from public.predictions where is_demo or person_id in (select id from demo_people);
  delete from public.transactions where is_demo or person_id in (select id from demo_people);
  delete from public.wallet_events where is_demo or wallet_id in (select id from public.wallets where attributed_person_id in (select id from demo_people));
  delete from public.wallets where is_demo or attributed_person_id in (select id from demo_people);
  delete from public.statements where is_demo or person_id in (select id from demo_people);
  delete from public.evidence_sources e where e.is_demo
    and not exists (select 1 from public.statements s where s.source_id = e.id)
    and not exists (select 1 from public.case_evidence ce where ce.evidence_source_id = e.id)
    and not exists (select 1 from public.predictions p where p.outcome_source_id = e.id)
    and not exists (select 1 from public.transactions t where t.source_id = e.id)
    and not exists (select 1 from public.prediction_outcomes o where o.evidence_source_id = e.id);
  update public.monitored_sources set person_id = null where person_id in (select id from demo_people);
  delete from public.people where is_demo;
  get diagnostics v_people = row_count;
  update public.site_settings set value = 'false' where key = 'show_demo_content';

  insert into public.audit_logs (actor_label, action, entity_type, new_value)
  values ('system:delete_demo_data', 'delete_demo_data', 'site_settings', jsonb_build_object('cases', v_cases, 'people', v_people));
  return jsonb_build_object('cases', v_cases, 'people', v_people);
end;
$$;

revoke execute on function public.delete_demo_data() from public, anon, authenticated;
grant execute on function public.delete_demo_data() to service_role;
