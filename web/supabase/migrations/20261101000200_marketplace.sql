-- Marketplace: listings, photos, favorites, offers, saved searches, watchlist, messaging, blocks, reports, notifications.

-- ---------------------------------------------------------------------------
-- F. equipment_listings (an individual item for sale)
-- ---------------------------------------------------------------------------

create table public.equipment_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  category_id uuid not null references public.product_categories (id),
  manufacturer_id uuid references public.manufacturers (id),
  title text not null check (char_length(title) between 5 and 120),
  description text check (char_length(description) <= 5000),
  -- Category-specific values, for example {"weight_oz": 26, "certification": ["USSSA"], "weighting_type": "endload"}.
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  asking_price_cents integer not null check (asking_price_cents between 100 and 2500000),
  accepts_offers boolean not null default true,
  condition_score smallint check (condition_score between 1 and 10),
  condition_label text,
  structural_disclosure text not null default 'unknown'
    check (structural_disclosure in ('no_known_damage', 'damage_disclosed', 'unknown')),
  -- Each answer is null until the seller answers it. All must be answered before publishing.
  has_cracks boolean,
  has_rattle boolean,
  has_loose_end_cap boolean,
  has_repairs boolean,
  has_alterations boolean,
  has_significant_damage boolean,
  cosmetic_wear text check (char_length(cosmetic_wear) <= 1000),
  damage_disclosure text check (char_length(damage_disclosure) <= 2000),
  authenticity_declaration boolean not null default false,
  ownership_declaration boolean not null default false,
  quantity integer not null default 1 check (quantity between 1 and 50),
  shipping_weight_oz numeric(7, 2) check (shipping_weight_oz > 0 and shipping_weight_oz <= 2400),
  package_length_inches numeric(5, 1) check (package_length_inches > 0 and package_length_inches <= 108),
  package_width_inches numeric(5, 1) check (package_width_inches > 0 and package_width_inches <= 108),
  package_height_inches numeric(5, 1) check (package_height_inches > 0 and package_height_inches <= 108),
  shipping_origin_postal_code text check (shipping_origin_postal_code is null or shipping_origin_postal_code ~ '^[0-9]{5}$'),
  -- Public, coarse location only (city and state). Never the seller's street address.
  location_city text,
  location_state text check (location_state is null or location_state ~ '^[A-Z]{2}$'),
  listing_status text not null default 'draft'
    check (listing_status in ('draft', 'pending_review', 'active', 'reserved', 'sold', 'removed', 'expired')),
  featured boolean not null default false,
  featured_until timestamptz,
  views_count integer not null default 0 check (views_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  sold_at timestamptz,
  expires_at timestamptz,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored
);

create index equipment_listings_seller_idx on public.equipment_listings (seller_id);
create index equipment_listings_product_idx on public.equipment_listings (product_id);
create index equipment_listings_browse_idx on public.equipment_listings (listing_status, category_id, published_at desc);
create index equipment_listings_price_idx on public.equipment_listings (listing_status, asking_price_cents);
create index equipment_listings_manufacturer_idx on public.equipment_listings (manufacturer_id);
create index equipment_listings_attributes_idx on public.equipment_listings using gin (attributes jsonb_path_ops);
create index equipment_listings_search_idx on public.equipment_listings using gin (search_vector);
create index equipment_listings_title_trgm_idx on public.equipment_listings using gin (title gin_trgm_ops);

create trigger equipment_listings_updated_at before update on public.equipment_listings
  for each row execute function public.set_updated_at();

-- G. listing_images
create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.equipment_listings (id) on delete cascade,
  image_url text not null,
  storage_path text,
  display_order smallint not null default 0,
  image_type text not null default 'other'
    check (image_type in ('full', 'barrel', 'end_cap', 'knob', 'markings', 'damage', 'front', 'back', 'detail', 'label', 'other')),
  alt_text text check (char_length(alt_text) <= 200),
  uploaded_at timestamptz not null default now()
);

create index listing_images_listing_idx on public.listing_images (listing_id, display_order);

-- Rules for a listing to go live, and protection of states only the order system may set.
create or replace function public.enforce_listing_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  going_live boolean := new.listing_status = 'active' and (tg_op = 'INSERT' or old.listing_status is distinct from 'active');
  seller_status text;
begin
  if public.is_end_user() and not public.is_admin() then
    -- Sold and reserved come from verified payments, never from a seller's edit.
    if new.listing_status in ('reserved', 'sold')
      and (tg_op = 'INSERT' or old.listing_status is distinct from new.listing_status) then
      raise exception 'Only the order system can mark a listing reserved or sold' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.listing_status in ('reserved', 'sold') and new is distinct from old then
      raise exception 'A listing that is reserved or sold cannot be edited' using errcode = '42501';
    end if;
    if new.featured is distinct from coalesce(case when tg_op = 'UPDATE' then old.featured end, false)
      or new.views_count is distinct from coalesce(case when tg_op = 'UPDATE' then old.views_count end, 0) then
      raise exception 'Featured status and view counts are managed by the marketplace' using errcode = '42501';
    end if;
  end if;

  if going_live then
    select account_status into seller_status from public.profiles where id = new.seller_id;
    if seller_status is distinct from 'active' then
      raise exception 'This account cannot publish listings' using errcode = '42501';
    end if;
    if not (new.authenticity_declaration and new.ownership_declaration) then
      raise exception 'Confirm ownership and authenticity before publishing' using errcode = '23514';
    end if;
    if new.condition_score is null then
      raise exception 'Choose a cosmetic condition before publishing' using errcode = '23514';
    end if;
    if new.has_cracks is null or new.has_rattle is null or new.has_loose_end_cap is null
      or new.has_repairs is null or new.has_alterations is null or new.has_significant_damage is null then
      raise exception 'Answer every damage question before publishing' using errcode = '23514';
    end if;
    if (new.has_cracks or new.has_rattle or new.has_loose_end_cap or new.has_repairs or new.has_alterations or new.has_significant_damage)
      and new.structural_disclosure <> 'damage_disclosed' then
      raise exception 'Damage was reported, so the structural disclosure must say damage is disclosed' using errcode = '23514';
    end if;
    if new.shipping_weight_oz is null or new.package_length_inches is null
      or new.package_width_inches is null or new.package_height_inches is null or new.shipping_origin_postal_code is null then
      raise exception 'Add package weight, size and ship-from ZIP code before publishing' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and not exists (select 1 from public.listing_images where listing_id = new.id) then
      raise exception 'Add at least one photo before publishing' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' then
      raise exception 'Save the listing as a draft and add photos before publishing' using errcode = '23514';
    end if;
    new.published_at := now();
    if new.expires_at is null or new.expires_at < now() then
      new.expires_at := now() + make_interval(days => coalesce(
        (select (value #>> '{}')::int from public.site_settings where key = 'listing_expiry_days'), 90));
    end if;
  end if;

  if new.listing_status = 'sold' and (tg_op = 'INSERT' or old.listing_status is distinct from 'sold') then
    new.sold_at := now();
  end if;
  return new;
end;
$$;

create trigger equipment_listings_rules before insert or update on public.equipment_listings
  for each row execute function public.enforce_listing_rules();

-- P. favorites
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.equipment_listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

create index favorites_listing_idx on public.favorites (listing_id);

-- Offers (counteroffers link to the offer they answer)
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.equipment_listings (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,
  made_by uuid not null references auth.users (id) on delete cascade,
  parent_offer_id uuid references public.offers (id) on delete set null,
  amount_cents integer not null check (amount_cents between 100 and 2500000),
  message text check (char_length(message) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'countered', 'expired', 'withdrawn', 'completed')),
  expires_at timestamptz not null default now() + interval '48 hours',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  check (made_by in (buyer_id, seller_id))
);

create index offers_listing_idx on public.offers (listing_id, status);
create index offers_buyer_idx on public.offers (buyer_id);
create index offers_seller_idx on public.offers (seller_id);

-- Saved searches and product watchlist (price-drop alerts)
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  query jsonb not null default '{}'::jsonb,
  email_alerts boolean not null default true,
  last_alerted_at timestamptz,
  created_at timestamptz not null default now()
);

create index saved_searches_user_idx on public.saved_searches (user_id);

create table public.product_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  target_price_cents integer check (target_price_cents > 0),
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- O. conversations and N. messages
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.equipment_listings (id) on delete set null,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  unique (listing_id, buyer_id)
);

create index conversations_buyer_idx on public.conversations (buyer_id, last_message_at desc);
create index conversations_seller_idx on public.conversations (seller_id, last_message_at desc);

create table public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  message_text text not null check (char_length(message_text) between 1 and 4000),
  attachment_url text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_recipient_unread_idx on public.messages (recipient_id) where read_at is null;

-- Sets the recipient from the conversation, blocks messages between blocked users, and rate-limits senders.
create or replace function public.prepare_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  convo public.conversations;
  recent integer;
begin
  select * into convo from public.conversations where id = new.conversation_id;
  if convo.id is null or new.sender_id not in (convo.buyer_id, convo.seller_id) then
    raise exception 'You are not part of this conversation' using errcode = '42501';
  end if;
  new.recipient_id := case when new.sender_id = convo.buyer_id then convo.seller_id else convo.buyer_id end;
  if exists (select 1 from public.user_blocks where blocker_id = new.recipient_id and blocked_id = new.sender_id) then
    raise exception 'This member is not accepting messages from you' using errcode = '42501';
  end if;
  if public.is_end_user() then
    select count(*) into recent from public.messages
      where sender_id = new.sender_id and created_at > now() - interval '1 minute';
    if recent >= coalesce((select (value #>> '{}')::int from public.site_settings where key = 'messages_per_minute_limit'), 15) then
      raise exception 'You are sending messages too quickly. Wait a minute and try again.' using errcode = '54000';
    end if;
  end if;
  new.read_at := null;
  new.created_at := now();
  update public.conversations set last_message_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_prepare before insert on public.messages
  for each row execute function public.prepare_message();

-- Recipients may only mark messages read; nothing else about a sent message can change.
create or replace function public.protect_message()
returns trigger
language plpgsql
as $$
begin
  if public.is_end_user() and (
    new.message_text is distinct from old.message_text or new.sender_id is distinct from old.sender_id
    or new.recipient_id is distinct from old.recipient_id or new.conversation_id is distinct from old.conversation_id
    or new.attachment_url is distinct from old.attachment_url or new.created_at is distinct from old.created_at) then
    raise exception 'Messages cannot be edited' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger messages_protect before update on public.messages
  for each row execute function public.protect_message();

-- Reports of listings, users, messages or reviews, for moderation
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null check (entity_type in ('listing', 'user', 'message', 'conversation', 'review')),
  entity_id uuid not null,
  reason text not null check (reason in (
    'counterfeit', 'stolen', 'misrepresented', 'prohibited', 'off_platform_payment', 'spam', 'harassment',
    'non_delivery', 'other')),
  details text check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index reports_status_idx on public.reports (status, created_at);
create index reports_entity_idx on public.reports (entity_type, entity_id);

-- Q. notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text,
  related_entity_id uuid,
  link_path text check (link_path is null or link_path ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
