-- New bat signals: product lineage, release dates and review maturity, "first swings" owner reports,
-- a public durability tracker and review alerts. New models have no reviews yet; these give shoppers
-- honest early information (what it replaces, how many owners have reported, what they report) without
-- inventing any numbers. Every count shown comes from rows in this database.

-- ---------------------------------------------------------------------------
-- Settings (also in seed.sql for fresh installs; on conflict keeps any value already changed in production)
-- ---------------------------------------------------------------------------

insert into public.site_settings (key, value, description, is_public) values
  ('new_release_window_days', '120', 'Days after release during which a model counts as a new release', true),
  ('early_report_threshold', '5', 'Owners with published reports needed before a new release shows as having early reports', true),
  ('durability_min_owners', '3', 'Owners with published reports needed before a model appears in the durability tracker', true),
  ('owner_report_interval_days', '7', 'Minimum days between two owner reports by the same member on the same model', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Release info on products. Both stay empty until someone knows: unknown is not the same as old.
-- ---------------------------------------------------------------------------

alter table public.products
  add column release_date date check (release_date between date '1980-01-01' and date '2100-12-31'),
  add column release_status text check (release_status in ('announced', 'pre_order', 'released'));

create index products_release_date_idx on public.products (release_date) where release_date is not null;

-- ---------------------------------------------------------------------------
-- Product lineage: how a model relates to earlier or sibling models, so a new bat can point shoppers to
-- reviews of the bat it replaces. Read as "related_product_id is the <relation> of product_id".
-- Written by the server or staff only; members suggest changes through product_submissions.
-- ---------------------------------------------------------------------------

create table public.product_lineage (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  related_product_id uuid not null references public.products (id) on delete cascade,
  relation text not null check (relation in ('predecessor', 'same_platform', 'variant')),
  confidence text not null default 'low' check (confidence in ('high', 'medium', 'low')),
  -- Why we believe the link, e.g. "Manufacturer says the 2026 barrel is unchanged from 2025".
  basis text not null check (char_length(basis) between 3 and 1000),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  verified boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (product_id <> related_product_id)
);

-- One row per pair and relation, in either direction: stops A-B plus B-A duplicates of the symmetric
-- relations, and two models each claiming to be the other's predecessor.
create unique index product_lineage_pair_uniq on public.product_lineage (
  least(product_id, related_product_id), greatest(product_id, related_product_id), relation);
create index product_lineage_product_idx on public.product_lineage (product_id);
create index product_lineage_related_idx on public.product_lineage (related_product_id);

-- ---------------------------------------------------------------------------
-- Owner reports ("first swings"). A member can check in on the same bat over time; each check-in is a
-- separate, dated row so durability can be followed. Ownership is verified only by the server.
-- ---------------------------------------------------------------------------

create table public.owner_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  weight_oz numeric(4, 1) check (weight_oz between 18 and 40),
  -- Approximate. The form offers buckets and stores each bucket's lower bound.
  hits_so_far integer check (hits_so_far between 0 and 100000),
  still_breaking_in boolean,
  typical_temperature_f smallint check (typical_temperature_f between -20 and 120),
  ball_type text not null default 'unknown' check (ball_type in ('52/300', '44/375', '40/325', 'other', 'unknown')),
  pop_vs_previous_gamer text not null default 'not_sure' check (pop_vs_previous_gamer in ('better', 'same', 'worse', 'not_sure')),
  previous_gamer_product_id uuid references public.products (id) on delete set null,
  previous_gamer_text text check (char_length(previous_gamer_text) between 2 and 120),
  sting smallint check (sting between 1 and 5),
  sound text check (char_length(sound) <= 40),
  durability_status text not null default 'intact'
    check (durability_status in ('intact', 'dented', 'cracked', 'rattle', 'returned_warranty')),
  notes text check (char_length(notes) <= 1000),
  -- True only when the server has evidence: a completed marketplace order for this model, or staff
  -- checked the proof photo. ownership_verified_via records which.
  ownership_verified boolean not null default false,
  ownership_verified_via text check (ownership_verified_via in ('marketplace_order', 'staff_photo_review')),
  -- Path in the private ownership-proof bucket, under the member's own folder.
  proof_photo_path text check (char_length(proof_photo_path) <= 300),
  status text not null default 'published' check (status in ('published', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  check (ownership_verified = (ownership_verified_via is not null)),
  check (previous_gamer_product_id is null or previous_gamer_text is null),
  check (previous_gamer_product_id is distinct from product_id)
);

create index owner_reports_product_idx on public.owner_reports (product_id, status, created_at desc);
create index owner_reports_user_product_idx on public.owner_reports (user_id, product_id, created_at desc);

-- True when the member bought this model through a completed marketplace order.
create or replace function public.bought_through_marketplace(p_user_id uuid, p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.buyer_id = p_user_id and o.order_status = 'completed' and oi.product_id = p_product_id
  );
$$;
-- Only triggers use it; members must not probe other people's purchases.
revoke execute on function public.bought_through_marketplace(uuid, uuid) from public, anon, authenticated;

-- Fills in server-owned fields, enforces the check-in interval and verifies ownership from orders.
create or replace function public.prepare_owner_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  interval_days integer := coalesce(
    (select (value #>> '{}')::int from public.site_settings where key = 'owner_report_interval_days'), 7);
begin
  -- Column privileges already stop members sending these; this keeps the rule even if grants change.
  if public.is_end_user() then
    new.ownership_verified := false;
    new.ownership_verified_via := null;
    new.status := 'published';
    new.created_at := now();
  end if;

  if new.proof_photo_path is not null and split_part(new.proof_photo_path, '/', 1) <> new.user_id::text then
    raise exception 'Proof photos must be uploaded to your own folder' using errcode = '42501';
  end if;

  -- Serialise check-ins per member and model so two quick submissions cannot both pass the check below.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.product_id::text, 0));
  if exists (
    select 1 from public.owner_reports r
    where r.user_id = new.user_id and r.product_id = new.product_id
      and r.created_at > new.created_at - make_interval(days => interval_days)
      and r.created_at < new.created_at + make_interval(days => interval_days)
  ) then
    raise exception 'You can check in on this bat once every % days', interval_days using errcode = '54000';
  end if;

  if not new.ownership_verified and public.bought_through_marketplace(new.user_id, new.product_id) then
    new.ownership_verified := true;
    new.ownership_verified_via := 'marketplace_order';
  end if;
  return new;
end;
$$;

create trigger owner_reports_prepare before insert on public.owner_reports
  for each row execute function public.prepare_owner_report();

-- When an order completes, reports the buyer already filed for those models become verified.
create or replace function public.verify_owner_reports_for_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.owner_reports r
  set ownership_verified = true, ownership_verified_via = 'marketplace_order'
  where r.user_id = new.buyer_id
    and not r.ownership_verified
    and r.product_id in (select oi.product_id from public.order_items oi where oi.order_id = new.id);
  return null;
end;
$$;

create trigger orders_verify_owner_reports after update of order_status on public.orders
  for each row when (new.order_status = 'completed' and old.order_status is distinct from 'completed')
  execute function public.verify_owner_reports_for_order();

-- A refunded or cancelled order no longer proves ownership. Reports verified through a marketplace order lose
-- the mark unless the member has another completed order for that model. Staff photo checks are kept.
create or replace function public.unverify_owner_reports_for_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.owner_reports r
  set ownership_verified = false, ownership_verified_via = null
  where r.user_id = new.buyer_id
    and r.ownership_verified_via = 'marketplace_order'
    and r.product_id in (select oi.product_id from public.order_items oi where oi.order_id = new.id)
    and not exists (
      select 1 from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.buyer_id = new.buyer_id and o.order_status = 'completed' and o.id <> new.id and oi.product_id = r.product_id
    );
  return null;
end;
$$;

create trigger orders_unverify_owner_reports after update of order_status on public.orders
  for each row when (new.order_status in ('refunded', 'cancelled') and old.order_status is distinct from new.order_status)
  execute function public.unverify_owner_reports_for_order();

-- ---------------------------------------------------------------------------
-- Review alerts: "tell me when this bat gets its first review / enough early reports / its first listing".
-- The server's notifier reads these and sets last_notified_at.
-- ---------------------------------------------------------------------------

create table public.review_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  notify_on text not null check (notify_on in ('first_published_review', 'early_reports_threshold', 'first_listing')),
  created_at timestamptz not null default now(),
  last_notified_at timestamptz,
  unique (user_id, product_id, notify_on)
);

create index review_alerts_product_idx on public.review_alerts (product_id, notify_on);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.product_lineage enable row level security;
alter table public.owner_reports enable row level security;
alter table public.review_alerts enable row level security;

-- Lineage is public when both models are public. No write policies: only the server writes it.
create policy "Lineage between published products is public" on public.product_lineage
  for select using (
    (exists (select 1 from public.products p where p.id = product_id and p.catalog_status = 'published')
      and exists (select 1 from public.products p where p.id = related_product_id and p.catalog_status = 'published'))
    or public.has_role('moderator'));

-- Members may send only the report itself. Verification, status and the date are set by the database.
revoke insert, update, delete on public.owner_reports from anon, authenticated;
grant insert (
  product_id, user_id, weight_oz, hits_so_far, still_breaking_in, typical_temperature_f, ball_type, pop_vs_previous_gamer,
  previous_gamer_product_id, previous_gamer_text, sting, sound, durability_status, notes, proof_photo_path
) on public.owner_reports to authenticated;

create policy "Published owner reports are public; owners and moderators see the rest" on public.owner_reports
  for select using (status = 'published' or user_id = (select auth.uid()) or public.has_role('moderator'));
create policy "Members file their own reports on published bats" on public.owner_reports
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.products p where p.id = product_id and p.catalog_status = 'published')
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_status = 'active')
  );

create policy "Own review alerts" on public.review_alerts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.products p where p.id = product_id));

-- ---------------------------------------------------------------------------
-- Public views. Like seller_public_stats they run with the owner's rights, so each one filters to
-- published rows itself and returns aggregates only.
-- ---------------------------------------------------------------------------

-- Review maturity of every published model:
--   new_release   announced, on pre-order, or released within new_release_window_days, with fewer than
--                 early_report_threshold owners reporting
--   early_reports still inside that window, with at least early_report_threshold owners reporting
--   established   released longer ago than the window, with at least early_report_threshold owners reporting
--   limited_data  released longer ago than the window, but too few owners have reported to say much
--   null          no release date or status recorded, so we don't claim either way
-- "Owners reporting" counts distinct members with a published report, so check-ins don't inflate it.
create view public.product_review_maturity
with (security_barrier = true)
as
with settings as (
  select
    coalesce((select (value #>> '{}')::int from public.site_settings where key = 'new_release_window_days'), 120) as window_days,
    coalesce((select (value #>> '{}')::int from public.site_settings where key = 'early_report_threshold'), 5) as threshold
),
counts as (
  select
    r.product_id,
    count(distinct r.user_id)::int as reporting_owners,
    count(distinct r.user_id) filter (where r.ownership_verified)::int as verified_owners,
    count(*)::int as published_reports
  from public.owner_reports r
  where r.status = 'published'
  group by r.product_id
)
select
  p.id as product_id,
  p.release_date,
  p.release_status,
  case when p.release_date <= current_date then current_date - p.release_date end as days_since_release,
  coalesce(c.reporting_owners, 0) as reporting_owners,
  coalesce(c.verified_owners, 0) as verified_owners,
  coalesce(c.published_reports, 0) as published_reports,
  case
    when p.release_status in ('announced', 'pre_order') or p.release_date >= current_date - s.window_days then
      case when coalesce(c.reporting_owners, 0) < s.threshold then 'new_release' else 'early_reports' end
    when p.release_date is not null then
      case when coalesce(c.reporting_owners, 0) >= s.threshold then 'established' else 'limited_data' end
  end as maturity
from public.products p
cross join settings s
left join counts c on c.product_id = p.id
where p.catalog_status = 'published';

revoke all on public.product_review_maturity from anon, authenticated;
grant select on public.product_review_maturity to anon, authenticated;

-- Durability tracker: what owners report over time, per model, once enough owners have reported.
-- Uses each owner's latest published report for their current status. A crack or rattle counts as a
-- failure; hits_at_failure lists the hit count on each failed owner's first failure report.
create view public.owner_report_durability
with (security_barrier = true)
as
with settings as (
  select coalesce((select (value #>> '{}')::int from public.site_settings where key = 'durability_min_owners'), 3) as min_owners
),
published as (
  select r.* from public.owner_reports r
  join public.products p on p.id = r.product_id and p.catalog_status = 'published'
  where r.status = 'published'
),
latest as (
  select distinct on (product_id, user_id) product_id, user_id, durability_status, hits_so_far
  from published
  order by product_id, user_id, created_at desc
),
first_failure as (
  select distinct on (product_id, user_id) product_id, user_id, hits_so_far
  from published
  where durability_status in ('cracked', 'rattle')
  order by product_id, user_id, created_at
),
per_product as (
  select
    l.product_id,
    count(*)::int as reporting_owners,
    count(*) filter (where l.durability_status = 'intact')::int as owners_intact,
    count(*) filter (where l.durability_status = 'dented')::int as owners_dented,
    count(*) filter (where l.durability_status = 'cracked')::int as owners_cracked,
    count(*) filter (where l.durability_status = 'rattle')::int as owners_rattle,
    count(*) filter (where l.durability_status = 'returned_warranty')::int as owners_returned_warranty,
    percentile_cont(0.5) within group (order by l.hits_so_far) filter (where l.durability_status = 'intact') as median_hits_intact
  from latest l
  group by l.product_id
)
select
  pp.product_id,
  pp.reporting_owners,
  (select count(distinct v.user_id) from published v where v.product_id = pp.product_id and v.ownership_verified)::int as verified_owners,
  pp.owners_intact,
  pp.owners_dented,
  pp.owners_cracked,
  pp.owners_rattle,
  pp.owners_returned_warranty,
  (select count(*) from first_failure f where f.product_id = pp.product_id)::int as owners_reporting_failure,
  pp.median_hits_intact,
  (select percentile_cont(0.5) within group (order by f.hits_so_far) from first_failure f where f.product_id = pp.product_id)
    as median_hits_at_failure,
  coalesce((select array_agg(f.hits_so_far order by f.hits_so_far) from first_failure f
    where f.product_id = pp.product_id and f.hits_so_far is not null), '{}') as hits_at_failure
from per_product pp
cross join settings s
where pp.reporting_owners >= s.min_owners;

revoke all on public.owner_report_durability from anon, authenticated;
grant select on public.owner_report_durability to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private bucket for ownership proof photos (receipts, serial numbers). Members upload to their own
-- folder; only they and support staff can read them. Skipped when the storage schema is absent (local tests).
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not found, skipping ownership-proof bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('ownership-proof', 'ownership-proof', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy "Members upload ownership proof to their own folder" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'ownership-proof' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
  execute $p$
    create policy "Members and support read ownership proof" on storage.objects
      for select to authenticated
      using (bucket_id = 'ownership-proof' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_role('support')))
  $p$;
  execute $p$
    create policy "Members delete their own ownership proof" on storage.objects
      for delete to authenticated
      using (bucket_id = 'ownership-proof' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
end;
$$;
