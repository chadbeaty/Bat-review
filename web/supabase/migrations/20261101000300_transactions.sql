-- Transactions: addresses, orders, payments, shipping, disputes, reviews, price history, subscriptions,
-- advertising, webhooks, newsletter and audit log. Rows here are written by the server (service role),
-- never directly by browsers, except where the security migration allows it.

-- J. addresses
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  address_type text not null default 'shipping' check (address_type in ('shipping', 'billing', 'return')),
  full_name text not null check (char_length(full_name) between 2 and 100),
  street_address text not null check (char_length(street_address) between 3 and 200),
  apartment text check (char_length(apartment) <= 100),
  city text not null check (char_length(city) between 2 and 80),
  state text not null check (state ~ '^[A-Z]{2}$'),
  postal_code text not null check (postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  country text not null default 'US' check (country = 'US'),
  phone text check (phone is null or phone ~ '^[0-9+() .-]{7,20}$'),
  is_default boolean not null default false,
  validated boolean not null default false,
  provider_address_id text,
  created_at timestamptz not null default now()
);

create index addresses_user_idx on public.addresses (user_id);

-- H. orders (one seller per order)
create sequence public.order_number_seq start 100001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('ORD-' || nextval('public.order_number_seq')),
  buyer_id uuid not null references auth.users (id),
  seller_id uuid not null references auth.users (id),
  order_status text not null default 'awaiting_payment' check (order_status in (
    'awaiting_payment', 'paid', 'processing', 'shipped', 'delivered', 'completed', 'disputed', 'refunded', 'cancelled')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cost_cents integer not null default 0 check (shipping_cost_cents >= 0),
  tax_amount_cents integer not null default 0 check (tax_amount_cents >= 0),
  tax_jurisdiction jsonb,
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  payment_processing_cents integer check (payment_processing_cents >= 0),
  seller_payout_cents integer check (seller_payout_cents >= 0),
  total_amount_cents integer not null check (total_amount_cents >= 0),
  refunded_amount_cents integer not null default 0 check (refunded_amount_cents >= 0),
  currency text not null default 'usd' check (currency = 'usd'),
  -- The fee rules in force when the order was placed, so later fee changes never alter old orders.
  fee_snapshot jsonb not null default '{}'::jsonb,
  shipping_address_id uuid references public.addresses (id),
  billing_address_id uuid references public.addresses (id),
  shipping_rate_snapshot jsonb,
  offer_id uuid references public.offers (id),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  stripe_transfer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  check (buyer_id <> seller_id),
  check (total_amount_cents = subtotal_cents + shipping_cost_cents + tax_amount_cents)
);

create index orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index orders_seller_idx on public.orders (seller_id, created_at desc);
create index orders_status_idx on public.orders (order_status, created_at);

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- I. order_items (snapshots keep what the buyer saw at purchase time)
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  listing_id uuid not null references public.equipment_listings (id),
  product_id uuid references public.products (id),
  seller_id uuid not null references auth.users (id),
  product_title_snapshot text not null,
  condition_snapshot jsonb not null default '{}'::jsonb,
  quantity integer not null default 1 check (quantity >= 1),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  -- An item holds its listing while true. A cancelled or refunded order releases it.
  holds_listing boolean not null default true,
  created_at timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);
-- A listing (quantity 1) can be held by only one live order at a time. This is the guard against selling twice.
create unique index order_items_one_live_order_per_listing on public.order_items (listing_id) where holds_listing;

-- L. seller_payment_accounts (Stripe holds bank and identity data; we keep only the account id and status)
create table public.seller_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null unique references auth.users (id) on delete cascade,
  stripe_connected_account_id text not null unique,
  onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started', 'in_progress', 'complete', 'restricted', 'rejected')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  requirements_due jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger seller_payment_accounts_updated_at before update on public.seller_payment_accounts
  for each row execute function public.set_updated_at();

-- K. shipping_shipments and S. shipping_events
create table public.shipping_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  seller_id uuid not null references auth.users (id),
  buyer_id uuid not null references auth.users (id),
  shipping_provider text not null default 'shippo',
  provider_shipment_id text,
  provider_transaction_id text unique,
  carrier text,
  service_level text,
  tracking_number text,
  tracking_url text,
  label_url text,
  shipping_cost_cents integer check (shipping_cost_cents >= 0),
  insurance_amount_cents integer check (insurance_amount_cents >= 0),
  package_weight_oz numeric(7, 2),
  package_dimensions jsonb,
  shipment_status text not null default 'pending' check (shipment_status in (
    'pending', 'label_purchased', 'pre_transit', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'failure', 'cancelled')),
  is_return boolean not null default false,
  purchased_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shipping_shipments_order_idx on public.shipping_shipments (order_id);
create index shipping_shipments_tracking_idx on public.shipping_shipments (tracking_number);

create trigger shipping_shipments_updated_at before update on public.shipping_shipments
  for each row execute function public.set_updated_at();

create table public.shipping_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipping_shipments (id) on delete cascade,
  provider_event_id text not null unique,
  tracking_status text not null,
  tracking_description text,
  event_timestamp timestamptz,
  location text,
  created_at timestamptz not null default now()
);

create index shipping_events_shipment_idx on public.shipping_events (shipment_id, event_timestamp);

-- Incoming payment and shipping webhooks. The unique event id makes processing idempotent.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'shippo', 'resend')),
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'ignored')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

-- U. disputes
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  opened_by uuid not null references auth.users (id),
  dispute_type text not null check (dispute_type in (
    'not_received', 'not_as_described', 'damaged_in_transit', 'counterfeit', 'payment_chargeback', 'other')),
  description text not null check (char_length(description) between 10 and 5000),
  evidence_urls text[] not null default '{}',
  status text not null default 'open'
    check (status in ('open', 'awaiting_seller', 'awaiting_buyer', 'under_review', 'resolved_buyer', 'resolved_seller', 'closed')),
  resolution text,
  admin_notes text,
  stripe_dispute_id text unique,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index disputes_order_idx on public.disputes (order_id);
create index disputes_status_idx on public.disputes (status, created_at);

-- M. reviews (only from completed orders, one per party per order)
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  reviewer_id uuid not null references auth.users (id),
  reviewed_user_id uuid not null references auth.users (id),
  reviewer_role text not null check (reviewer_role in ('buyer', 'seller')),
  rating smallint not null check (rating between 1 and 5),
  review_text text check (char_length(review_text) <= 2000),
  response_text text check (char_length(response_text) <= 1000),
  responded_at timestamptz,
  review_status text not null default 'published' check (review_status in ('published', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  unique (order_id, reviewer_id),
  check (reviewer_id <> reviewed_user_id)
);

create index reviews_reviewed_idx on public.reviews (reviewed_user_id, created_at desc);

-- Checks the reviewer and reviewed member were the two parties of a completed order.
create or replace function public.validate_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
begin
  if tg_op = 'UPDATE' then
    if public.is_end_user() and not public.is_admin() and (
      new.rating is distinct from old.rating or new.review_text is distinct from old.review_text
      or new.reviewer_id is distinct from old.reviewer_id or new.reviewed_user_id is distinct from old.reviewed_user_id
      or new.order_id is distinct from old.order_id or new.review_status is distinct from old.review_status) then
      raise exception 'Only the reviewed member''s response can be added after posting' using errcode = '42501';
    end if;
    if new.response_text is distinct from old.response_text then
      new.responded_at := now();
    end if;
    return new;
  end if;

  select * into o from public.orders where id = new.order_id;
  if o.id is null or o.order_status <> 'completed' then
    raise exception 'Reviews can only be left for completed orders' using errcode = '42501';
  end if;
  if new.reviewer_id = o.buyer_id and new.reviewed_user_id = o.seller_id then
    new.reviewer_role := 'buyer';
  elsif new.reviewer_id = o.seller_id and new.reviewed_user_id = o.buyer_id then
    new.reviewer_role := 'seller';
  else
    raise exception 'Only the buyer and seller of this order can review each other' using errcode = '42501';
  end if;
  new.response_text := null;
  new.responded_at := null;
  new.review_status := 'published';
  return new;
end;
$$;

create trigger reviews_validate before insert or update on public.reviews
  for each row execute function public.validate_review();

-- R. price_history (actual completed sales only; never estimates)
create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  transaction_id uuid unique references public.orders (id) on delete set null,
  sold_price_cents integer not null check (sold_price_cents > 0),
  condition_score smallint check (condition_score between 1 and 10),
  model_year smallint,
  weight_oz numeric(4, 1),
  certification text[],
  sale_date date not null,
  verified_transaction boolean not null default false,
  data_source text not null default 'marketplace' check (data_source in ('marketplace', 'licensed')),
  source_reference text,
  created_at timestamptz not null default now(),
  check (data_source <> 'marketplace' or transaction_id is not null or not verified_transaction)
);

create index price_history_product_idx on public.price_history (product_id, sale_date desc);

-- X. seller_subscriptions
create table public.seller_subscriptions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users (id) on delete cascade,
  subscription_type text not null check (subscription_type in ('premium_seller')),
  payment_provider_subscription_id text unique,
  status text not null default 'incomplete'
    check (status in ('incomplete', 'trialing', 'active', 'past_due', 'cancelled', 'expired')),
  start_date timestamptz,
  renewal_date timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create index seller_subscriptions_seller_idx on public.seller_subscriptions (seller_id);

-- W. advertising_campaigns (nothing shows until a real sponsor has paid for a placement)
create table public.advertising_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_name text not null,
  campaign_name text not null,
  placement text not null check (placement in ('homepage_partner', 'category_sponsor', 'search_sponsored', 'newsletter')),
  target_category uuid references public.product_categories (id) on delete set null,
  image_url text,
  destination_url text check (destination_url is null or destination_url ~ '^https://'),
  start_date date not null,
  end_date date not null,
  price_cents integer not null check (price_cents >= 0),
  paid boolean not null default false,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- Newsletter (marketing email, separate from transactional email)
create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status text not null default 'pending' check (status in ('pending', 'subscribed', 'unsubscribed', 'bounced')),
  source text,
  confirm_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz
);

-- V. audit_logs (append-only: no one, including the server, can edit or delete entries)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);

create or replace function public.audit_logs_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit log entries cannot be changed or deleted' using errcode = '42501';
end;
$$;

create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_append_only();

-- Server code and staff actions write audit entries through this function.
create or replace function public.log_audit(p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if public.is_end_user() and not public.has_role('support') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

-- Fee and setting changes are always audited.
create or replace function public.audit_config_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    (coalesce(new_row, old_row) ->> 'id')::uuid,
    jsonb_build_object('old', old_row, 'new', new_row)
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger fee_configuration_audit after insert or update or delete on public.fee_configuration
  for each row execute function public.audit_config_change();
create trigger site_settings_audit after insert or update or delete on public.site_settings
  for each row execute function public.audit_config_change();
