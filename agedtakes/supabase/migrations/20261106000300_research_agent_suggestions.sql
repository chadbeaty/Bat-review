-- AGED TAKES — the research agent suggests answers for the legal checklist and the evidence confidence.
-- They are stored only as suggestions in ai_notes.suggestions. The review screen pre-ticks them, but nothing counts
-- (and the case cannot be approved) until a signed-in editor saves the checklist and the case themselves.

create or replace function public.agent_submit_research(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.people%rowtype;
  v_case jsonb := coalesce(p -> 'case', '{}'::jsonb);
  v_title text := btrim(v_case ->> 'title');
  v_src jsonb;
  v_st jsonb;
  v_ev jsonb;
  v_keys jsonb := '{}'::jsonb;      -- source key -> evidence_sources.id
  v_texts jsonb := '{}'::jsonb;     -- source key -> normalized text
  v_source_id uuid;
  v_text text;
  v_hash text;
  v_statement_id uuid;
  v_first_statement uuid;
  v_case_id uuid;
  v_slug text;
  v_kept integer := 0;
  v_rejected jsonb := '[]'::jsonb;
begin
  select * into v_person from public.people where slug = p ->> 'person_slug' and not is_demo;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown person_slug (or a demo record). Use a slug from agent_research_brief().');
  end if;
  if v_title is null or char_length(v_title) < 5 then
    return jsonb_build_object('ok', false, 'error', 'case.title is required');
  end if;
  if exists (select 1 from public.cases where person_id = v_person.id and lower(title) = lower(v_title)) then
    return jsonb_build_object('ok', false, 'skipped', true, 'error', 'A case with this title already exists for this person');
  end if;

  -- Sources: reuse a source already on file for the same URL; always keep the captured text as a snapshot.
  for v_src in select * from jsonb_array_elements(coalesce(p -> 'sources', '[]'::jsonb)) loop
    v_text := v_src ->> 'text';
    if v_src ->> 'key' is null or v_src ->> 'url' is null or coalesce(char_length(v_text), 0) < 40 then
      v_rejected := v_rejected || jsonb_build_object('source', v_src ->> 'key', 'reason', 'Each source needs a key, a url and the captured page text');
      continue;
    end if;
    v_hash := encode(sha256(convert_to(v_text, 'UTF8')), 'hex');
    select id into v_source_id from public.evidence_sources where canonical_url = v_src ->> 'url' limit 1;
    if v_source_id is null then
      insert into public.evidence_sources (source_type, publisher, author, title, canonical_url, published_at, source_excerpt,
                                           content_hash, is_primary, verification_status, reliability_notes)
      values (
        case when v_src ->> 'source_type' in ('video', 'podcast', 'social_post', 'article', 'interview', 'official_filing', 'congressional_disclosure',
          'senate_disclosure', 'sec_filing', 'earnings_call', 'press_release', 'official_website', 'newsletter', 'market_data', 'blockchain_record',
          'court_record', 'book', 'other') then v_src ->> 'source_type' else 'article' end,
        left(v_src ->> 'publisher', 200), left(v_src ->> 'author', 200),
        left(coalesce(nullif(btrim(v_src ->> 'title'), ''), v_src ->> 'url'), 400), v_src ->> 'url',
        (nullif(v_src ->> 'published_at', ''))::timestamptz, left(v_text, 4000), v_hash,
        coalesce((v_src ->> 'is_primary')::boolean, false), 'unverified',
        'Collected by the scheduled research agent. Check against the original before relying on it.')
      returning id into v_source_id;
    end if;
    insert into public.source_snapshots (evidence_source_id, content_text, content_hash, fetched_from)
    values (v_source_id, v_text, v_hash, v_src ->> 'url')
    on conflict (evidence_source_id, content_hash) do nothing;
    v_keys := v_keys || jsonb_build_object(v_src ->> 'key', v_source_id);
    v_texts := v_texts || jsonb_build_object(v_src ->> 'key', public.agent_normalize(v_text));
    v_source_id := null;
  end loop;

  -- Statements: kept only if the quotation is found word for word in the captured text of its source.
  for v_st in select * from jsonb_array_elements(coalesce(p -> 'statements', '[]'::jsonb)) loop
    if not (v_keys ? (v_st ->> 'source_key')) then
      v_rejected := v_rejected || jsonb_build_object('quote', left(v_st ->> 'exact_quote', 120), 'reason', 'source_key does not match a stored source');
      continue;
    end if;
    if char_length(public.agent_normalize(v_st ->> 'exact_quote')) < 12
       or position(public.agent_normalize(v_st ->> 'exact_quote') in (v_texts ->> (v_st ->> 'source_key'))) = 0 then
      v_rejected := v_rejected || jsonb_build_object('quote', left(v_st ->> 'exact_quote', 120), 'reason', 'Not found word for word in the captured source text');
      continue;
    end if;
    insert into public.statements (person_id, exact_quote, normalized_summary, statement_type, asset_or_topic, published_at,
                                   date_precision, source_id, context, verification_status, quote_verified_verbatim,
                                   visibility, extraction_notes)
    values (
      v_person.id, btrim(v_st ->> 'exact_quote'), left(v_st ->> 'summary', 1000),
      case when v_st ->> 'statement_type' in ('opinion', 'prediction', 'explicit_commitment', 'documented_action', 'factual_claim', 'other')
           then v_st ->> 'statement_type' else 'other' end,
      left(v_st ->> 'asset_or_topic', 120), (nullif(v_st ->> 'published_at', ''))::timestamptz,
      case when v_st ->> 'date_precision' in ('exact', 'day', 'month', 'year', 'unknown') then v_st ->> 'date_precision' else 'unknown' end,
      (v_keys ->> (v_st ->> 'source_key'))::uuid, left(v_st ->> 'context', 4000), 'unverified', true, 'internal',
      'Found word for word in the text the research agent captured. Confirm against the original source before approving.')
    returning id into v_statement_id;
    v_first_statement := coalesce(v_first_statement, v_statement_id);
    v_kept := v_kept + 1;
  end loop;

  if v_kept = 0 then
    return jsonb_build_object('ok', false, 'error', 'No quotation was found word for word in its source, so no draft was created', 'rejected', v_rejected);
  end if;

  v_slug := left(btrim(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), '-'), 70) || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
  insert into public.cases (slug, person_id, primary_statement_id, title, summary, what_happened, limitations, article_body,
                            seo_description, social_headline, case_type, status, origin, ai_generated, ai_notes)
  values (
    v_slug, v_person.id, v_first_statement, left(v_title, 200), left(v_case ->> 'summary', 1200), left(v_case ->> 'what_happened', 8000),
    left(v_case ->> 'limitations', 8000), left(v_case ->> 'article_body', 60000), left(v_case ->> 'seo_description', 300),
    left(v_case ->> 'social_headline', 200),
    case when v_case ->> 'case_type' in ('prediction_aged_poorly', 'prediction_aged_well', 'did_they_sell', 'never_sell', 'broken_promise',
      'kept_promise', 'changed_position', 'followed_own_advice', 'other') then v_case ->> 'case_type' else 'other' end,
    'needs_review', 'ai', true,
    jsonb_build_object('agent', 'scheduled research agent', 'notes', v_case ->> 'notes', 'flags', coalesce(p -> 'flags', '[]'::jsonb),
                       'rejected', v_rejected, 'submitted_at', now(),
                       'suggestions', jsonb_build_object(
                         'legal', (select coalesce(jsonb_object_agg(k, jsonb_build_object('ok', coalesce((x ->> 'ok')::boolean, false), 'reason', left(x ->> 'reason', 500))), '{}'::jsonb)
                                   from jsonb_each(case when jsonb_typeof(p -> 'suggestions' -> 'legal') = 'object' then p -> 'suggestions' -> 'legal' else '{}'::jsonb end) as e(k, x)
                                   where k = any (public.legal_checklist_items()) and jsonb_typeof(x) = 'object'),
                         'confidence', case when p -> 'suggestions' -> 'confidence' ->> 'level' in ('verified', 'strong', 'unconfirmed', 'disputed')
                                            then jsonb_build_object('level', p -> 'suggestions' -> 'confidence' ->> 'level', 'reason', left(p -> 'suggestions' -> 'confidence' ->> 'reason', 500))
                                            else null end)))
  returning id into v_case_id;

  for v_ev in select * from jsonb_array_elements(coalesce(p -> 'evidence', '[]'::jsonb)) loop
    if v_keys ? (v_ev ->> 'source_key') then
      insert into public.case_evidence (case_id, evidence_source_id, evidence_role, what_it_proves, what_it_does_not_prove, limitations, classification)
      values (v_case_id, (v_keys ->> (v_ev ->> 'source_key'))::uuid,
              case when v_ev ->> 'role' in ('original_statement', 'outcome', 'supporting', 'contradicting', 'context', 'disclosure', 'market_data', 'subject_response')
                   then v_ev ->> 'role' else 'supporting' end,
              v_ev ->> 'what_it_proves', v_ev ->> 'what_it_does_not_prove', v_ev ->> 'limitations', 'unconfirmed')
      on conflict do nothing;
    end if;
  end loop;
  -- Make sure the source of every kept quotation is attached to the case.
  insert into public.case_evidence (case_id, evidence_source_id, evidence_role, classification)
  select distinct v_case_id, st.source_id, 'original_statement', 'unconfirmed'
  from public.statements st where st.id = v_first_statement and st.source_id is not null
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'case_id', v_case_id, 'slug', v_slug, 'statements_kept', v_kept, 'rejected', v_rejected,
                            'review_url_path', '/admin/cases/' || v_case_id);
end;
$$;

revoke execute on function public.agent_submit_research(jsonb) from public, anon, authenticated;
