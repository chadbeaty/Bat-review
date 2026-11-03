-- AGED TAKES — Row Level Security, privileges, public views, search and storage.
-- Rule of thumb: public = published/active/public rows only (and demo rows only while demo content is on);
-- staff = everything, through their own session; private operational tables = staff read, server writes.

-- Every table gets RLS. Tables without a policy for a role are invisible to it.
do $$
declare t text;
begin
  foreach t in array array[
    'site_settings', 'profiles', 'audit_logs', 'rate_limits', 'categories', 'people', 'person_categories',
    'evidence_sources', 'source_snapshots', 'statements', 'predictions', 'prediction_outcomes', 'cases',
    'case_evidence', 'case_timeline_events', 'corrections', 'subject_responses', 'editorial_reviews',
    'transactions', 'wallets', 'wallet_events', 'methodology_versions', 'user_follows', 'monitored_sources',
    'source_items', 'research_jobs', 'ingestion_jobs', 'ai_runs', 'submissions', 'newsletter_subscribers',
    'newsletter_issues']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Public-visibility predicates (security definer so they can look at related rows the caller can't see).
create or replace function public.person_is_public(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people where id = p and status = 'active' and (not is_demo or public.demo_visible()));
$$;

create or replace function public.case_is_public(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cases c where c.id = p and c.status in ('published', 'disputed') and c.published_at is not null
                 and (not c.is_demo or public.demo_visible()) and public.person_is_public(c.person_id));
$$;

create or replace function public.source_is_public(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.case_evidence ce where ce.evidence_source_id = p and public.case_is_public(ce.case_id))
      or exists (select 1 from public.statements s where s.source_id = p and s.visibility = 'public' and public.person_is_public(s.person_id))
      or exists (select 1 from public.predictions pr where pr.outcome_source_id = p and pr.visibility = 'public' and public.person_is_public(pr.person_id))
      or exists (select 1 from public.transactions t where t.source_id = p and t.visibility = 'public' and public.person_is_public(t.person_id))
      or exists (select 1 from public.case_timeline_events e where e.evidence_source_id = p and public.case_is_public(e.case_id));
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------------------------------------

-- site_settings
create policy "Public settings are readable" on public.site_settings for select using (is_public or public.is_staff());
create policy "Admins change settings" on public.site_settings for update using (public.is_admin()) with check (public.is_admin());

-- profiles: you see yourself; staff see everyone; admins change roles.
create policy "Users read their own profile" on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy "Admins manage profiles" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- audit_logs: admins read; nobody updates or deletes (also revoked below).
create policy "Admins read the audit log" on public.audit_logs for select using (public.is_admin());
create policy "Staff add audit entries" on public.audit_logs for insert with check (public.is_staff() and actor_id = auth.uid());

-- categories, methodology: public read, staff write.
create policy "Categories are public" on public.categories for select using (true);
create policy "Staff manage categories" on public.categories for all using (public.is_editor()) with check (public.is_editor());
create policy "Methodology is public" on public.methodology_versions for select using (true);
create policy "Admins manage methodology" on public.methodology_versions for all using (public.is_admin()) with check (public.is_admin());

-- people
create policy "Active people are public" on public.people for select
  using ((status = 'active' and (not is_demo or public.demo_visible())) or public.is_staff());
create policy "Staff add people" on public.people for insert with check (public.is_staff());
create policy "Staff edit people" on public.people for update using (public.is_staff()) with check (public.is_staff());
create policy "Admins delete people" on public.people for delete using (public.is_admin());

create policy "Person categories are public" on public.person_categories for select using (public.person_is_public(person_id) or public.is_staff());
create policy "Staff manage person categories" on public.person_categories for all using (public.is_staff()) with check (public.is_staff());

-- evidence_sources: public only when cited by something public.
create policy "Cited sources are public" on public.evidence_sources for select
  using (((not is_demo or public.demo_visible()) and public.source_is_public(id)) or public.is_staff());
create policy "Staff add sources" on public.evidence_sources for insert with check (public.is_staff());
create policy "Staff edit sources" on public.evidence_sources for update using (public.is_staff()) with check (public.is_staff());
create policy "Admins delete sources" on public.evidence_sources for delete using (public.is_admin());

create policy "Staff read snapshots" on public.source_snapshots for select using (public.is_staff());
create policy "Staff add snapshots" on public.source_snapshots for insert with check (public.is_staff());

-- statements and predictions
create policy "Public statements are public" on public.statements for select
  using ((visibility = 'public' and (not is_demo or public.demo_visible()) and public.person_is_public(person_id)) or public.is_staff());
create policy "Staff add statements" on public.statements for insert with check (public.is_staff());
create policy "Staff edit statements" on public.statements for update using (public.is_staff()) with check (public.is_staff());
create policy "Admins delete statements" on public.statements for delete using (public.is_admin() and visibility = 'internal');

create policy "Public predictions are public" on public.predictions for select
  using ((visibility = 'public' and (not is_demo or public.demo_visible()) and public.person_is_public(person_id)) or public.is_staff());
create policy "Staff add predictions" on public.predictions for insert with check (public.is_staff());
create policy "Staff edit predictions" on public.predictions for update using (public.is_staff()) with check (public.is_staff());
create policy "Admins delete predictions" on public.predictions for delete using (public.is_admin() and visibility = 'internal');

create policy "Confirmed outcomes are public" on public.prediction_outcomes for select
  using ((status = 'confirmed' and exists (select 1 from public.predictions p where p.id = prediction_id and p.visibility = 'public'
          and (not p.is_demo or public.demo_visible()) and public.person_is_public(p.person_id))) or public.is_staff());
create policy "Staff propose outcomes" on public.prediction_outcomes for insert with check (public.is_staff() and status = 'proposed');
create policy "Editors review outcomes" on public.prediction_outcomes for update using (public.is_editor()) with check (public.is_editor());

-- cases and their parts
create policy "Published cases are public" on public.cases for select
  using ((status in ('published', 'disputed') and published_at is not null and (not is_demo or public.demo_visible())
          and public.person_is_public(person_id)) or public.is_staff());
create policy "Staff add cases" on public.cases for insert with check (public.is_staff());
create policy "Staff edit cases" on public.cases for update using (public.is_staff()) with check (public.is_staff());
create policy "Admins delete unpublished cases" on public.cases for delete using (public.is_admin() and status not in ('published', 'disputed', 'approved'));

create policy "Evidence of public cases is public" on public.case_evidence for select using (public.case_is_public(case_id) or public.is_staff());
create policy "Staff manage case evidence" on public.case_evidence for all using (public.is_staff()) with check (public.is_staff());

create policy "Timeline of public cases is public" on public.case_timeline_events for select using (public.case_is_public(case_id) or public.is_staff());
create policy "Staff manage timelines" on public.case_timeline_events for all using (public.is_staff()) with check (public.is_staff());

create policy "Public corrections are public" on public.corrections for select
  using ((is_public and (
           (case_id is not null and public.case_is_public(case_id))
        or (prediction_id is not null and exists (select 1 from public.predictions p where p.id = prediction_id and p.visibility = 'public' and public.person_is_public(p.person_id)))
        or (statement_id is not null and exists (select 1 from public.statements s where s.id = statement_id and s.visibility = 'public' and public.person_is_public(s.person_id)))
        )) or public.is_staff());
create policy "Editors record corrections" on public.corrections for insert with check (public.is_editor() and created_by = auth.uid());

create policy "Responses on public cases are public" on public.subject_responses for select using (public.case_is_public(case_id) or public.is_staff());
create policy "Staff record responses" on public.subject_responses for all using (public.is_staff()) with check (public.is_staff());

create policy "Staff read reviews" on public.editorial_reviews for select using (public.is_staff());
create policy "Staff add reviews" on public.editorial_reviews for insert with check (public.is_staff() and reviewer_id = auth.uid());

-- documented activity
create policy "Public transactions are public" on public.transactions for select
  using ((visibility = 'public' and (not is_demo or public.demo_visible()) and public.person_is_public(person_id)) or public.is_staff());
create policy "Staff manage transactions" on public.transactions for all using (public.is_staff()) with check (public.is_staff());
create policy "Public wallets are public" on public.wallets for select
  using ((visibility = 'public' and (not is_demo or public.demo_visible())) or public.is_staff());
create policy "Staff manage wallets" on public.wallets for all using (public.is_staff()) with check (public.is_staff());
create policy "Public wallet events are public" on public.wallet_events for select
  using ((visibility = 'public' and (not is_demo or public.demo_visible())) or public.is_staff());
create policy "Staff manage wallet events" on public.wallet_events for all using (public.is_staff()) with check (public.is_staff());

-- follows: your own only.
create policy "Readers see their follows" on public.user_follows for select using (user_id = auth.uid());
create policy "Readers follow" on public.user_follows for insert with check (user_id = auth.uid() and public.person_is_public(person_id));
create policy "Readers unfollow" on public.user_follows for delete using (user_id = auth.uid());

-- operations: staff read; writes happen on the server with the service role.
create policy "Staff read monitored sources" on public.monitored_sources for select using (public.is_staff());
create policy "Editors manage monitored sources" on public.monitored_sources for all using (public.is_editor()) with check (public.is_editor());
create policy "Staff read source items" on public.source_items for select using (public.is_staff());
create policy "Staff triage source items" on public.source_items for update using (public.is_staff()) with check (public.is_staff());
create policy "Staff read research jobs" on public.research_jobs for select using (public.is_staff());
create policy "Staff queue research jobs" on public.research_jobs for insert with check (public.is_staff() and created_by = auth.uid());
create policy "Staff cancel research jobs" on public.research_jobs for update using (public.is_staff()) with check (public.is_staff());
create policy "Staff read ingestion jobs" on public.ingestion_jobs for select using (public.is_staff());
create policy "Staff read AI runs" on public.ai_runs for select using (public.is_staff());
create policy "Staff read submissions" on public.submissions for select using (public.is_staff());
create policy "Staff triage submissions" on public.submissions for update using (public.is_staff()) with check (public.is_staff());
create policy "Admins read subscribers" on public.newsletter_subscribers for select using (public.is_admin());
create policy "Admins manage subscribers" on public.newsletter_subscribers for update using (public.is_admin()) with check (public.is_admin());
create policy "Editors read issues" on public.newsletter_issues for select using (public.is_editor());
create policy "Editors manage issues" on public.newsletter_issues for all using (public.is_editor()) with check (public.is_editor());

-- ---------------------------------------------------------------------------------------------------------
-- Privileges. Granted explicitly (some Supabase projects no longer expose new tables automatically), then
-- tightened. Row Level Security above still decides which rows each role can actually see or change.
-- ---------------------------------------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

revoke all on public.rate_limits from anon, authenticated;
revoke all on public.source_snapshots from anon;
revoke all on public.newsletter_subscribers from anon;
revoke all on public.submissions from anon;
revoke insert, update, delete on public.audit_logs from anon;
revoke update, delete on public.audit_logs from service_role;
revoke update, delete on public.audit_logs from authenticated;
revoke update, delete on public.editorial_reviews from anon, authenticated;
revoke update, delete on public.corrections from anon, authenticated;
revoke insert, update, delete on public.ai_runs, public.ingestion_jobs from anon, authenticated;

-- Internal functions are not part of the public API.
revoke execute on function public.bootstrap_admin(uuid) from public, anon, authenticated;
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.claim_research_jobs(text, integer, text[]) from public, anon, authenticated;
revoke execute on function public.fail_research_job(uuid, text) from public, anon, authenticated;
revoke execute on function public.ai_spend_today() from public, anon, authenticated;
revoke execute on function public.setting(text) from public, anon, authenticated;
grant execute on function public.bootstrap_admin(uuid), public.hit_rate_limit(text, integer, integer),
  public.claim_research_jobs(text, integer, text[]), public.fail_research_job(uuid, text), public.ai_spend_today(),
  public.setting(text) to service_role;

-- Editorial workflow functions are for signed-in staff only (they also check the role themselves).
revoke execute on function public.transition_case(uuid, text, text), public.publish_case(uuid, text, text),
  public.correct_published_case(uuid, jsonb, text, boolean), public.correct_prediction(uuid, text, text, text),
  public.correct_statement(uuid, text, text, text), public.confirm_prediction_outcome(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.transition_case(uuid, text, text), public.publish_case(uuid, text, text),
  public.correct_published_case(uuid, jsonb, text, boolean), public.correct_prediction(uuid, text, text, text),
  public.correct_statement(uuid, text, text, text), public.confirm_prediction_outcome(uuid, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Public statistics (views run with the caller's permissions, so they only count public rows)
-- ---------------------------------------------------------------------------------------------------------

create view public.person_stats with (security_invoker = true) as
select
  p.id as person_id,
  count(pr.id) filter (where pr.status in ('resolved_correct', 'resolved_incorrect', 'partially_correct')) as predictions_resolved,
  count(pr.id) filter (where pr.status = 'resolved_correct') as predictions_correct,
  count(pr.id) filter (where pr.status = 'resolved_incorrect') as predictions_incorrect,
  count(pr.id) filter (where pr.status = 'partially_correct') as predictions_partial,
  count(pr.id) filter (where pr.status = 'open') as predictions_open,
  count(pr.id) filter (where pr.status = 'unscorable') as predictions_unscorable,
  count(pr.id) filter (where pr.status = 'disputed') as predictions_disputed,
  (select count(*) from public.cases c where c.person_id = p.id) as cases_published,
  (select count(*) from public.cases c where c.person_id = p.id and c.case_type in ('changed_position', 'broken_promise')) as contradiction_cases,
  (select count(*) from public.statements s where s.person_id = p.id) as statements_reviewed,
  greatest(p.updated_at, max(pr.updated_at), (select max(c.last_updated_at) from public.cases c where c.person_id = p.id)) as last_updated_at
from public.people p
left join public.predictions pr on pr.person_id = p.id
group by p.id;

-- Unified search across public people, cases, statements and predictions.
create or replace function public.search_archive(p_query text, p_kinds text[] default null, p_limit integer default 30)
returns table (kind text, id uuid, slug text, title text, snippet text, person_name text, person_slug text, occurred_at timestamptz, rank real)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (select websearch_to_tsquery('english', left(coalesce(p_query, ''), 200)) as tsq, lower(trim(coalesce(p_query, ''))) as raw)
  select * from (
    select 'person'::text, p.id, p.slug, p.name, coalesce(p.occupation, ''), p.name, p.slug, p.updated_at,
           ts_rank(p.search, q.tsq) + case when lower(p.name) like '%' || q.raw || '%' then 1 else 0 end
    from public.people p, q
    where (p_kinds is null or 'person' = any (p_kinds)) and (p.search @@ q.tsq or (char_length(q.raw) >= 2 and lower(p.name) like '%' || q.raw || '%'))
    union all
    select 'case', c.id, c.slug, c.title, ts_headline('english', coalesce(c.summary, ''), q.tsq, 'MaxWords=30, MinWords=10'),
           p.name, p.slug, c.published_at, ts_rank(c.search, q.tsq)
    from public.cases c join public.people p on p.id = c.person_id, q
    where (p_kinds is null or 'case' = any (p_kinds)) and c.search @@ q.tsq
    union all
    select 'statement', s.id, p.slug, left(s.exact_quote, 200), coalesce(s.asset_or_topic, ''), p.name, p.slug, s.published_at, ts_rank(s.search, q.tsq)
    from public.statements s join public.people p on p.id = s.person_id, q
    where (p_kinds is null or 'statement' = any (p_kinds)) and s.search @@ q.tsq
    union all
    select 'prediction', pr.id, p.slug, left(pr.prediction_text, 200), pr.status, p.name, p.slug, pr.prediction_date::timestamptz, ts_rank(pr.search, q.tsq)
    from public.predictions pr join public.people p on p.id = pr.person_id, q
    where (p_kinds is null or 'prediction' = any (p_kinds)) and pr.search @@ q.tsq
  ) r (kind, id, slug, title, snippet, person_name, person_slug, occurred_at, rank)
  order by rank desc, occurred_at desc nulls last
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.search_archive(text, text[], integer) to anon, authenticated;
grant select on public.person_stats to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Storage: public person photos; private evidence files (screenshots, filings). Skipped in plain-Postgres tests.
-- ---------------------------------------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not found, skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('person-images', 'person-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp']),
    ('evidence-files', 'evidence-files', false, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'])
  on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$ create policy "Staff upload person images" on storage.objects for insert to authenticated
    with check (bucket_id = 'person-images' and public.is_staff()) $p$;
  execute $p$ create policy "Staff replace person images" on storage.objects for update to authenticated
    using (bucket_id = 'person-images' and public.is_staff()) $p$;
  execute $p$ create policy "Admins delete person images" on storage.objects for delete to authenticated
    using (bucket_id = 'person-images' and public.is_admin()) $p$;
  execute $p$ create policy "Staff read evidence files" on storage.objects for select to authenticated
    using (bucket_id = 'evidence-files' and public.is_staff()) $p$;
  execute $p$ create policy "Staff upload evidence files" on storage.objects for insert to authenticated
    with check (bucket_id = 'evidence-files' and public.is_staff()) $p$;
end;
$$;
