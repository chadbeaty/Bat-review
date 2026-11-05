-- AGED TAKES — public read API. Each public page is served by one function that returns JSON.
-- All functions are SECURITY INVOKER: they run with the visitor's permissions, so Row Level Security decides
-- what is included. A visitor can never receive an unpublished case or internal statement through them.

create or replace function public.j_source(e public.evidence_sources)
returns jsonb language sql stable security invoker set search_path = public as $$
  select case when e.id is null then null else jsonb_build_object(
    'id', e.id, 'source_type', e.source_type, 'publisher', e.publisher, 'author', e.author, 'title', e.title,
    'canonical_url', e.canonical_url, 'archive_url', e.archive_url, 'published_at', e.published_at, 'collected_at', e.collected_at,
    'source_excerpt', e.source_excerpt, 'is_primary', e.is_primary, 'verification_status', e.verification_status,
    'reliability_notes', e.reliability_notes, 'is_demo', e.is_demo) end;
$$;

create or replace function public.j_person_card(p public.people)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'slug', p.slug, 'occupation', p.occupation, 'organization', p.organization,
    'image_url', p.image_url, 'image_credit', p.image_credit, 'is_demo', p.is_demo, 'follower_count', p.follower_count,
    'updated_at', p.updated_at,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'kind', c.kind) order by c.sort_order)
                            from public.person_categories pc join public.categories c on c.id = pc.category_id where pc.person_id = p.id), '[]'::jsonb),
    'cases_published', (select count(*) from public.cases c where c.person_id = p.id));
$$;

create or replace function public.j_case_card(c public.cases)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'title', c.title, 'summary', c.summary, 'case_type', c.case_type, 'status', c.status,
    'evidence_confidence', c.evidence_confidence, 'published_at', c.published_at, 'last_updated_at', c.last_updated_at,
    'is_demo', c.is_demo, 'is_sponsored', c.is_sponsored, 'social_graphic_text', c.social_graphic_text,
    'person', (select jsonb_build_object('name', p.name, 'slug', p.slug, 'image_url', p.image_url, 'occupation', p.occupation) from public.people p where p.id = c.person_id),
    'prediction_status', (select pr.status from public.predictions pr where pr.id = c.prediction_id),
    'quote', (select s.exact_quote from public.statements s where s.id = c.primary_statement_id));
$$;

create or replace function public.j_statement(s public.statements)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', s.id, 'exact_quote', s.exact_quote, 'normalized_summary', s.normalized_summary, 'statement_type', s.statement_type,
    'asset_or_topic', s.asset_or_topic, 'published_at', s.published_at, 'date_precision', s.date_precision,
    'source_timecode', s.source_timecode, 'context', s.context, 'conditions', s.conditions,
    'verification_status', s.verification_status, 'quote_verified_verbatim', s.quote_verified_verbatim, 'is_demo', s.is_demo,
    'source', (select public.j_source(e) from public.evidence_sources e where e.id = s.source_id),
    'person', (select jsonb_build_object('name', p.name, 'slug', p.slug) from public.people p where p.id = s.person_id),
    'cases', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'title', c.title)) from public.cases c where c.primary_statement_id = s.id), '[]'::jsonb));
$$;

create or replace function public.j_prediction(pr public.predictions)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', pr.id, 'prediction_text', pr.prediction_text, 'asset', pr.asset, 'target_value', pr.target_value,
    'target_currency', pr.target_currency, 'target_direction', pr.target_direction, 'prediction_date', pr.prediction_date,
    'deadline', pr.deadline, 'resolution_method', pr.resolution_method, 'resolution_criteria', pr.resolution_criteria,
    'price_provider', pr.price_provider, 'timezone', pr.timezone, 'status', pr.status, 'outcome', pr.outcome,
    'early_resolution_reason', pr.early_resolution_reason, 'resolved_at', pr.resolved_at, 'is_demo', pr.is_demo, 'updated_at', pr.updated_at,
    'person', (select jsonb_build_object('name', p.name, 'slug', p.slug, 'image_url', p.image_url) from public.people p where p.id = pr.person_id),
    'statement', (select jsonb_build_object('exact_quote', s.exact_quote, 'published_at', s.published_at, 'source_timecode', s.source_timecode,
                                            'source', (select public.j_source(e) from public.evidence_sources e where e.id = s.source_id))
                  from public.statements s where s.id = pr.statement_id),
    'outcome_source', (select public.j_source(e) from public.evidence_sources e where e.id = pr.outcome_source_id),
    'observation', (select jsonb_build_object('observed_value', o.observed_value, 'observed_currency', o.observed_currency, 'price_provider', o.price_provider,
                                              'asset_identifier', o.asset_identifier, 'timezone', o.timezone, 'observation_time', o.observation_time,
                                              'methodology', o.methodology, 'original_target', o.original_target)
                    from public.prediction_outcomes o where o.prediction_id = pr.id and o.status = 'confirmed' order by o.confirmed_at desc nulls last limit 1),
    'case_slug', (select c.slug from public.cases c where c.prediction_id = pr.id order by c.published_at desc nulls last limit 1));
$$;

-- Homepage ------------------------------------------------------------------------------------------------
create or replace function public.api_home()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'latest', coalesce((select jsonb_agg(public.j_case_card(c) order by c.published_at desc) from (select * from public.cases order by published_at desc limit 7) c), '[]'::jsonb),
    'aged_poorly', coalesce((select jsonb_agg(public.j_case_card(c) order by c.published_at desc) from (select * from public.cases where case_type in ('prediction_aged_poorly', 'broken_promise') order by published_at desc limit 4) c), '[]'::jsonb),
    'aged_well', coalesce((select jsonb_agg(public.j_case_card(c) order by c.published_at desc) from (select * from public.cases where case_type in ('prediction_aged_well', 'kept_promise') order by published_at desc limit 4) c), '[]'::jsonb),
    'did_they_sell', coalesce((select jsonb_agg(public.j_case_card(c) order by c.published_at desc) from (select * from public.cases where case_type = 'did_they_sell' or (case_type = 'never_sell') order by published_at desc limit 4) c), '[]'::jsonb),
    'never_sell', coalesce((select jsonb_agg(public.j_statement(s) order by s.published_at desc) from (select * from public.statements where statement_type = 'explicit_commitment' order by published_at desc limit 4) s), '[]'::jsonb),
    'resolved', coalesce((select jsonb_agg(public.j_prediction(p) order by p.resolved_at desc) from (select * from public.predictions where status <> 'open' and resolved_at is not null order by resolved_at desc limit 6) p), '[]'::jsonb),
    'trending', coalesce((select jsonb_agg(public.j_person_card(p) order by r.score desc, p.updated_at desc) from (
        select pe.id, pe.follower_count + 3 * (select count(*) from public.cases c where c.person_id = pe.id and c.published_at > now() - interval '180 days')
                     + (select count(*) from public.cases c where c.person_id = pe.id) as score
        from public.people pe order by score desc, pe.updated_at desc limit 6) r join public.people p on p.id = r.id), '[]'::jsonb),
    'has_demo', exists (select 1 from public.cases where is_demo) or exists (select 1 from public.people where is_demo),
    'counts', jsonb_build_object(
      'people', (select count(*) from public.people), 'cases', (select count(*) from public.cases),
      'predictions', (select count(*) from public.predictions)));
$$;

-- People --------------------------------------------------------------------------------------------------
create or replace function public.api_people(p_query text default null, p_category text default null, p_sort text default 'recent', p_limit integer default 24, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = public as $$
  with filtered as (
    select p.id, p.name, p.follower_count, p.updated_at, (select count(*) from public.cases c where c.person_id = p.id) as case_count
    from public.people p
    where (coalesce(trim(p_query), '') = '' or p.search @@ websearch_to_tsquery('english', p_query) or lower(p.name) like '%' || lower(trim(p_query)) || '%')
      and (p_category is null or exists (select 1 from public.person_categories pc join public.categories c on c.id = pc.category_id where pc.person_id = p.id and c.slug = p_category))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((select jsonb_agg(public.j_person_card(p) order by f.ord) from (
      select id, row_number() over (
        order by case when p_sort = 'investigated' then case_count end desc nulls last,
                 case when p_sort = 'followed' then follower_count end desc nulls last,
                 case when p_sort = 'name' then lower(name) end asc,
                 updated_at desc) as ord
      from filtered
      order by ord
      limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) f join public.people p on p.id = f.id), '[]'::jsonb));
$$;

create or replace function public.api_person(p_slug text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select case when p.id is null then null else jsonb_build_object(
    'person', public.j_person_card(p) || jsonb_build_object('biography', p.biography, 'website_url', p.website_url, 'image_license', p.image_license),
    'stats', (select to_jsonb(s) from public.person_stats s where s.person_id = p.id),
    'statements', coalesce((select jsonb_agg(public.j_statement(s) order by s.published_at desc) from public.statements s where s.person_id = p.id), '[]'::jsonb),
    'predictions', coalesce((select jsonb_agg(public.j_prediction(pr) order by pr.prediction_date desc) from public.predictions pr where pr.person_id = p.id), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(public.j_case_card(c) order by c.published_at desc) from public.cases c where c.person_id = p.id), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'asset', t.asset, 'transaction_type', t.transaction_type, 'owner', t.owner, 'quantity', t.quantity, 'amount', t.amount,
        'amount_low', t.amount_low, 'amount_high', t.amount_high, 'currency', t.currency, 'transaction_date', t.transaction_date,
        'disclosed_at', t.disclosed_at, 'filing_reference', t.filing_reference, 'notes', t.notes, 'is_demo', t.is_demo,
        'source', (select public.j_source(e) from public.evidence_sources e where e.id = t.source_id)) order by t.transaction_date desc)
      from public.transactions t where t.person_id = p.id), '[]'::jsonb),
    'wallets', coalesce((select jsonb_agg(jsonb_build_object(
        'id', w.id, 'chain', w.chain, 'address', w.address, 'label', w.label, 'attribution_status', w.attribution_status, 'notes', w.notes,
        'attribution_source', (select public.j_source(e) from public.evidence_sources e where e.id = w.attribution_source_id),
        'events', coalesce((select jsonb_agg(jsonb_build_object('tx_hash', we.tx_hash, 'event_type', we.event_type, 'asset', we.asset, 'amount', we.amount,
                   'counterparty_label', we.counterparty_label, 'occurred_at', we.occurred_at, 'notes', we.notes,
                   'source', (select public.j_source(e) from public.evidence_sources e where e.id = we.source_id)) order by we.occurred_at desc)
                 from public.wallet_events we where we.wallet_id = w.id), '[]'::jsonb)))
      from public.wallets w where w.attributed_person_id = p.id and w.attribution_status in ('claimed_by_subject', 'independently_verified')), '[]'::jsonb)
  ) end
  from (select 1) one left join public.people p on p.slug = p_slug;
$$;

-- Cases ---------------------------------------------------------------------------------------------------
create or replace function public.api_cases(
  p_query text default null, p_person text default null, p_category text default null, p_type text default null,
  p_confidence text default null, p_resolved text default null, p_from date default null, p_to date default null,
  p_limit integer default 20, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = public as $$
  with filtered as (
    select c.* from public.cases c
    join public.people p on p.id = c.person_id
    left join public.predictions pr on pr.id = c.prediction_id
    where (coalesce(trim(p_query), '') = '' or c.search @@ websearch_to_tsquery('english', p_query) or p.search @@ websearch_to_tsquery('english', p_query))
      and (p_person is null or p.slug = p_person)
      and (p_category is null or exists (select 1 from public.person_categories pc join public.categories cat on cat.id = pc.category_id where pc.person_id = p.id and cat.slug = p_category))
      and (p_type is null or c.case_type = p_type)
      and (p_confidence is null or c.evidence_confidence = p_confidence)
      and (p_resolved is null
           or (p_resolved = 'resolved' and c.status <> 'disputed' and (pr.id is null or pr.status <> 'open'))
           or (p_resolved = 'unresolved' and (c.status = 'disputed' or pr.status = 'open')))
      and (p_from is null or c.published_at >= p_from)
      and (p_to is null or c.published_at < p_to + 1)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((select jsonb_agg(public.j_case_card(f::public.cases) order by f.published_at desc)
                       from (select * from filtered order by published_at desc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) f), '[]'::jsonb));
$$;

create or replace function public.api_case(p_slug text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select case when c.id is null then null else jsonb_build_object(
    'case', jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'title', c.title, 'summary', c.summary, 'article_body', c.article_body, 'what_happened', c.what_happened,
      'limitations', c.limitations, 'case_type', c.case_type, 'status', c.status, 'evidence_confidence', c.evidence_confidence,
      'editorial_conclusion', c.editorial_conclusion, 'is_sponsored', c.is_sponsored, 'sponsor_disclosure', c.sponsor_disclosure,
      'methodology_version', c.methodology_version, 'social_headline', c.social_headline, 'social_post', c.social_post,
      'seo_description', c.seo_description, 'social_graphic_text', c.social_graphic_text, 'is_demo', c.is_demo, 'ai_generated', c.ai_generated,
      'published_at', c.published_at, 'last_updated_at', c.last_updated_at),
    'person', (select public.j_person_card(p) from public.people p where p.id = c.person_id),
    'statement', (select public.j_statement(s) from public.statements s where s.id = c.primary_statement_id),
    'prediction', (select public.j_prediction(pr) from public.predictions pr where pr.id = c.prediction_id),
    'evidence', coalesce((select jsonb_agg(jsonb_build_object(
        'role', ce.evidence_role, 'classification', ce.classification, 'notes', ce.notes, 'what_it_proves', ce.what_it_proves,
        'what_it_does_not_prove', ce.what_it_does_not_prove, 'limitations', ce.limitations, 'identity_established', ce.identity_established,
        'source', public.j_source(e)) order by ce.sort_order, e.published_at)
      from public.case_evidence ce join public.evidence_sources e on e.id = ce.evidence_source_id where ce.case_id = c.id), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(jsonb_build_object('occurred_at', t.occurred_at, 'date_precision', t.date_precision, 'label', t.label,
        'description', t.description, 'kind', t.kind, 'source', (select public.j_source(e) from public.evidence_sources e where e.id = t.evidence_source_id))
        order by t.occurred_at) from public.case_timeline_events t where t.case_id = c.id), '[]'::jsonb),
    'responses', coalesce((select jsonb_agg(jsonb_build_object('outreach_status', r.outreach_status, 'contact_method', r.contact_method,
        'contacted_at', r.contacted_at, 'response_deadline', r.response_deadline, 'response_text', r.response_text,
        'response_source', r.response_source, 'received_at', r.received_at) order by r.created_at desc)
      from public.subject_responses r where r.case_id = c.id), '[]'::jsonb),
    'corrections', coalesce((select jsonb_agg(jsonb_build_object('field', k.field, 'previous_text', k.previous_text, 'corrected_text', k.corrected_text,
        'reason', k.reason, 'created_at', k.created_at) order by k.created_at desc)
      from public.corrections k where k.case_id = c.id), '[]'::jsonb),
    'related', coalesce((select jsonb_agg(public.j_case_card(r) order by r.published_at desc) from (
        select * from public.cases r where r.id <> c.id and (r.person_id = c.person_id or r.case_type = c.case_type)
        order by (r.person_id = c.person_id) desc, r.published_at desc limit 3) r), '[]'::jsonb)
  ) end
  from (select 1) one left join public.cases c on c.slug = p_slug;
$$;

-- Predictions ---------------------------------------------------------------------------------------------
create or replace function public.api_predictions(p_status text default null, p_person text default null, p_query text default null, p_limit integer default 30, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = public as $$
  with filtered as (
    select pr.* from public.predictions pr join public.people p on p.id = pr.person_id
    where (p_status is null or pr.status = p_status)
      and (p_person is null or p.slug = p_person)
      and (coalesce(trim(p_query), '') = '' or pr.search @@ websearch_to_tsquery('english', p_query) or p.search @@ websearch_to_tsquery('english', p_query))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'counts', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.predictions group by status) x), '{}'::jsonb),
    'items', coalesce((select jsonb_agg(public.j_prediction(f::public.predictions) order by f.status = 'open', coalesce(f.resolved_at::date, f.deadline) desc nulls last)
                       from (select * from filtered order by status = 'open', coalesce(resolved_at::date, deadline) desc nulls last limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) f), '[]'::jsonb));
$$;

-- Never Sell ----------------------------------------------------------------------------------------------
create or replace function public.api_never_sell()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'commitments', coalesce((select jsonb_agg(public.j_statement(s) order by s.published_at desc) from public.statements s where s.statement_type = 'explicit_commitment'), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(public.j_case_card(c) order by c.published_at desc) from public.cases c where c.case_type in ('never_sell', 'did_they_sell', 'kept_promise', 'broken_promise')), '[]'::jsonb));
$$;

-- Corrections, filters, sitemap ---------------------------------------------------------------------------
create or replace function public.api_corrections(p_limit integer default 50, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total', (select count(*) from public.corrections),
    'items', coalesce((select jsonb_agg(x order by (x ->> 'created_at') desc) from (
      select jsonb_build_object('id', k.id, 'field', k.field, 'previous_text', k.previous_text, 'corrected_text', k.corrected_text, 'reason', k.reason, 'created_at', k.created_at,
        'case', (select jsonb_build_object('slug', c.slug, 'title', c.title, 'is_demo', c.is_demo) from public.cases c where c.id = k.case_id),
        'prediction', (select jsonb_build_object('text', pr.prediction_text, 'person_slug', p.slug, 'person_name', p.name) from public.predictions pr join public.people p on p.id = pr.person_id where pr.id = k.prediction_id),
        'statement', (select jsonb_build_object('quote', s.exact_quote, 'person_slug', p.slug, 'person_name', p.name) from public.statements s join public.people p on p.id = s.person_id where s.id = k.statement_id)) as x
      from public.corrections k order by k.created_at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) y), '[]'::jsonb));
$$;

create or replace function public.api_filters()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'kind', kind) order by kind, sort_order) from public.categories), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'name', name) order by name) from public.people), '[]'::jsonb),
    'methodology', coalesce((select jsonb_agg(jsonb_build_object('version', version, 'effective_at', effective_at, 'summary', summary) order by effective_at desc) from public.methodology_versions), '[]'::jsonb),
    'settings', coalesce((select jsonb_object_agg(key, value) from public.site_settings where is_public), '{}'::jsonb));
$$;

create or replace function public.api_sitemap()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    -- Demo records are fictional and never listed for search engines.
    'people', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'updated_at', updated_at)) from public.people where not is_demo), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'updated_at', last_updated_at)) from public.cases c where not c.is_demo and not exists (select 1 from public.people p where p.id = c.person_id and p.is_demo)), '[]'::jsonb));
$$;

grant execute on function public.api_home(), public.api_people(text, text, text, integer, integer), public.api_person(text),
  public.api_cases(text, text, text, text, text, text, date, date, integer, integer), public.api_case(text),
  public.api_predictions(text, text, text, integer, integer), public.api_never_sell(), public.api_corrections(integer, integer),
  public.api_filters(), public.api_sitemap() to anon, authenticated;
