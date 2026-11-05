-- AGED TAKES — editorial rules enforced by the database. These hold no matter which code path writes:
--
--   1. Cases move only along the allowed workflow (DISCOVERED → … → PUBLISHED, plus side states).
--   2. Only a signed-in human editor or admin can APPROVE or PUBLISH. The service role used by AI and cron jobs
--      can never do either, so an AI draft cannot reach the public site on its own.
--   3. Approval requires an evidence classification, at least one evidence record and a complete legal checklist.
--      Publication requires a prior approval, and any content edit after approval sends the case back to review.
--   4. Published text can only change through correct_published_case(), which records a correction.
--   5. A public prediction's original wording, date, target and deadline can never be edited in place;
--      fixes go through correct_prediction(), which records a correction.
--   6. Only a human editor can resolve a prediction; resolving before the deadline needs a written reason.

-- Legal checklist items required before approval. Keep in sync with src/lib/editorial/legal.ts.
create or replace function public.legal_checklist_items()
returns text[]
language sql
immutable
as $$
  select array[
    'quotes_verbatim_and_sourced',
    'dates_verified',
    'context_included',
    'no_unsupported_accusation',
    'ownership_and_identity_established',
    'transfers_not_called_sales',
    'opinion_labeled_as_opinion',
    'right_of_reply_offered',
    'limitations_stated'
  ];
$$;

create or replace function public.legal_checklist_complete(p jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(coalesce((p ->> item)::boolean, false)), false)
  from unnest(public.legal_checklist_items()) as item;
$$;

-- Allowed status transitions. Kept as data so the admin UI shows the same choices the database allows.
create or replace function public.case_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select p_from = p_to or (p_from, p_to) in (
    ('discovered', 'researching'), ('discovered', 'rejected'), ('discovered', 'archived'),
    ('researching', 'evidence_gathering'), ('researching', 'needs_more_evidence'), ('researching', 'rejected'), ('researching', 'archived'),
    ('evidence_gathering', 'draft_ready'), ('evidence_gathering', 'needs_more_evidence'), ('evidence_gathering', 'rejected'), ('evidence_gathering', 'archived'),
    ('draft_ready', 'needs_review'), ('draft_ready', 'evidence_gathering'), ('draft_ready', 'rejected'), ('draft_ready', 'archived'),
    ('needs_review', 'approved'), ('needs_review', 'needs_more_evidence'), ('needs_review', 'researching'), ('needs_review', 'disputed'), ('needs_review', 'rejected'), ('needs_review', 'draft_ready'),
    ('needs_more_evidence', 'researching'), ('needs_more_evidence', 'evidence_gathering'), ('needs_more_evidence', 'rejected'), ('needs_more_evidence', 'archived'),
    ('approved', 'published'), ('approved', 'needs_review'), ('approved', 'rejected'),
    ('published', 'disputed'), ('published', 'archived'), ('published', 'needs_review'),
    ('disputed', 'needs_review'), ('disputed', 'researching'), ('disputed', 'published'), ('disputed', 'archived'),
    ('rejected', 'discovered'), ('rejected', 'archived'),
    ('archived', 'discovered')
  );
$$;

-- Owner-level SQL (migrations, the seed file) may set agedtakes.seed_mode to load demonstration content that is
-- already "published". API roles (anon, authenticated, service_role) can never use this.
create or replace function public.in_seed_mode()
returns boolean
language sql
stable
as $$
  select current_setting('agedtakes.seed_mode', true) = 'on'
     and current_user not in ('anon', 'authenticated', 'service_role');
$$;

create or replace function public.enforce_case_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.staff_role();
  v_human_editor boolean := auth.uid() is not null and v_role in ('editor', 'admin') and public.mfa_ok();
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
      new.legal_reviewed_by := auth.uid();
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
      if not public.legal_checklist_complete(new.legal_review) then
        raise exception 'The legal review checklist must be complete before approval' using errcode = 'check_violation';
      end if;
      if new.summary is null or new.article_body is null then
        raise exception 'A case needs a summary and article before approval' using errcode = 'check_violation';
      end if;
      new.approved_by := auth.uid();
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
      new.published_by := auth.uid();
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

create trigger cases_enforce_rules before insert or update on public.cases
  for each row execute function public.enforce_case_rules();

create trigger audit_cases after insert or update or delete on public.cases
  for each row execute function public.audit_row_change();

-- Evidence on an approved or published case can't be quietly swapped out.
create or replace function public.guard_case_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if public.in_seed_mode() then return coalesce(new, old); end if;
  select status into v_status from public.cases where id = coalesce(new.case_id, old.case_id);
  if v_status in ('approved', 'published') and tg_op = 'DELETE' and not (auth.uid() is not null and public.is_editor()) then
    raise exception 'Only an editor can remove evidence from an approved or published case' using errcode = 'insufficient_privilege';
  end if;
  if v_status = 'approved' then
    -- Changing the evidence of an approved case sends it back to review.
    update public.cases set status = 'needs_review', approved_by = null, approved_at = null
    where id = coalesce(new.case_id, old.case_id) and status = 'approved';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger case_evidence_guard before insert or update or delete on public.case_evidence
  for each row execute function public.guard_case_evidence();

-- The editorial review trail cannot be rewritten.
create or replace function public.forbid_change()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are append-only', tg_table_name using errcode = 'insufficient_privilege';
end;
$$;

create trigger editorial_reviews_append_only before update or delete on public.editorial_reviews
  for each row when (not public.in_seed_mode()) execute function public.forbid_change();
create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function public.forbid_change();
create trigger corrections_append_only before update or delete on public.corrections
  for each row when (not public.in_seed_mode()) execute function public.forbid_change();

-- ---------------------------------------------------------------------------------------------------------
-- Workflow functions (called by the newsroom through the editor's own session; RLS still applies)
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.transition_case(p_case uuid, p_to text, p_notes text default null)
returns public.cases
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_from text;
  v_row public.cases;
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_to = 'published' then
    raise exception 'Use publish_case to publish' using errcode = 'check_violation';
  end if;
  select status into v_from from public.cases where id = p_case for update;
  if v_from is null then raise exception 'Case not found'; end if;
  update public.cases set status = p_to where id = p_case returning * into v_row;
  insert into public.editorial_reviews (case_id, reviewer_id, decision, from_status, to_status, notes)
  values (p_case, auth.uid(),
          case p_to when 'approved' then 'approve' when 'rejected' then 'reject' when 'needs_more_evidence' then 'needs_more_evidence'
                    when 'researching' then 'request_research' else 'status_change' end,
          v_from, p_to, p_notes);
  return v_row;
end;
$$;

-- Publishing needs the editor to type the case slug as confirmation.
create or replace function public.publish_case(p_case uuid, p_confirm_slug text, p_notes text default null)
returns public.cases
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_case public.cases;
  v_from text;
begin
  if not public.is_editor() then
    raise exception 'Only an editor can publish' using errcode = 'insufficient_privilege';
  end if;
  select * into v_case from public.cases where id = p_case for update;
  if v_case.id is null then raise exception 'Case not found'; end if;
  if v_case.slug <> p_confirm_slug then
    raise exception 'Confirmation did not match the case address' using errcode = 'check_violation';
  end if;
  v_from := v_case.status;
  perform set_config('agedtakes.publish_confirmed', 'yes', true);
  update public.cases set status = 'published' where id = p_case returning * into v_case;
  perform set_config('agedtakes.publish_confirmed', '', true);
  insert into public.editorial_reviews (case_id, reviewer_id, decision, from_status, to_status, notes)
  values (p_case, auth.uid(), 'publish', v_from, 'published', p_notes);
  return v_case;
end;
$$;

-- Changes the text of a published case and records each changed field as a correction.
create or replace function public.correct_published_case(p_case uuid, p_patch jsonb, p_reason text, p_public boolean default true)
returns public.cases
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old public.cases;
  v_new public.cases;
  v_field text;
begin
  if not public.is_editor() then
    raise exception 'Only an editor can correct a published case' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(char_length(trim(p_reason)), 0) < 5 then
    raise exception 'A correction needs a reason' using errcode = 'check_violation';
  end if;
  select * into v_old from public.cases where id = p_case for update;
  if v_old.status not in ('published', 'disputed') then
    raise exception 'Only published cases use corrections; edit drafts directly' using errcode = 'check_violation';
  end if;
  perform set_config('agedtakes.correction_reason', p_reason, true);
  update public.cases set
    title = coalesce(p_patch ->> 'title', title),
    summary = coalesce(p_patch ->> 'summary', summary),
    article_body = coalesce(p_patch ->> 'article_body', article_body),
    what_happened = coalesce(p_patch ->> 'what_happened', what_happened),
    limitations = coalesce(p_patch ->> 'limitations', limitations),
    editorial_conclusion = coalesce(p_patch ->> 'editorial_conclusion', editorial_conclusion),
    evidence_confidence = coalesce(p_patch ->> 'evidence_confidence', evidence_confidence)
  where id = p_case returning * into v_new;
  perform set_config('agedtakes.correction_reason', '', true);

  foreach v_field in array array['title', 'summary', 'article_body', 'what_happened', 'limitations', 'editorial_conclusion', 'evidence_confidence'] loop
    if (to_jsonb(v_old) ->> v_field) is distinct from (to_jsonb(v_new) ->> v_field) then
      insert into public.corrections (case_id, field, previous_text, corrected_text, reason, is_public, created_by)
      values (p_case, v_field, to_jsonb(v_old) ->> v_field, to_jsonb(v_new) ->> v_field, p_reason, p_public, auth.uid());
    end if;
  end loop;
  insert into public.case_timeline_events (case_id, occurred_at, label, description, kind)
  select p_case, now(), 'Correction', p_reason, 'correction' where p_public;
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Statements and predictions: originals are immutable once public.
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.enforce_statement_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.in_seed_mode() then return new; end if;
  if tg_op = 'INSERT' then
    if new.visibility = 'public' and not (auth.uid() is not null and public.is_editor()) then
      raise exception 'Only an editor can make a statement public' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if old.visibility = 'public' and coalesce(current_setting('agedtakes.correction_reason', true), '') = ''
     and (new.exact_quote is distinct from old.exact_quote or new.published_at is distinct from old.published_at
          or new.person_id is distinct from old.person_id or new.source_id is distinct from old.source_id) then
    raise exception 'A public statement''s quotation, date, person and source can only change through a correction' using errcode = 'check_violation';
  end if;
  if new.visibility = 'public' and old.visibility <> 'public' and not (auth.uid() is not null and public.is_editor()) then
    raise exception 'Only an editor can make a statement public' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger statements_enforce_rules before insert or update on public.statements
  for each row execute function public.enforce_statement_rules();

create or replace function public.enforce_prediction_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_human_editor boolean := auth.uid() is not null and public.is_editor();
begin
  if public.in_seed_mode() then return new; end if;

  if tg_op = 'INSERT' then
    if new.status <> 'open' and not v_human_editor then
      raise exception 'Only an editor can record a resolved prediction' using errcode = 'insufficient_privilege';
    end if;
    if new.visibility = 'public' and not v_human_editor then
      raise exception 'Only an editor can make a prediction public' using errcode = 'insufficient_privilege';
    end if;
  else
    if old.visibility = 'public' and coalesce(current_setting('agedtakes.correction_reason', true), '') = ''
       and (new.prediction_text is distinct from old.prediction_text or new.prediction_date is distinct from old.prediction_date
            or new.target_value is distinct from old.target_value or new.target_currency is distinct from old.target_currency
            or new.deadline is distinct from old.deadline or new.asset is distinct from old.asset
            or new.statement_id is distinct from old.statement_id or new.person_id is distinct from old.person_id
            or new.resolution_criteria is distinct from old.resolution_criteria or new.target_direction is distinct from old.target_direction) then
      raise exception 'The original prediction cannot be modified retroactively; record a correction instead' using errcode = 'check_violation';
    end if;
    if new.visibility = 'public' and old.visibility <> 'public' and not v_human_editor then
      raise exception 'Only an editor can make a prediction public' using errcode = 'insufficient_privilege';
    end if;
    if new.status is distinct from old.status then
      if not v_human_editor then
        raise exception 'Only a signed-in editor can resolve or reopen a prediction' using errcode = 'insufficient_privilege';
      end if;
      if new.status <> 'open' then
        new.resolved_by := auth.uid();
        new.resolved_at := coalesce(new.resolved_at, now());
      else
        new.resolved_by := null; new.resolved_at := null;
      end if;
    end if;
  end if;

  -- Resolving before the deadline is allowed only with a written reason (e.g. the target was reached early).
  if new.status in ('resolved_correct', 'resolved_incorrect', 'partially_correct')
     and (new.deadline is null or new.deadline > coalesce(new.resolved_at, now())::date)
     and coalesce(trim(new.early_resolution_reason), '') = '' then
    raise exception 'This prediction''s deadline has not passed; record why it can be resolved early, or leave it open' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger predictions_enforce_rules before insert or update on public.predictions
  for each row execute function public.enforce_prediction_rules();

create or replace function public.correct_prediction(p_prediction uuid, p_field text, p_value text, p_reason text)
returns public.predictions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old text;
  v_row public.predictions;
begin
  if not public.is_editor() then raise exception 'Not allowed' using errcode = 'insufficient_privilege'; end if;
  if p_field not in ('prediction_text', 'prediction_date', 'target_value', 'target_currency', 'deadline', 'asset', 'resolution_criteria', 'target_direction') then
    raise exception 'That field cannot be corrected here';
  end if;
  if coalesce(char_length(trim(p_reason)), 0) < 5 then raise exception 'A correction needs a reason'; end if;
  select to_jsonb(p) ->> p_field into v_old from public.predictions p where id = p_prediction for update;
  perform set_config('agedtakes.correction_reason', p_reason, true);
  execute format('update public.predictions set %I = $1::%s where id = $2 returning *', p_field,
                 case p_field when 'target_value' then 'numeric' when 'prediction_date' then 'date' when 'deadline' then 'date' else 'text' end)
    into v_row using p_value, p_prediction;
  perform set_config('agedtakes.correction_reason', '', true);
  insert into public.corrections (prediction_id, field, previous_text, corrected_text, reason, created_by)
  values (p_prediction, p_field, v_old, p_value, p_reason, auth.uid());
  return v_row;
end;
$$;

create or replace function public.correct_statement(p_statement uuid, p_field text, p_value text, p_reason text)
returns public.statements
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old text;
  v_row public.statements;
begin
  if not public.is_editor() then raise exception 'Not allowed' using errcode = 'insufficient_privilege'; end if;
  if p_field not in ('exact_quote', 'published_at', 'context') then raise exception 'That field cannot be corrected here'; end if;
  if coalesce(char_length(trim(p_reason)), 0) < 5 then raise exception 'A correction needs a reason'; end if;
  select to_jsonb(s) ->> p_field into v_old from public.statements s where id = p_statement for update;
  perform set_config('agedtakes.correction_reason', p_reason, true);
  execute format('update public.statements set %I = $1::%s, quote_verified_verbatim = case when %L = ''exact_quote'' then false else quote_verified_verbatim end where id = $2 returning *',
                 p_field, case p_field when 'published_at' then 'timestamptz' else 'text' end, p_field)
    into v_row using p_value, p_statement;
  perform set_config('agedtakes.correction_reason', '', true);
  insert into public.corrections (statement_id, field, previous_text, corrected_text, reason, created_by)
  values (p_statement, p_field, v_old, p_value, p_reason, auth.uid());
  return v_row;
end;
$$;

-- An editor confirms a proposed outcome (often proposed by the Prediction Resolution Agent). This is the only
-- path from an AI proposal to a resolved prediction.
create or replace function public.confirm_prediction_outcome(p_outcome uuid, p_outcome_text text, p_early_reason text default null)
returns public.predictions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_o public.prediction_outcomes;
  v_row public.predictions;
  v_status text;
begin
  if not public.is_editor() then raise exception 'Not allowed' using errcode = 'insufficient_privilege'; end if;
  select * into v_o from public.prediction_outcomes where id = p_outcome for update;
  if v_o.id is null or v_o.status <> 'proposed' then raise exception 'Outcome is not awaiting confirmation'; end if;
  if v_o.result = 'not_yet_resolvable' then raise exception 'This outcome says the prediction cannot be resolved yet'; end if;
  if v_o.evidence_source_id is null and v_o.result not in ('unscorable', 'disputed') then
    raise exception 'An outcome needs an evidence source before it can resolve a prediction';
  end if;
  v_status := case v_o.result when 'correct' then 'resolved_correct' when 'incorrect' then 'resolved_incorrect'
                              when 'partially_correct' then 'partially_correct' else v_o.result end;
  update public.prediction_outcomes set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_outcome;
  update public.prediction_outcomes set status = 'rejected' where prediction_id = v_o.prediction_id and status = 'proposed' and id <> p_outcome;
  update public.predictions set status = v_status, outcome = p_outcome_text, outcome_source_id = v_o.evidence_source_id,
         resolved_at = now(), early_resolution_reason = coalesce(p_early_reason, early_resolution_reason)
  where id = v_o.prediction_id returning * into v_row;
  return v_row;
end;
$$;

-- A proposed outcome (e.g. from the Prediction Resolution Agent) is only confirmed by a signed-in editor.
create or replace function public.enforce_outcome_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.in_seed_mode() then return new; end if;
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status <> 'confirmed') then
    if not (auth.uid() is not null and public.is_editor()) then
      raise exception 'Only a signed-in editor can confirm a prediction outcome' using errcode = 'insufficient_privilege';
    end if;
    new.confirmed_by := auth.uid();
    new.confirmed_at := now();
  end if;
  return new;
end;
$$;
create trigger prediction_outcomes_enforce_rules before insert or update on public.prediction_outcomes
  for each row execute function public.enforce_outcome_rules();

-- Newsletters may only contain published cases.
create or replace function public.guard_newsletter_issue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('sending', 'sent') and exists (
    select 1 from unnest(new.case_ids) as cid
    where not exists (select 1 from public.cases c where c.id = cid and c.status = 'published')) then
    raise exception 'A newsletter can only include published cases' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger newsletter_issues_guard before insert or update on public.newsletter_issues
  for each row execute function public.guard_newsletter_issue();

-- Audit every editorial table.
create trigger audit_people after insert or update or delete on public.people for each row execute function public.audit_row_change();
create trigger audit_statements after insert or update or delete on public.statements for each row execute function public.audit_row_change();
create trigger audit_predictions after insert or update or delete on public.predictions for each row execute function public.audit_row_change();
create trigger audit_prediction_outcomes after insert or update or delete on public.prediction_outcomes for each row execute function public.audit_row_change();
create trigger audit_evidence_sources after insert or update or delete on public.evidence_sources for each row execute function public.audit_row_change();
create trigger audit_case_evidence after insert or update or delete on public.case_evidence for each row execute function public.audit_row_change();
create trigger audit_corrections after insert on public.corrections for each row execute function public.audit_row_change();
create trigger audit_subject_responses after insert or update or delete on public.subject_responses for each row execute function public.audit_row_change();
create trigger audit_transactions after insert or update or delete on public.transactions for each row execute function public.audit_row_change();
create trigger audit_wallets after insert or update or delete on public.wallets for each row execute function public.audit_row_change();
create trigger audit_wallet_events after insert or update or delete on public.wallet_events for each row execute function public.audit_row_change();
create trigger audit_monitored_sources after insert or update or delete on public.monitored_sources for each row execute function public.audit_row_change();
create trigger audit_categories after insert or update or delete on public.categories for each row execute function public.audit_row_change();
create trigger audit_editorial_reviews after insert on public.editorial_reviews for each row execute function public.audit_row_change();
