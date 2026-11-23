-- AGED TAKES — optional auto-publish for research-agent drafts (the owner asked to stop approving each case).
--
-- When the "auto_publish_enabled" setting is on, auto_publish_due_cases() (run daily by /api/cron/auto-publish)
-- publishes a research-agent draft that has sat in "needs_review" for the review window (default 24 hours) without
-- anyone changing its status, provided every automatic check passes. The window starts when the draft was created or
-- when auto-publish was switched on, whichever is later, so drafts already waiting get the full window too:
--   * a summary and an article exist;
--   * the primary quotation was found word for word in the captured source and has a date;
--   * at least one evidence source is attached;
--   * the agent suggested Verified or Strong evidence and confirmed every legal check except right of reply;
--   * the person is not a demo or archived record.
-- Anything else stays in review with the reason recorded. Changing the status (Rejected, Needs more evidence, …)
-- or setting ai_notes.auto_publish = 'hold' stops it. The approval and publication are attributed to the admin who
-- switched the setting on; the legal checklist records that right of reply was not offered.
-- Human editors' rules are unchanged.

create or replace function public.in_auto_publish()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(current_setting('agedtakes.auto_publish', true), '') = 'on';
$$;

create or replace function public.enforce_case_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.staff_role();
  -- Auto-publish (auto_publish_due_cases) acts for the admin who switched it on; it is the only non-human path.
  v_auto boolean := public.in_auto_publish();
  v_actor uuid := coalesce(auth.uid(), case when public.in_auto_publish() then nullif(current_setting('agedtakes.auto_publish_actor', true), '')::uuid end);
  v_human_editor boolean := (auth.uid() is not null and v_role in ('editor', 'admin') and public.mfa_ok()) or public.in_auto_publish();
  v_content_changed boolean := false;
  v_auto_demoted boolean := false;
  v_evidence_count integer;
begin
  if public.in_seed_mode() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status in ('approved', 'published', 'disputed') then
      raise exception 'A new case must start in the research workflow, not as %', new.status using errcode = 'check_violation';
    end if;
    new.approved_by := null; new.approved_at := null; new.published_by := null; new.published_at := null;
    new.legal_reviewed_by := null; new.legal_reviewed_at := null;
    if auth.uid() is null then
      new.ai_generated := new.ai_generated or new.origin = 'ai';
    end if;
    return new;
  end if;

  -- Approval and publication stamps can only be written by this trigger.
  if (new.approved_by is not null and new.approved_by is distinct from old.approved_by)
     or (new.published_by is not null and new.published_by is distinct from old.published_by) then
    if not (new.status <> old.status and new.status in ('approved', 'published')) then
      raise exception 'Approval fields are set by the workflow, not edited directly' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.ai_generated is distinct from old.ai_generated and not new.ai_generated then
    raise exception 'The AI-generated flag cannot be removed' using errcode = 'insufficient_privilege';
  end if;

  v_content_changed := new.title is distinct from old.title or new.summary is distinct from old.summary
    or new.article_body is distinct from old.article_body or new.editorial_conclusion is distinct from old.editorial_conclusion
    or new.evidence_confidence is distinct from old.evidence_confidence or new.what_happened is distinct from old.what_happened
    or new.limitations is distinct from old.limitations or new.person_id is distinct from old.person_id
    or new.case_type is distinct from old.case_type;

  -- Legal checklist sign-off is stamped with the editor who completed it.
  if new.legal_review is distinct from old.legal_review then
    if not v_human_editor then
      raise exception 'Only an editor can complete the legal review checklist' using errcode = 'insufficient_privilege';
    end if;
    if public.legal_checklist_complete(new.legal_review) then
      new.legal_reviewed_by := v_actor;
      new.legal_reviewed_at := now();
    else
      new.legal_reviewed_by := null;
      new.legal_reviewed_at := null;
    end if;
  end if;

  -- Published content changes only through the correction workflow.
  if old.status in ('published', 'disputed') and new.status = old.status and v_content_changed
     and coalesce(current_setting('agedtakes.correction_reason', true), '') = '' then
    raise exception 'Published cases can only be changed through a recorded correction' using errcode = 'check_violation';
  end if;

  -- Editing an approved case invalidates the approval.
  if old.status = 'approved' and new.status = 'approved' and v_content_changed then
    new.status := 'needs_review';
    new.approved_by := null;
    new.approved_at := null;
    v_auto_demoted := true;
  end if;

  if new.status is distinct from old.status then
    if not public.case_transition_allowed(old.status, new.status) then
      raise exception 'A case cannot move from % to %', old.status, new.status using errcode = 'check_violation';
    end if;

    if new.status = 'approved' then
      if not v_human_editor then
        raise exception 'Only a signed-in editor can approve a case' using errcode = 'insufficient_privilege';
      end if;
      if new.evidence_confidence is null or new.evidence_confidence = 'unconfirmed' then
        raise exception 'A case needs Verified, Strong or Disputed evidence before approval (Unconfirmed cannot be published as fact)' using errcode = 'check_violation';
      end if;
      select count(*) into v_evidence_count from public.case_evidence where case_id = new.id;
      if v_evidence_count = 0 then
        raise exception 'A case needs at least one evidence source before approval' using errcode = 'check_violation';
      end if;
      if not public.legal_checklist_complete(new.legal_review)
         and not (v_auto and public.legal_checklist_complete(new.legal_review || '{"right_of_reply_offered": true}'::jsonb)) then
        -- Auto-publish may proceed without a right of reply (recorded as not offered); everything else must be confirmed.
        raise exception 'The legal review checklist must be complete before approval' using errcode = 'check_violation';
      end if;
      if new.summary is null or new.article_body is null then
        raise exception 'A case needs a summary and article before approval' using errcode = 'check_violation';
      end if;
      new.approved_by := v_actor;
      new.approved_at := now();
    elsif new.status = 'published' then
      if not v_human_editor then
        raise exception 'Only a signed-in editor can publish a case' using errcode = 'insufficient_privilege';
      end if;
      if old.status = 'approved' and (old.approved_by is null or old.approved_at is null) then
        raise exception 'A case must be approved before it is published' using errcode = 'check_violation';
      end if;
      if coalesce(current_setting('agedtakes.publish_confirmed', true), '') <> 'yes' then
        raise exception 'Publishing requires explicit confirmation (use publish_case)' using errcode = 'check_violation';
      end if;
      new.published_by := v_actor;
      new.published_at := coalesce(old.published_at, now());
      new.approved_by := coalesce(new.approved_by, old.approved_by);
      new.methodology_version := coalesce(new.methodology_version, (select value #>> '{}' from public.site_settings where key = 'methodology_version'));
    elsif old.status in ('published', 'approved', 'disputed') and not v_auto_demoted then
      -- Unpublishing, disputing or sending back to review are editorial decisions too.
      if not v_human_editor then
        raise exception 'Only a signed-in editor can change the status of an approved or published case' using errcode = 'insufficient_privilege';
      end if;
      if new.status not in ('published', 'disputed') then
        new.approved_by := null;
        new.approved_at := null;
      end if;
    end if;
  end if;

  if v_content_changed or new.status is distinct from old.status then
    new.last_updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.enforce_statement_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.in_seed_mode() then return new; end if;
  if tg_op = 'INSERT' then
    if new.visibility = 'public' and not ((auth.uid() is not null and public.is_editor()) or public.in_auto_publish()) then
      raise exception 'Only an editor can make a statement public' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if old.visibility = 'public' and coalesce(current_setting('agedtakes.correction_reason', true), '') = ''
     and (new.exact_quote is distinct from old.exact_quote or new.published_at is distinct from old.published_at
          or new.person_id is distinct from old.person_id or new.source_id is distinct from old.source_id) then
    raise exception 'A public statement''s quotation, date, person and source can only change through a correction' using errcode = 'check_violation';
  end if;
  if new.visibility = 'public' and old.visibility <> 'public' and not ((auth.uid() is not null and public.is_editor()) or public.in_auto_publish()) then
    raise exception 'Only an editor can make a statement public' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace function public.auto_publish_due_cases()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := coalesce((select value = 'true'::jsonb from public.site_settings where key = 'auto_publish_enabled'), false);
  v_hours numeric := coalesce((select (value #>> '{}')::numeric from public.site_settings where key = 'auto_publish_delay_hours'), 24);
  -- When the setting was last changed (i.e. switched on): drafts already waiting then get the full window from that moment.
  v_since timestamptz := coalesce((select updated_at from public.site_settings where key = 'auto_publish_enabled'), now());
  v_actor uuid;
  v_items text[] := public.legal_checklist_items();
  v_case record;
  v_reason text;
  v_level text;
  v_published jsonb := '[]'::jsonb;
  v_waiting jsonb := '[]'::jsonb;
begin
  if not v_enabled then
    return jsonb_build_object('enabled', false);
  end if;
  -- Act for the admin who switched auto-publish on (or the first admin).
  select p.id into v_actor from public.profiles p
  where p.role = 'admin' and p.id = (select updated_by from public.site_settings where key = 'auto_publish_enabled');
  if v_actor is null then
    select p.id into v_actor from public.profiles p where p.role = 'admin' order by p.created_at limit 1;
  end if;
  if v_actor is null then
    return jsonb_build_object('enabled', true, 'error', 'No admin account to act for');
  end if;

  for v_case in
    select c.* from public.cases c
    where c.origin = 'ai' and c.status = 'needs_review' and not c.is_demo
      and greatest(c.created_at, v_since) <= now() - make_interval(secs => (v_hours * 3600)::double precision)
      and coalesce(c.ai_notes ->> 'auto_publish', '') <> 'hold'
    order by c.created_at
  loop
    v_level := v_case.ai_notes #>> '{suggestions,confidence,level}';
    v_reason := case
      when v_case.summary is null or v_case.article_body is null then 'It has no summary or article.'
      when v_level is null or v_level not in ('verified', 'strong') then 'The agent did not rate the evidence Verified or Strong.'
      when exists (select 1 from unnest(v_items) as i(k)
                   where k <> 'right_of_reply_offered'
                     and coalesce(v_case.ai_notes #>> array['suggestions', 'legal', k, 'ok'], 'false') <> 'true')
        then 'The agent did not confirm every legal check.'
      when not exists (select 1 from public.statements s where s.id = v_case.primary_statement_id
                       and s.quote_verified_verbatim and s.source_id is not null and s.published_at is not null)
        then 'The main quotation is not verified word for word or has no date.'
      when not exists (select 1 from public.case_evidence ce where ce.case_id = v_case.id) then 'It has no evidence attached.'
      when exists (select 1 from public.people p where p.id = v_case.person_id and (p.is_demo or p.status = 'archived'))
        then 'The person is a demo or archived record.'
    end;

    if v_reason is not null then
      update public.cases set ai_notes = ai_notes || jsonb_build_object('auto_publish_skipped', v_reason) where id = v_case.id;
      v_waiting := v_waiting || jsonb_build_object('case', v_case.id, 'title', v_case.title, 'reason', v_reason);
      continue;
    end if;

    begin
      perform set_config('agedtakes.auto_publish', 'on', true);
      perform set_config('agedtakes.auto_publish_actor', v_actor::text, true);
      update public.statements set visibility = 'public', verification_status = 'verified' where id = v_case.primary_statement_id;
      update public.people set status = 'active' where id = v_case.person_id and status in ('draft', 'research_candidate');
      update public.cases set
        evidence_confidence = v_level,
        legal_review = (select jsonb_object_agg(k, k <> 'right_of_reply_offered') from unnest(v_items) as i(k))
          || jsonb_build_object('auto_published', true,
               'notes', 'Completed automatically from the research agent''s checks under the auto-publish setting. Right of reply was not offered before publication.'),
        ai_notes = ai_notes - 'auto_publish_skipped'
      where id = v_case.id;
      update public.cases set status = 'approved' where id = v_case.id;
      perform set_config('agedtakes.publish_confirmed', 'yes', true);
      update public.cases set status = 'published' where id = v_case.id;
      perform set_config('agedtakes.publish_confirmed', '', true);
      perform set_config('agedtakes.auto_publish', '', true);
      perform set_config('agedtakes.auto_publish_actor', '', true);
      insert into public.editorial_reviews (case_id, reviewer_id, decision, from_status, to_status, notes)
      values (v_case.id, v_actor, 'publish', 'needs_review', 'published',
              format('Published automatically after the %s-hour review window (auto-publish setting).', v_hours));
      v_published := v_published || jsonb_build_object('case', v_case.id, 'title', v_case.title, 'slug', v_case.slug);
    exception when others then
      perform set_config('agedtakes.publish_confirmed', '', true);
      perform set_config('agedtakes.auto_publish', '', true);
      perform set_config('agedtakes.auto_publish_actor', '', true);
      update public.cases set ai_notes = ai_notes || jsonb_build_object('auto_publish_skipped', 'Automatic publishing failed: ' || sqlerrm) where id = v_case.id;
      v_waiting := v_waiting || jsonb_build_object('case', v_case.id, 'title', v_case.title, 'reason', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('enabled', true, 'enabled_since', v_since, 'published', v_published, 'waiting', v_waiting);
end;
$$;

revoke execute on function public.auto_publish_due_cases(), public.in_auto_publish() from public, anon, authenticated;
grant execute on function public.auto_publish_due_cases() to service_role;

insert into public.site_settings (key, value, description) values
  ('auto_publish_enabled', 'false'::jsonb, 'Publish research-agent drafts automatically after the review window when every automatic check passes.'),
  ('auto_publish_delay_hours', '24'::jsonb, 'Hours a research-agent draft waits in review before it can be published automatically.')
on conflict (key) do nothing;
