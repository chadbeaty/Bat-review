-- Shop search: one parameterized search used by every browse page, facet counts, did-you-mean suggestions,
-- and a server-only view counter. Additive and safe to re-run.
--
-- Search functions are SECURITY INVOKER, so Row Level Security and column privileges apply to the visitor:
-- only granted listing columns are read, unpublished catalog entries never join, and drafts are never returned
-- (the function also filters to active listings explicitly).

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Text normalization. Mirrored by normalizeSearchText() in src/lib/search.ts; tests check they agree.
-- ---------------------------------------------------------------------------
create or replace function public.search_normalize(t text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(lower(coalesce(t, '')),
      '\mend[[:space:]_-]*load(ed|s)?\M', 'endload', 'g'),
      '\mmid[[:space:]_-]*load(ed|s)?\M', 'midload', 'g'),
      '\m(one|1|single)[[:space:]_-]*(piece|pc)\M', '1pc', 'g'),
      '\m(two|2)[[:space:]_-]*(piece|pc)\M', '2pc', 'g'),
      '\masa\M', 'usa', 'g'),
      '[^a-z0-9.]+', ' ', 'g'),
    '[[:space:]]+', ' ', 'g'));
$$;

-- Numbers stored by sellers in listing attributes, read safely (a bad value never breaks a search).
create or replace function public.jsonb_numeric(v jsonb)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
    when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
    when jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' then (v #>> '{}')::numeric
  end;
$$;

-- A listing attribute as a list of strings, whether the seller stored one value or an array.
create or replace function public.jsonb_text_list(v jsonb)
returns text[]
language sql
immutable
parallel safe
as $$
  select case jsonb_typeof(v)
    when 'array' then array(select jsonb_array_elements_text(v))
    when 'string' then array[v #>> '{}']
    when 'number' then array[v #>> '{}']
    else '{}'::text[]
  end;
$$;

-- ---------------------------------------------------------------------------
-- search_listings
-- p_terms are already-normalized words (see parseSearchParams in src/lib/search.ts). Each term must match:
-- either as a substring of the listing's searchable text (partial words) or, for terms of four or more
-- characters, by trigram word similarity (misspellings).
-- ---------------------------------------------------------------------------
create or replace function public.search_listings(
  p_terms text[] default null,
  p_category text default null,
  p_manufacturers text[] default null,
  p_product text default null,
  p_price_min integer default null,
  p_price_max integer default null,
  p_min_condition integer default null,
  p_state text default null,
  p_weights numeric[] default null,
  p_certifications text[] default null,
  p_model_years integer[] default null,
  p_weighting text[] default null,
  p_min_rating numeric default null,
  p_attributes jsonb default null,
  p_seller_id uuid default null,
  p_sort text default 'newest',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  asking_price_cents integer,
  condition_score smallint,
  location_city text,
  location_state text,
  published_at timestamptz,
  image_url text,
  image_alt text,
  relevance real,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with candidates as (
    select
      l.id, l.title, l.asking_price_cents, l.condition_score, l.location_city, l.location_state, l.published_at,
      search_normalize(concat_ws(' ',
        l.title, l.description, p.product_name, p.model_name, array_to_string(p.aliases, ' '),
        m.name, array_to_string(m.aliases, ' '), c.name,
        l.attributes ->> 'weighting_type', l.attributes ->> 'construction_type',
        array_to_string(jsonb_text_list(l.attributes -> 'certification'), ' '),
        array_to_string(p.certification_association, ' '),
        coalesce(l.attributes ->> 'model_year', p.model_year::text)
      )) as doc
    from equipment_listings l
    join product_categories c on c.id = l.category_id
    join profiles s on s.id = l.seller_id and s.account_status = 'active'
    left join products p on p.id = l.product_id
    left join manufacturers m on m.id = coalesce(l.manufacturer_id, p.manufacturer_id)
    left join seller_public_stats st on p_min_rating is not null and st.user_id = l.seller_id
    where l.listing_status = 'active'
      and (l.expires_at is null or l.expires_at > now())
      and (p_category is null or c.slug = p_category)
      and (p_manufacturers is null or cardinality(p_manufacturers) = 0 or m.slug = any (p_manufacturers))
      and (p_product is null or p.slug = p_product)
      and (p_price_min is null or l.asking_price_cents >= p_price_min)
      and (p_price_max is null or l.asking_price_cents <= p_price_max)
      and (p_min_condition is null or l.condition_score >= p_min_condition)
      and (p_state is null or l.location_state = p_state)
      and (p_weights is null or cardinality(p_weights) = 0 or jsonb_numeric(l.attributes -> 'weight_oz') = any (p_weights))
      and (p_certifications is null or cardinality(p_certifications) = 0
        or (case when cardinality(jsonb_text_list(l.attributes -> 'certification')) > 0
              then jsonb_text_list(l.attributes -> 'certification')
              else coalesce(p.certification_association, '{}') end) && p_certifications)
      and (p_model_years is null or cardinality(p_model_years) = 0
        or coalesce(jsonb_numeric(l.attributes -> 'model_year'), p.model_year) = any (p_model_years))
      and (p_weighting is null or cardinality(p_weighting) = 0 or (l.attributes ->> 'weighting_type') = any (p_weighting))
      and (p_min_rating is null or st.average_rating >= p_min_rating)
      and (p_seller_id is null or l.seller_id = p_seller_id)
      and (p_attributes is null or not exists (
        select 1 from jsonb_each(p_attributes) f
        where jsonb_typeof(f.value) = 'array' and jsonb_array_length(f.value) > 0
          and not (jsonb_text_list(l.attributes -> f.key) && array(select jsonb_array_elements_text(f.value)))
      ))
  ),
  matched as (
    select cand.*,
      coalesce((
        select sum(case when strpos(cand.doc, t) > 0 then 1.0 else word_similarity(t, cand.doc) end)
        from unnest(p_terms) t
      ), 0)::real as relevance
    from candidates cand
    where p_terms is null or not exists (
      select 1 from unnest(p_terms) t
      where t <> '' and not (strpos(cand.doc, t) > 0 or (char_length(t) >= 4 and word_similarity(t, cand.doc) >= 0.5))
    )
  )
  select
    mt.id, mt.title, mt.asking_price_cents, mt.condition_score, mt.location_city, mt.location_state, mt.published_at,
    img.image_url, img.alt_text, mt.relevance,
    count(*) over () as total_count
  from matched mt
  left join lateral (
    select i.image_url, i.alt_text from listing_images i
    where i.listing_id = mt.id
    order by i.display_order, i.uploaded_at
    limit 1
  ) img on true
  order by
    case when p_sort = 'price_asc' then mt.asking_price_cents end asc,
    case when p_sort = 'price_desc' then mt.asking_price_cents end desc,
    case when p_sort = 'condition' then mt.condition_score end desc nulls last,
    case when p_sort = 'best' then mt.relevance end desc,
    mt.published_at desc nulls last,
    mt.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_listings(text[], text, text[], text, integer, integer, integer, text, numeric[], text[], integer[], text[], numeric, jsonb, uuid, text, integer, integer) from public;
grant execute on function public.search_listings(text[], text, text[], text, integer, integer, integer, text, numeric[], text[], integer[], text[], numeric, jsonb, uuid, text, integer, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Facets: which filter values have active listings in a category (or in all categories), with counts.
-- ---------------------------------------------------------------------------
create or replace function public.search_listing_facets(p_category text default null)
returns table (facet text, value text, listings bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with live as (
    select l.attributes, l.location_state, m.slug as manufacturer, m.name as manufacturer_name, c.slug as category,
      p.model_year, p.certification_association
    from equipment_listings l
    join product_categories c on c.id = l.category_id
    join profiles s on s.id = l.seller_id and s.account_status = 'active'
    left join products p on p.id = l.product_id
    left join manufacturers m on m.id = coalesce(l.manufacturer_id, p.manufacturer_id)
    where l.listing_status = 'active'
      and (l.expires_at is null or l.expires_at > now())
      and (p_category is null or c.slug = p_category)
  )
  select 'category', category, count(*) from live group by category
  union all
  select 'manufacturer', manufacturer, count(*) from live where manufacturer is not null group by manufacturer
  union all
  select 'state', location_state, count(*) from live where location_state is not null group by location_state
  union all
  select 'weight', jsonb_numeric(attributes -> 'weight_oz')::text, count(*) from live
    where jsonb_numeric(attributes -> 'weight_oz') is not null group by 1, 2
  union all
  select 'year', coalesce(jsonb_numeric(attributes -> 'model_year'), model_year)::text, count(*) from live
    where coalesce(jsonb_numeric(attributes -> 'model_year'), model_year) is not null group by 1, 2
  union all
  select 'certification', cert, count(*) from live,
    unnest(case when cardinality(jsonb_text_list(attributes -> 'certification')) > 0
      then jsonb_text_list(attributes -> 'certification') else coalesce(certification_association, '{}') end) as cert
    group by cert
  union all
  select 'weighting', attributes ->> 'weighting_type', count(*) from live where attributes ? 'weighting_type' group by 2;
$$;

revoke all on function public.search_listing_facets(text) from public;
grant execute on function public.search_listing_facets(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Did-you-mean, from the published catalog only.
-- search_spelling: for each search word that isn't a catalog word, the closest catalog word (brand, alias
-- or model word). Aliases map to their brand, so "demarni" suggests "demarini".
-- search_suggestions: catalog models that look like the whole query.
-- ---------------------------------------------------------------------------
create or replace function public.search_spelling(p_terms text[])
returns table (term text, suggestion text, score real)
language sql
stable
security invoker
set search_path = public
as $$
  with vocab as (
    select distinct w as word, w as canonical
    from products p, regexp_split_to_table(search_normalize(p.model_name), ' ') w
    where p.catalog_status = 'published' and char_length(w) >= 3 and w !~ '^[0-9.]+$'
    union
    select distinct w, w
    from manufacturers m, regexp_split_to_table(search_normalize(m.name), ' ') w
    where m.slug <> 'other' and char_length(w) >= 3
    union
    select distinct search_normalize(a), search_normalize(m.name)
    from manufacturers m, unnest(m.aliases) a
    where m.slug <> 'other'
  )
  select t.term, best.canonical, best.score
  from unnest(p_terms) as t(term)
  cross join lateral (
    select v.canonical, similarity(t.term, v.word)::real as score
    from vocab v
    where similarity(t.term, v.word) >= 0.3
    order by similarity(t.term, v.word) desc, v.canonical
    limit 1
  ) best
  where char_length(t.term) >= 3
    and t.term !~ '^[0-9.]+$'
    and not exists (select 1 from vocab v where v.word = t.term and v.canonical = t.term)
    and best.canonical <> t.term;
$$;

revoke all on function public.search_spelling(text[]) from public;
grant execute on function public.search_spelling(text[]) to anon, authenticated, service_role;

create or replace function public.search_suggestions(p_query text, p_limit integer default 5)
returns table (suggestion text, product_slug text, score real)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (select search_normalize(p_query) as text)
  select trim(concat_ws(' ', m.name, p.model_name)), p.slug,
    word_similarity((select text from q), search_normalize(concat_ws(' ', m.name, array_to_string(m.aliases, ' '), p.model_name)))::real
  from products p
  left join manufacturers m on m.id = p.manufacturer_id
  where p.catalog_status = 'published'
    and char_length((select text from q)) >= 3
    and word_similarity((select text from q), search_normalize(concat_ws(' ', m.name, array_to_string(m.aliases, ' '), p.model_name))) >= 0.4
  order by 3 desc, p.model_year desc nulls last, 1
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

revoke all on function public.search_suggestions(text, integer) from public;
grant execute on function public.search_suggestions(text, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- View counter. Called only by server code with the service role, which applies a per-visitor cookie limit.
-- ---------------------------------------------------------------------------
create or replace function public.increment_listing_views(p_listing_id uuid)
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  update public.equipment_listings set views_count = views_count + 1
  where id = p_listing_id and listing_status = 'active'
  returning views_count;
$$;

revoke all on function public.increment_listing_views(uuid) from public, anon, authenticated;
grant execute on function public.increment_listing_views(uuid) to service_role;
