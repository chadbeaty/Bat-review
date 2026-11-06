-- AGED TAKES — intake for the scheduled research agent (a Claude session that runs on the owner's subscription).
--
-- The agent never writes tables directly. It reads a brief, then hands each finding to agent_submit_research(),
-- which can only ever create internal, unverified records and a case in "needs_review". Every quotation must
-- appear word for word in the source text the agent captured, or it is rejected. Approval and publication stay
-- with a signed-in human editor (enforced by the existing triggers).
--
-- Neither function is callable by visitors or signed-in users: only the database owner / service role.

create or replace function public.agent_normalize(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')), '‘’‚‛“”„‟–—−  ', '''''''''""""---  '),
    '\s+', ' ', 'g'))
$$;

-- What to research: active and candidate people (never demo records), what is already on file for each,
-- and the editors' standing instructions (site setting "research_agent_brief", optional).
create or replace function public.agent_research_brief()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'instructions', (select value from public.site_settings where key = 'research_agent_brief'),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', p.slug, 'name', p.name, 'status', p.status, 'occupation', p.occupation, 'organization', p.organization,
        'cases_on_file', (select coalesce(jsonb_agg(jsonb_build_object('title', c.title, 'status', c.status) order by c.created_at desc), '[]'::jsonb)
                          from public.cases c where c.person_id = p.id),
        'sources_on_file', (select coalesce(jsonb_agg(distinct s.canonical_url), '[]'::jsonb)
                            from public.statements st join public.evidence_sources s on s.id = st.source_id
                            where st.person_id = p.id and s.canonical_url is not null)
      ) order by p.name)
      from public.people p
      where p.status in ('active', 'research_candidate') and not p.is_demo
    ), '[]'::jsonb),
    'agent_drafts_waiting_for_review', (select count(*) from public.cases where origin = 'ai' and status = 'needs_review' and not is_demo)
  )
$$;

-- Input shape (all text unless noted):
-- {
--   "person_slug": "...",
--   "case": { "title", "case_type", "summary", "what_happened", "limitations", "notes" },
--   "sources": [ { "key", "source_type", "title", "url", "publisher", "author", "published_at" (date), "is_primary" (bool),
--                  "text" (the page text exactly as fetched; at least the passage containing each quotation) } ],
--   "statements": [ { "source_key", "exact_quote", "statement_type", "asset_or_topic", "published_at" (date),
--                     "date_precision", "context", "summary" } ],
--   "evidence": [ { "source_key", "role", "what_it_proves", "what_it_does_not_prove", "limitations" } ],
--   "flags": [ "..." ]   -- anything the editor must double-check
-- }
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
  insert into public.cases (slug, person_id, primary_statement_id, title, summary, what_happened, limitations, case_type,
                            status, origin, ai_generated, ai_notes)
  values (
    v_slug, v_person.id, v_first_statement, left(v_title, 200), left(v_case ->> 'summary', 1200), left(v_case ->> 'what_happened', 8000),
    left(v_case ->> 'limitations', 8000),
    case when v_case ->> 'case_type' in ('prediction_aged_poorly', 'prediction_aged_well', 'did_they_sell', 'never_sell', 'broken_promise',
      'kept_promise', 'changed_position', 'followed_own_advice', 'other') then v_case ->> 'case_type' else 'other' end,
    'needs_review', 'ai', true,
    jsonb_build_object('agent', 'scheduled research agent', 'notes', v_case ->> 'notes', 'flags', coalesce(p -> 'flags', '[]'::jsonb),
                       'rejected', v_rejected, 'submitted_at', now()))
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

revoke execute on function public.agent_research_brief(), public.agent_submit_research(jsonb), public.agent_normalize(text)
  from public, anon, authenticated;

insert into public.site_settings (key, value, description)
values ('research_agent_brief', to_jsonb('Look for well-documented public predictions, promises and "never sell" pledges by the people listed, and what the public record shows happened afterwards. Prefer primary sources (the person''s own interview, post, filing or video transcript) and established outlets. Skip anything you cannot quote word for word.'::text),
        'Standing instructions for the scheduled research agent. Editors can change this text.')
on conflict (key) do nothing;
