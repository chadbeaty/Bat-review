-- Foundation: helpers, roles, profiles, catalog (categories, manufacturers, products, bat specs), settings and fees.
-- Money is stored in integer cents everywhere (`*_cents`) to avoid rounding errors and to match Stripe.

create extension if not exists pg_trgm;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- The API role of the current request ('anon', 'authenticated' or 'service_role'), read from the JWT claims.
-- Unlike current_user, this stays correct inside security definer functions. Null for direct database sessions.
create or replace function public.request_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  );
$$;

-- True when the request comes from a signed-in or anonymous site visitor, not the server or an admin tool.
create or replace function public.is_end_user()
returns boolean
language sql
stable
as $$
  select coalesce(public.request_role() in ('anon', 'authenticated'), false);
$$;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'moderator', 'support')),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.has_role(check_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and (role = check_role or role = 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- A. profiles
-- email and postal_code are private: column privileges in the security migration hide them from other users.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text check (char_length(display_name) <= 60),
  email citext,
  profile_photo_url text,
  bio text check (char_length(bio) <= 1000),
  city text check (char_length(city) <= 80),
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  -- Marketplace reputation (earned through completed sales) and identity verification (Stripe) are separate.
  seller_verified boolean not null default false,
  identity_verified boolean not null default false,
  account_status text not null default 'active' check (account_status in ('active', 'suspended', 'banned', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Creates a profile when someone signs up. Username comes from sign-up metadata when valid and free.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted text := new.raw_user_meta_data ->> 'username';
  final_name text;
begin
  if wanted is null or wanted !~ '^[a-zA-Z0-9_]{3,24}$' or exists (select 1 from public.profiles where username = wanted::citext) then
    final_name := 'player_' || substr(replace(new.id::text, '-', ''), 1, 10);
  else
    final_name := wanted;
  end if;
  insert into public.profiles (id, username, display_name, email)
  values (new.id, final_name, nullif(left(new.raw_user_meta_data ->> 'display_name', 60), ''), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users may not change their own moderation or verification flags.
create or replace function public.protect_profile_flags()
returns trigger
language plpgsql
as $$
begin
  if public.is_end_user() and not public.is_admin() then
    if new.seller_verified is distinct from old.seller_verified
      or new.identity_verified is distinct from old.identity_verified
      or new.account_status is distinct from old.account_status
      or new.email is distinct from old.email then
      raise exception 'These profile fields can only be changed by the marketplace' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_flags before update on public.profiles
  for each row execute function public.protect_profile_flags();

-- ---------------------------------------------------------------------------
-- B. product_categories
-- attribute_schema describes the category-specific listing fields, so new categories need no code changes.
-- ---------------------------------------------------------------------------

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  description text,
  parent_category_id uuid references public.product_categories (id) on delete set null,
  image_url text,
  attribute_schema jsonb not null default '[]'::jsonb check (jsonb_typeof(attribute_schema) = 'array'),
  required_photos jsonb not null default '[]'::jsonb check (jsonb_typeof(required_photos) = 'array'),
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index product_categories_parent_idx on public.product_categories (parent_category_id);

-- ---------------------------------------------------------------------------
-- C. manufacturers
-- ---------------------------------------------------------------------------

create table public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  aliases text[] not null default '{}',
  logo_url text,
  website_url text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- D. products (master catalog: a model, not an item for sale)
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.product_categories (id),
  manufacturer_id uuid references public.manufacturers (id),
  product_name text not null,
  model_name text not null,
  model_year smallint check (model_year between 1980 and 2100),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  description text,
  primary_image_url text,
  official_product_url text,
  product_specifications jsonb not null default '{}'::jsonb check (jsonb_typeof(product_specifications) = 'object'),
  aliases text[] not null default '{}',
  original_retail_price_cents integer check (original_retail_price_cents >= 0),
  original_price_source text,
  original_price_verified boolean not null default false,
  -- A bat can carry several stamps (for example USA and USSSA), so this is a list.
  certification_association text[] not null default '{}',
  certification_status text not null default 'unverified'
    check (certification_status in ('unverified', 'manufacturer_listed', 'association_listed', 'decertified', 'not_applicable')),
  certification_source text,
  certification_verified_at timestamptz,
  catalog_status text not null default 'draft'
    check (catalog_status in ('draft', 'pending_review', 'published', 'archived')),
  data_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(product_name, '') || ' ' || coalesce(model_name, '') || ' ' || coalesce(model_year::text, ''))
  ) stored
);

create index products_category_idx on public.products (category_id);
create index products_manufacturer_idx on public.products (manufacturer_id);
create index products_year_idx on public.products (model_year);
create index products_status_idx on public.products (catalog_status);
create index products_search_idx on public.products using gin (search_vector);
create index products_name_trgm_idx on public.products using gin (product_name gin_trgm_ops);

create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- E. bat_specifications (one row per product and weight; weight may be unknown)
-- ---------------------------------------------------------------------------

create table public.bat_specifications (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  weight_oz numeric(4, 1) check (weight_oz between 18 and 40),
  length_inches numeric(4, 1) default 34 check (length_inches between 26 and 36),
  barrel_length_inches numeric(4, 2) check (barrel_length_inches between 8 and 16),
  barrel_diameter_inches numeric(4, 3) check (barrel_diameter_inches between 2 and 3),
  weighting_type text not null default 'unknown' check (weighting_type in ('balanced', 'endload', 'midload', 'other', 'unknown')),
  endload_oz numeric(3, 2) check (endload_oz between 0 and 3),
  construction_type text not null default 'unknown' check (construction_type in ('one_piece', 'two_piece', 'unknown')),
  construction_material text not null default 'unknown'
    check (construction_material in ('composite', 'alloy', 'hybrid', 'wood', 'wood_composite', 'unknown')),
  certification text,
  association text,
  model_year smallint check (model_year between 1980 and 2100),
  product_line text,
  manufacturer_part_number text,
  verified boolean not null default false,
  verification_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bat_specifications_product_idx on public.bat_specifications (product_id);
create index bat_specifications_weight_idx on public.bat_specifications (weight_oz);
create unique index bat_specifications_product_weight_uniq
  on public.bat_specifications (product_id, coalesce(weight_oz, 0));

create trigger bat_specifications_updated_at before update on public.bat_specifications
  for each row execute function public.set_updated_at();

-- Sellers can ask for a model that isn't in the catalog yet. Staff review it before it is published.
create table public.product_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.product_categories (id),
  manufacturer_id uuid references public.manufacturers (id),
  manufacturer_name text,
  model_name text not null check (char_length(model_name) between 2 and 120),
  model_year smallint check (model_year between 1980 and 2100),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'merged')),
  created_product_id uuid references public.products (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index product_submissions_status_idx on public.product_submissions (status);
create index product_submissions_user_idx on public.product_submissions (submitted_by);

-- ---------------------------------------------------------------------------
-- Settings and T. fee_configuration (business values live in data, not code)
-- ---------------------------------------------------------------------------

create table public.site_settings (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  value jsonb not null,
  description text,
  is_public boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

create table public.fee_configuration (
  id uuid primary key default gen_random_uuid(),
  fee_name text not null check (fee_name ~ '^[a-z0-9_]+$'),
  fee_type text not null check (fee_type in ('percentage', 'fixed_cents')),
  fee_value numeric(12, 4) not null check (fee_value >= 0),
  description text,
  active boolean not null default true,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fee_type <> 'percentage' or fee_value <= 100)
);

create index fee_configuration_lookup_idx on public.fee_configuration (fee_name, active, effective_from desc);

create trigger fee_configuration_updated_at before update on public.fee_configuration
  for each row execute function public.set_updated_at();

-- The fee in force right now: the active row with the latest start date that has already begun.
create or replace function public.current_fee(name text)
returns public.fee_configuration
language sql
stable
as $$
  select * from public.fee_configuration
  where fee_name = name and active and effective_from <= now()
  order by effective_from desc
  limit 1;
$$;
