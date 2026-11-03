-- Bats only at launch, plus the extra shop filters (length, newly listed, accepts offers).
-- Additive. Never edit older migrations.

-- 1. Site setting: only bats are shown while this is true. Owner switches it off in Admin > Settings to bring the other categories back.
insert into public.site_settings (key, value, description, is_public) values
  ('bats_only_mode', 'true', 'Show only bats (hide gloves, bags, cleats and other categories everywhere). Turn off to bring every category back', true)
on conflict (key) do nothing;

create or replace function public.validate_launch_settings()
returns trigger
language plpgsql
as $$
begin
  if new.key = 'bats_only_mode' and jsonb_typeof(new.value) <> 'boolean' then
    raise exception 'Setting % must be true or false', new.key using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists site_settings_validate_launch on public.site_settings;
create trigger site_settings_validate_launch before insert or update on public.site_settings
  for each row execute function public.validate_launch_settings();

-- 2. search_listings gains length, newly-listed and accepts-offers filters and returns accepts_offers.
-- The return type changes, so the old function is dropped first; existing named-argument callers keep working.
drop function if exists public.search_listings(text[], text, text[], text, integer, integer, integer, text, numeric[], text[], integer[], text[], numeric, jsonb, uuid, text, integer, integer);

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
  p_offset integer default 0,
  p_min_length numeric default null,
  p_max_length numeric default null,
  p_new_days integer default null,
  p_accepts_offers boolean default null,
  p_dual_stamp boolean default null
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
  accepts_offers boolean,
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
      l.id, l.title, l.asking_price_cents, l.condition_score, l.location_city, l.location_state, l.published_at, l.accepts_offers,
      search_normalize(concat_ws(' ',
        l.title, l.description, p.product_name, p.model_name, array_to_string(p.aliases, ' '),
        m.name, array_to_string(m.aliases, ' '), c.name,
        l.attributes ->> 'weighting_type', l.attributes ->> 'construction_type',
        -- The seller's stamps when given (they describe this bat), otherwise the catalog model's.
        array_to_string(case when cardinality(jsonb_text_list(l.attributes -> 'certification')) > 0
          then jsonb_text_list(l.attributes -> 'certification') else p.certification_association end, ' '),
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
      and (p_min_length is null or jsonb_numeric(l.attributes -> 'length_inches') >= p_min_length)
      and (p_max_length is null or jsonb_numeric(l.attributes -> 'length_inches') <= p_max_length)
      and (p_new_days is null or l.published_at >= now() - make_interval(days => p_new_days))
      and (p_accepts_offers is not true or l.accepts_offers)
      and (p_dual_stamp is not true or cardinality(case when cardinality(jsonb_text_list(l.attributes -> 'certification')) > 0
            then jsonb_text_list(l.attributes -> 'certification') else coalesce(p.certification_association, '{}') end) >= 2)
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
    img.image_url, img.alt_text, mt.accepts_offers, mt.relevance,
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

revoke all on function public.search_listings(text[], text, text[], text, integer, integer, integer, text, numeric[], text[], integer[], text[], numeric, jsonb, uuid, text, integer, integer, numeric, numeric, integer, boolean, boolean) from public;
grant execute on function public.search_listings(text[], text, text[], text, integer, integer, integer, text, numeric[], text[], integer[], text[], numeric, jsonb, uuid, text, integer, integer, numeric, numeric, integer, boolean, boolean) to anon, authenticated, service_role;
