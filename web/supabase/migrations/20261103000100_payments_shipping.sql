-- Payments and shipping (Track D): checkout holds, Stripe payment state, refunds, payouts, shipping quotes,
-- labels and tracking. Follows docs/decisions/0001-payments-funds-flow.md (separate charges and transfers,
-- funds released to the seller only when the order completes). Additive and safe to run more than once.
--
-- Every function that changes money or order state is security definer and callable only with the service
-- role key (server code, after it has checked who is asking). Browsers keep read-only access through RLS.

-- ---------------------------------------------------------------------------
-- Settings and fees
-- ---------------------------------------------------------------------------

insert into public.site_settings (key, value, description, is_public) values
  ('checkout_enabled', 'false', 'Whether buyers can check out. Keep off until the owner has signed off decision 0001 and live keys are set', true),
  ('tax_collection_enabled', 'false', 'Whether checkout collects sales tax. Keep off until an accountant confirms registrations', true),
  ('inspection_window_days', '2', 'Days after delivery the buyer has to report a problem before the seller is paid', true)
on conflict (key) do nothing;

insert into public.fee_configuration (fee_name, fee_type, fee_value, description)
select 'seller_processing_passthrough_percent', 'percentage', 0,
  'Share of the order total passed on to the seller to cover card processing. 0 means the platform absorbs processing costs'
where not exists (select 1 from public.fee_configuration where fee_name = 'seller_processing_passthrough_percent');

-- Type checks for the new settings. A separate trigger, so the admin migration's validator stays untouched.
create or replace function public.validate_payment_settings()
returns trigger
language plpgsql
as $$
declare
  n numeric;
begin
  if new.key in ('checkout_enabled', 'tax_collection_enabled') then
    if jsonb_typeof(new.value) <> 'boolean' then
      raise exception 'Setting % must be true or false', new.key using errcode = '22023';
    end if;
  elsif new.key = 'inspection_window_days' then
    if jsonb_typeof(new.value) <> 'number' then
      raise exception 'Setting % must be a whole number', new.key using errcode = '22023';
    end if;
    n := (new.value #>> '{}')::numeric;
    if n <> trunc(n) or n < 1 or n > 30 then
      raise exception 'Setting % must be a whole number from 1 to 30', new.key using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists site_settings_validate_payments on public.site_settings;
create trigger site_settings_validate_payments before insert or update on public.site_settings
  for each row execute function public.validate_payment_settings();

create or replace function public.setting_bool(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::boolean from public.site_settings where key = p_key and jsonb_typeof(value) = 'boolean'), false);
$$;

create or replace function public.setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::integer from public.site_settings where key = p_key and jsonb_typeof(value) = 'number'), p_default);
$$;

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------

alter table public.orders add column if not exists checkout_expires_at timestamptz;
alter table public.orders add column if not exists stripe_checkout_url text;
alter table public.orders add column if not exists buyer_confirmed_at timestamptz;
alter table public.orders add column if not exists transfer_amount_cents integer check (transfer_amount_cents >= 0);
alter table public.orders add column if not exists transfer_reversed_cents integer not null default 0 check (transfer_reversed_cents >= 0);
alter table public.orders add column if not exists transfer_error text;
alter table public.orders add column if not exists transfer_attempted_at timestamptz;
alter table public.orders add column if not exists status_before_dispute text;
alter table public.orders add column if not exists payment_issue text;

create index if not exists orders_awaiting_payment_idx on public.orders (checkout_expires_at) where order_status = 'awaiting_payment';
create index if not exists orders_delivered_idx on public.orders (delivered_at) where order_status = 'delivered';

alter table public.shipping_shipments add column if not exists is_test boolean not null default false;
alter table public.shipping_shipments add column if not exists rate_snapshot jsonb;
alter table public.shipping_shipments add column if not exists label_error text;

-- One outbound label per order. A second purchase attempt fails here, so the platform never pays twice.
create unique index if not exists shipping_shipments_one_label_per_order
  on public.shipping_shipments (order_id) where not is_return and shipment_status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- Shipping quotes: rates fetched by the server for one buyer, listing and address. Checkout reads the chosen
-- rate from here, so a browser can never set its own shipping price. Expire after 30 minutes.
-- ---------------------------------------------------------------------------

create table if not exists public.shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.equipment_listings (id) on delete cascade,
  address_id uuid not null references public.addresses (id) on delete cascade,
  provider text not null,
  is_test boolean not null default false,
  package jsonb not null,
  rates jsonb not null check (jsonb_typeof(rates) = 'array'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);

create index if not exists shipping_quotes_buyer_idx on public.shipping_quotes (buyer_id, created_at desc);
alter table public.shipping_quotes enable row level security;
revoke insert, update, delete on public.shipping_quotes from anon, authenticated;
drop policy if exists "Buyers see their own shipping quotes" on public.shipping_quotes;
create policy "Buyers see their own shipping quotes" on public.shipping_quotes
  for select to authenticated using (buyer_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Refunds issued through Stripe (by staff) and seller payouts reported by Stripe.
-- ---------------------------------------------------------------------------

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  stripe_refund_id text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null check (char_length(reason) between 3 and 500),
  transfer_reversal_id text,
  transfer_reversal_cents integer check (transfer_reversal_cents >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists payment_refunds_order_idx on public.payment_refunds (order_id);
alter table public.payment_refunds enable row level security;
revoke insert, update, delete on public.payment_refunds from anon, authenticated;
drop policy if exists "Order parties see refunds" on public.payment_refunds;
create policy "Order parties see refunds" on public.payment_refunds
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and (select auth.uid()) in (o.buyer_id, o.seller_id))
    or public.has_role('support'));

create table if not exists public.seller_payouts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users (id) on delete cascade,
  stripe_account_id text not null,
  stripe_payout_id text not null unique,
  amount_cents integer not null,
  currency text not null default 'usd',
  status text not null,
  arrival_date date,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seller_payouts_seller_idx on public.seller_payouts (seller_id, created_at desc);
drop trigger if exists seller_payouts_updated_at on public.seller_payouts;
create trigger seller_payouts_updated_at before update on public.seller_payouts
  for each row execute function public.set_updated_at();
alter table public.seller_payouts enable row level security;
revoke insert, update, delete on public.seller_payouts from anon, authenticated;
drop policy if exists "Sellers see their own payouts" on public.seller_payouts;
create policy "Sellers see their own payouts" on public.seller_payouts
  for select to authenticated using (seller_id = (select auth.uid()) or public.has_role('support'));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Whether a seller can take payments: Stripe onboarding finished and payouts switched on. Public, because the
-- listing page needs it, and it reveals nothing but yes or no.
create or replace function public.seller_can_accept_payments(p_seller uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.seller_payment_accounts
    where seller_id = p_seller and onboarding_status = 'complete' and payouts_enabled
  );
$$;

-- A fee in cents: percentages round half up to the nearest cent (exact numeric math), fixed fees are capped.
create or replace function public.fee_amount_cents(p_base integer, p_fee public.fee_configuration)
returns integer
language sql
immutable
as $$
  select case
    when p_fee.id is null then 0
    when p_fee.fee_type = 'percentage' then round(p_base::numeric * p_fee.fee_value / 100)::integer
    else least(round(p_fee.fee_value)::integer, p_base)
  end;
$$;

create or replace function public.notify_member(p_user uuid, p_type text, p_title text, p_message text, p_entity uuid, p_link text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, notification_type, title, message, related_entity_id, link_path)
  values (p_user, p_type, p_title, p_message, p_entity, p_link);
$$;

-- ---------------------------------------------------------------------------
-- Checkout: create the order and hold the listing in one transaction
-- ---------------------------------------------------------------------------

create or replace function public.checkout_create_order(
  p_buyer uuid,
  p_listing uuid,
  p_address uuid,
  p_quote uuid,
  p_rate_id text,
  p_tax_cents integer default 0,
  p_tax_jurisdiction jsonb default null,
  p_hold_minutes integer default 35)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.equipment_listings;
  q public.shipping_quotes;
  rate jsonb;
  commission public.fee_configuration;
  passthrough public.fee_configuration;
  ship_cents integer;
  commission_cents integer;
  passthrough_cents integer;
  total integer;
  o public.orders;
  title text;
begin
  if not public.setting_bool('checkout_enabled') then
    raise exception 'Checkout is not open yet' using errcode = '42501';
  end if;
  if p_tax_cents is null or p_tax_cents < 0 then
    raise exception 'Invalid tax amount' using errcode = '22023';
  end if;
  if p_hold_minutes is null or p_hold_minutes < 30 or p_hold_minutes > 120 then
    raise exception 'Invalid hold time' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_buyer and account_status = 'active') then
    raise exception 'Your account can''t buy right now' using errcode = '42501';
  end if;

  select * into l from public.equipment_listings where id = p_listing for update;
  if l.id is null then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  if l.seller_id = p_buyer then
    raise exception 'You can''t buy your own listing' using errcode = '42501';
  end if;
  if l.listing_status <> 'active' or l.asking_price_cents is null or (l.expires_at is not null and l.expires_at < now()) then
    raise exception 'This listing isn''t for sale right now' using errcode = '22023';
  end if;
  if l.quantity <> 1 then
    raise exception 'Only single items can be bought through checkout' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = l.seller_id and account_status = 'active') then
    raise exception 'This seller can''t sell right now' using errcode = '22023';
  end if;
  if not public.seller_can_accept_payments(l.seller_id) then
    raise exception 'The seller hasn''t finished setting up payouts yet' using errcode = '22023';
  end if;
  if exists (select 1 from public.user_blocks b where b.blocker_id = l.seller_id and b.blocked_id = p_buyer) then
    raise exception 'This listing isn''t for sale right now' using errcode = '42501';
  end if;
  if not exists (select 1 from public.addresses where id = p_address and user_id = p_buyer and address_type = 'shipping') then
    raise exception 'Choose a shipping address' using errcode = '22023';
  end if;

  select * into q from public.shipping_quotes
  where id = p_quote and buyer_id = p_buyer and listing_id = p_listing and address_id = p_address;
  if q.id is null or q.expires_at < now() then
    raise exception 'Those shipping rates have expired. Get new rates and try again.' using errcode = '22023';
  end if;
  select r into rate from jsonb_array_elements(q.rates) r
  where r ->> 'id' = p_rate_id and (r ->> 'available')::boolean;
  if rate is null then
    raise exception 'Choose an available shipping option' using errcode = '22023';
  end if;
  ship_cents := (rate ->> 'amountCents')::integer;
  if ship_cents is null or ship_cents < 0 then
    raise exception 'Invalid shipping rate' using errcode = '22023';
  end if;

  commission := public.current_fee('seller_commission');
  if commission.id is null then
    raise exception 'The marketplace commission is not configured' using errcode = '22023';
  end if;
  passthrough := public.current_fee('seller_processing_passthrough_percent');

  total := l.asking_price_cents + ship_cents + p_tax_cents;
  commission_cents := public.fee_amount_cents(l.asking_price_cents, commission);
  passthrough_cents := public.fee_amount_cents(total, passthrough);

  select coalesce(p.product_name, l.title) into title from public.equipment_listings x
  left join public.products p on p.id = x.product_id where x.id = l.id;

  insert into public.orders (
    buyer_id, seller_id, order_status, subtotal_cents, shipping_cost_cents, tax_amount_cents, tax_jurisdiction,
    platform_fee_cents, seller_payout_cents, total_amount_cents, fee_snapshot, shipping_address_id, shipping_rate_snapshot,
    checkout_expires_at)
  values (
    p_buyer, l.seller_id, 'awaiting_payment', l.asking_price_cents, ship_cents, p_tax_cents, p_tax_jurisdiction,
    commission_cents, greatest(0, l.asking_price_cents - commission_cents - passthrough_cents), total,
    jsonb_build_object(
      'seller_commission', jsonb_build_object('id', commission.id, 'fee_type', commission.fee_type, 'fee_value', commission.fee_value),
      'seller_processing_passthrough_percent', case when passthrough.id is null then null else
        jsonb_build_object('id', passthrough.id, 'fee_type', passthrough.fee_type, 'fee_value', passthrough.fee_value) end,
      'commission_cents', commission_cents,
      'passthrough_cents', passthrough_cents,
      'passthrough_base', 'order_total'),
    p_address,
    rate || jsonb_build_object('quote_id', q.id, 'provider', q.provider, 'is_test', q.is_test, 'package', q.package),
    now() + make_interval(mins => p_hold_minutes))
  returning * into o;

  begin
    insert into public.order_items (order_id, listing_id, product_id, seller_id, product_title_snapshot, condition_snapshot, unit_price_cents)
    values (o.id, l.id, l.product_id, l.seller_id, l.title,
      jsonb_build_object(
        'condition_score', l.condition_score, 'condition_label', l.condition_label,
        'structural_disclosure', l.structural_disclosure, 'has_cracks', l.has_cracks, 'has_rattle', l.has_rattle,
        'has_loose_end_cap', l.has_loose_end_cap, 'has_repairs', l.has_repairs, 'has_alterations', l.has_alterations,
        'has_significant_damage', l.has_significant_damage, 'cosmetic_wear', l.cosmetic_wear,
        'damage_disclosure', l.damage_disclosure, 'attributes', l.attributes, 'model_name', title),
      l.asking_price_cents);
  exception when unique_violation then
    raise exception 'Someone else is checking out this item right now. Try again in about 30 minutes.' using errcode = '23505';
  end;

  return o;
end;
$$;

-- Releases an unpaid order's hold (checkout expired or was cancelled). Returns false if it was no longer waiting.
create or replace function public.checkout_release_order(p_order uuid, p_reason text default 'expired')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders set order_status = 'cancelled', cancelled_at = now(), payment_issue = left(p_reason, 200)
  where id = p_order and order_status = 'awaiting_payment';
  if not found then
    return false;
  end if;
  update public.order_items set holds_listing = false where order_id = p_order;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payment confirmed (from a verified Stripe webhook only)
-- Returns: paid, already_paid, already_closed, amount_mismatch, needs_refund, not_found
-- ---------------------------------------------------------------------------

create or replace function public.payments_mark_paid(
  p_order uuid, p_session text, p_payment_intent text, p_charge text, p_amount_cents integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
  listing_ok boolean;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then
    return 'not_found';
  end if;
  if o.order_status in ('paid', 'processing', 'shipped', 'delivered', 'completed', 'disputed') then
    update public.orders set
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent),
      stripe_charge_id = coalesce(stripe_charge_id, p_charge)
    where id = o.id;
    return 'already_paid';
  end if;
  if o.order_status = 'refunded' then
    return 'already_closed';
  end if;
  if p_amount_cents is distinct from o.total_amount_cents then
    update public.orders set payment_issue = format('Paid amount %s does not match the order total %s', p_amount_cents, o.total_amount_cents)
    where id = o.id;
    return 'amount_mismatch';
  end if;

  if o.order_status = 'cancelled' then
    -- The payment arrived after the hold was released. Take the hold back if nobody else has it.
    begin
      update public.order_items set holds_listing = true where order_id = o.id;
    exception when unique_violation then
      update public.orders set payment_issue = 'Paid after the hold was released and the item went to another buyer',
        stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent), stripe_charge_id = coalesce(stripe_charge_id, p_charge)
      where id = o.id;
      return 'needs_refund';
    end;
    select bool_and(l.listing_status = 'active') into listing_ok
    from public.order_items i join public.equipment_listings l on l.id = i.listing_id where i.order_id = o.id;
    if not coalesce(listing_ok, false) then
      update public.order_items set holds_listing = false where order_id = o.id;
      update public.orders set payment_issue = 'Paid after the hold was released and the listing is no longer for sale',
        stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent), stripe_charge_id = coalesce(stripe_charge_id, p_charge)
      where id = o.id;
      return 'needs_refund';
    end if;
  end if;

  update public.orders set
    order_status = 'paid',
    paid_at = now(),
    cancelled_at = null,
    payment_issue = null,
    stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_session),
    stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id),
    stripe_charge_id = coalesce(p_charge, stripe_charge_id)
  where id = o.id;

  update public.equipment_listings set listing_status = 'reserved', featured = false, featured_until = null
  where id in (select listing_id from public.order_items where order_id = o.id) and listing_status = 'active';

  perform public.notify_member(o.buyer_id, 'order_paid', 'Payment received',
    format('Order %s is paid. The seller has been asked to ship.', o.order_number), o.id, '/account/purchases/' || o.id);
  perform public.notify_member(o.seller_id, 'order_received', 'You made a sale',
    format('Order %s is paid. Buy the shipping label from the order page.', o.order_number), o.id, '/seller/orders/' || o.id);
  return 'paid';
end;
$$;

-- ---------------------------------------------------------------------------
-- Tracking events (from the shipping webhook). Idempotent on the provider event id.
-- ---------------------------------------------------------------------------

create or replace function public.shipping_record_event(
  p_shipment uuid, p_event_id text, p_status text, p_description text, p_event_at timestamptz, p_location text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.shipping_shipments;
  o public.orders;
  rank_old integer;
  rank_new integer;
  ranks constant jsonb := '{"pending":0,"label_purchased":1,"pre_transit":2,"in_transit":3,"out_for_delivery":4,"delivered":5,"returned":6,"failure":3,"cancelled":0}';
  new_order_status text;
begin
  if p_status not in ('pre_transit', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'failure', 'unknown') then
    raise exception 'Unknown tracking status %', p_status using errcode = '22023';
  end if;
  select * into s from public.shipping_shipments where id = p_shipment for update;
  if s.id is null then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  insert into public.shipping_events (shipment_id, provider_event_id, tracking_status, tracking_description, event_timestamp, location)
  values (s.id, p_event_id, p_status, left(p_description, 500), coalesce(p_event_at, now()), left(p_location, 200))
  on conflict (provider_event_id) do nothing;
  if not found then
    return jsonb_build_object('duplicate', true);
  end if;

  if p_status = 'unknown' then
    return jsonb_build_object('duplicate', false, 'changed', false);
  end if;

  rank_old := coalesce((ranks ->> s.shipment_status)::int, 0);
  rank_new := (ranks ->> p_status)::int;
  -- Tracking only moves forward, except a failure or return, which always shows.
  if rank_new > rank_old or p_status in ('failure', 'returned') then
    update public.shipping_shipments set
      shipment_status = p_status,
      shipped_at = case when p_status in ('in_transit', 'out_for_delivery', 'delivered') then coalesce(shipped_at, coalesce(p_event_at, now())) else shipped_at end,
      delivered_at = case when p_status = 'delivered' then coalesce(p_event_at, now()) else delivered_at end
    where id = s.id;
  else
    return jsonb_build_object('duplicate', false, 'changed', false);
  end if;

  select * into o from public.orders where id = s.order_id for update;
  new_order_status := o.order_status;
  if p_status in ('in_transit', 'out_for_delivery') and o.order_status in ('paid', 'processing') then
    new_order_status := 'shipped';
    update public.orders set order_status = 'shipped', shipped_at = coalesce(shipped_at, coalesce(p_event_at, now())) where id = o.id;
  elsif p_status = 'delivered' then
    if o.order_status in ('paid', 'processing', 'shipped') then
      new_order_status := 'delivered';
      update public.orders set order_status = 'delivered', shipped_at = coalesce(shipped_at, coalesce(p_event_at, now())),
        delivered_at = coalesce(p_event_at, now()) where id = o.id;
    elsif o.order_status = 'disputed' then
      update public.orders set delivered_at = coalesce(delivered_at, coalesce(p_event_at, now())) where id = o.id;
    end if;
  end if;

  if p_status in ('in_transit', 'delivered', 'returned', 'failure') then
    perform public.notify_member(o.buyer_id, 'tracking_' || p_status,
      case p_status when 'in_transit' then 'Your order is on its way' when 'delivered' then 'Your order was delivered'
        when 'returned' then 'Your package is being returned' else 'There is a delivery problem' end,
      format('Order %s: %s', o.order_number, coalesce(p_description, replace(p_status, '_', ' '))), o.id, '/account/purchases/' || o.id);
  end if;
  if p_status in ('returned', 'failure') then
    perform public.notify_member(o.seller_id, 'tracking_' || p_status, 'Delivery problem on an order',
      format('Order %s: %s', o.order_number, coalesce(p_description, replace(p_status, '_', ' '))), o.id, '/seller/orders/' || o.id);
  end if;

  return jsonb_build_object('duplicate', false, 'changed', true, 'shipment_status', p_status,
    'order_status', new_order_status, 'order_changed', new_order_status is distinct from o.order_status, 'order_id', o.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Completion: record the seller's transfer, mark the listing sold, add the verified sale to price history.
-- Returns: completed, already_completed, transfer_recorded_dispute_open, transfer_recorded_not_ready.
-- The transfer id is always stored, so a transfer made at Stripe is never forgotten.
-- ---------------------------------------------------------------------------

-- Orders that can complete now: delivered and past the inspection window, or the buyer confirmed receipt;
-- no open dispute; no transfer yet; nothing refunded in full.
drop function if exists public.orders_ready_to_complete(integer);
create or replace function public.orders_ready_to_complete(p_limit integer default 50, p_order uuid default null)
returns setof public.orders
language sql
stable
security definer
set search_path = public
as $$
  select o.* from public.orders o
  where o.stripe_transfer_id is null
    and (p_order is null or o.id = p_order)
    and o.refunded_amount_cents < o.total_amount_cents
    and (
      (o.order_status = 'delivered' and o.delivered_at <= now() - make_interval(days => public.setting_int('inspection_window_days', 2)))
      or (o.order_status in ('shipped', 'delivered') and o.buyer_confirmed_at is not null)
    )
    and not exists (
      select 1 from public.disputes d where d.order_id = o.id and d.status in ('open', 'awaiting_seller', 'awaiting_buyer', 'under_review'))
  order by o.delivered_at nulls last
  limit p_limit;
$$;

create or replace function public.payments_complete_order(p_order uuid, p_transfer_id text, p_transfer_cents integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
  item record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if o.order_status = 'completed' then
    return 'already_completed';
  end if;
  if p_transfer_id is not null then
    update public.orders set stripe_transfer_id = p_transfer_id, transfer_amount_cents = p_transfer_cents, transfer_error = null where id = o.id;
  end if;
  if exists (select 1 from public.disputes d where d.order_id = o.id and d.status in ('open', 'awaiting_seller', 'awaiting_buyer', 'under_review')) then
    return 'transfer_recorded_dispute_open';
  end if;
  if o.order_status not in ('delivered', 'shipped')
    or (o.buyer_confirmed_at is null and (o.order_status <> 'delivered'
      or o.delivered_at > now() - make_interval(days => public.setting_int('inspection_window_days', 2)))) then
    return 'transfer_recorded_not_ready';
  end if;

  update public.orders set order_status = 'completed', completed_at = now(),
    delivered_at = coalesce(delivered_at, buyer_confirmed_at, now())
  where id = o.id;
  update public.equipment_listings set listing_status = 'sold'
  where id in (select listing_id from public.order_items where order_id = o.id);

  for item in
    select i.unit_price_cents, i.product_id, l.condition_score, l.attributes, p.model_year, p.certification_association
    from public.order_items i
    join public.equipment_listings l on l.id = i.listing_id
    left join public.products p on p.id = i.product_id
    where i.order_id = o.id and i.product_id is not null
  loop
    insert into public.price_history (product_id, transaction_id, sold_price_cents, condition_score, model_year, weight_oz, certification,
      sale_date, verified_transaction, data_source)
    values (
      item.product_id, o.id, item.unit_price_cents, item.condition_score,
      coalesce(case when (item.attributes ->> 'model_year') ~ '^\d{4}$' then (item.attributes ->> 'model_year')::smallint end, item.model_year),
      case when (item.attributes ->> 'weight_oz') ~ '^\d{1,2}(\.\d)?$' then (item.attributes ->> 'weight_oz')::numeric end,
      coalesce(
        case when jsonb_typeof(item.attributes -> 'certification') = 'array'
          then array(select jsonb_array_elements_text(item.attributes -> 'certification')) end,
        nullif(item.certification_association, '{}')),
      current_date, true, 'marketplace')
    on conflict (transaction_id) do nothing;
  end loop;

  perform public.notify_member(o.buyer_id, 'order_completed', 'Order complete',
    format('Order %s is complete. Leave a review for the seller.', o.order_number), o.id, '/account/purchases/' || o.id);
  perform public.notify_member(o.seller_id, 'order_completed', 'You''ve been paid',
    format('Order %s is complete and your payout is on its way to Stripe.', o.order_number), o.id, '/seller/payouts');
  return 'completed';
end;
$$;

-- ---------------------------------------------------------------------------
-- Refunds, chargebacks and payouts
-- ---------------------------------------------------------------------------

-- Applies the refunded total (never decreases). A full refund closes the order and releases the listing if the
-- item hadn't shipped.
create or replace function public.payments_apply_refund_total(p_order uuid, p_refunded_total integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
  new_total integer;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then
    return 'not_found';
  end if;
  new_total := least(o.total_amount_cents, greatest(o.refunded_amount_cents, coalesce(p_refunded_total, 0)));
  update public.orders set refunded_amount_cents = new_total where id = o.id;
  if new_total >= o.total_amount_cents and o.order_status not in ('refunded', 'cancelled') then
    update public.orders set order_status = 'refunded' where id = o.id;
    update public.order_items set holds_listing = false where order_id = o.id;
    if o.shipped_at is null then
      update public.equipment_listings set listing_status = 'active'
      where id in (select listing_id from public.order_items where order_id = o.id) and listing_status = 'reserved';
    end if;
    return 'refunded';
  end if;
  return case when new_total > o.refunded_amount_cents then 'partially_refunded' else 'unchanged' end;
end;
$$;

create or replace function public.admin_record_refund(
  p_actor uuid, p_order uuid, p_amount_cents integer, p_reason text, p_refund_id text,
  p_reversal_id text default null, p_reversal_cents integer default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
  outcome text;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.admin_require(p_actor, array['support']);
  if p_reversal_id is not null and not public.staff_has_role(p_actor, 'admin') then
    raise exception 'Only an admin can reverse a seller transfer' using errcode = '42501';
  end if;
  if reason is null or char_length(reason) < 3 then
    raise exception 'Give a reason for the refund' using errcode = '22023';
  end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > o.total_amount_cents then
    raise exception 'Invalid refund amount' using errcode = '22023';
  end if;

  insert into public.payment_refunds (order_id, stripe_refund_id, amount_cents, reason, transfer_reversal_id, transfer_reversal_cents, created_by)
  values (o.id, p_refund_id, p_amount_cents, left(reason, 500), p_reversal_id, p_reversal_cents, p_actor)
  on conflict (stripe_refund_id) do nothing;
  if not found then
    return 'already_recorded';
  end if;

  if p_reversal_id is not null then
    update public.orders set transfer_reversed_cents = transfer_reversed_cents + coalesce(p_reversal_cents, 0) where id = o.id;
  end if;
  outcome := public.payments_apply_refund_total(o.id,
    (select coalesce(sum(amount_cents), 0) from public.payment_refunds where order_id = o.id)::integer);

  perform public.notify_member(o.buyer_id, 'refund_issued', 'Refund issued',
    format('A refund of $%s was issued for order %s.', to_char(p_amount_cents / 100.0, 'FM999999990.00'), o.order_number), o.id,
    '/account/purchases/' || o.id);
  perform public.notify_member(o.seller_id, 'refund_issued', 'A refund was issued on your sale',
    format('Order %s: $%s was refunded to the buyer.', o.order_number, to_char(p_amount_cents / 100.0, 'FM999999990.00')), o.id,
    '/seller/orders/' || o.id);
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'order.refunded', 'order', o.id, jsonb_build_object(
    'amount_cents', p_amount_cents, 'reason', reason, 'stripe_refund_id', p_refund_id,
    'transfer_reversal_id', p_reversal_id, 'transfer_reversal_cents', p_reversal_cents,
    'previous_status', o.order_status, 'outcome', outcome));
  return outcome;
end;
$$;

-- A card chargeback reported by Stripe. Opens (or updates) a dispute row and holds the order.
create or replace function public.payments_record_chargeback(
  p_order uuid, p_stripe_dispute text, p_reason text, p_stripe_status text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
  new_status text := case
    when p_stripe_status = 'won' then 'resolved_seller'
    when p_stripe_status = 'lost' then 'resolved_buyer'
    else 'under_review' end;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then
    return 'not_found';
  end if;
  insert into public.disputes (order_id, opened_by, dispute_type, description, status, stripe_dispute_id, resolved_at)
  values (o.id, o.buyer_id, 'payment_chargeback',
    left(format('Card chargeback opened with the buyer''s bank. Stripe reason: %s.', coalesce(p_reason, 'not given')), 5000),
    new_status, p_stripe_dispute, case when new_status like 'resolved_%' then now() end)
  on conflict (stripe_dispute_id) do update set status = excluded.status, resolved_at = excluded.resolved_at;

  if new_status = 'under_review' and o.order_status not in ('disputed', 'refunded', 'cancelled') then
    update public.orders set status_before_dispute = order_status, order_status = 'disputed' where id = o.id;
    perform public.notify_member(o.seller_id, 'chargeback_opened', 'A payment on your sale is disputed',
      format('The buyer''s bank opened a chargeback on order %s. Payment to you is on hold while we respond.', o.order_number), o.id,
      '/seller/orders/' || o.id);
  elsif new_status = 'resolved_seller' and o.order_status = 'disputed' and o.status_before_dispute is not null
    and not exists (select 1 from public.disputes d where d.order_id = o.id and d.status in ('open', 'awaiting_seller', 'awaiting_buyer', 'under_review')) then
    update public.orders set order_status = status_before_dispute, status_before_dispute = null where id = o.id;
  end if;
  return new_status;
end;
$$;

-- The buyer says the item arrived: delivered now (if tracking hadn't said so) and eligible to complete.
create or replace function public.orders_buyer_confirm_received(p_buyer uuid, p_order uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.buyer_id <> p_buyer then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if o.order_status not in ('shipped', 'delivered') then
    raise exception 'You can confirm receipt once the order has shipped' using errcode = '22023';
  end if;
  update public.orders set buyer_confirmed_at = coalesce(buyer_confirmed_at, now()), order_status = 'delivered',
    delivered_at = coalesce(delivered_at, now())
  where id = o.id;
  return 'confirmed';
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin reporting for payments (a separate function so admin_overview stays as the admin track wrote it)
-- ---------------------------------------------------------------------------

create or replace function public.admin_payments_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'processing_cents', (select coalesce(sum(payment_processing_cents), 0) from public.orders where paid_at is not null),
    'orders_missing_processing', (select count(*) from public.orders where paid_at is not null and payment_processing_cents is null),
    'transferred_cents', (select coalesce(sum(transfer_amount_cents), 0) from public.orders where stripe_transfer_id is not null),
    'transfer_reversed_cents', (select coalesce(sum(transfer_reversed_cents), 0) from public.orders),
    'awaiting_transfer', (select count(*) from public.orders where order_status in ('paid', 'processing', 'shipped', 'delivered') and stripe_transfer_id is null),
    'transfer_errors', (select count(*) from public.orders where transfer_error is not null and stripe_transfer_id is null),
    'payment_issues', (select count(*) from public.orders where payment_issue is not null and order_status <> 'cancelled'),
    'failed_payouts', (select count(*) from public.seller_payouts where status = 'failed'),
    'accounts_requirements_due', (select count(*) from public.seller_payment_accounts where jsonb_array_length(requirements_due) > 0 or onboarding_status = 'restricted'),
    'shipping_label_cents', (select coalesce(sum(shipping_cost_cents), 0) from public.shipping_shipments where not is_return and shipment_status <> 'cancelled'),
    'shipping_charged_cents', (select coalesce(sum(o.shipping_cost_cents), 0) from public.orders o
      where exists (select 1 from public.shipping_shipments s where s.order_id = o.id and not s.is_return and s.shipment_status <> 'cancelled'))
  );
$$;

-- ---------------------------------------------------------------------------
-- Access: server-only functions, except the public yes/no payments check.
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.setting_bool(text)',
    'public.setting_int(text, integer)',
    'public.notify_member(uuid, text, text, text, uuid, text)',
    'public.checkout_create_order(uuid, uuid, uuid, uuid, text, integer, jsonb, integer)',
    'public.checkout_release_order(uuid, text)',
    'public.payments_mark_paid(uuid, text, text, text, integer)',
    'public.shipping_record_event(uuid, text, text, text, timestamptz, text)',
    'public.orders_ready_to_complete(integer, uuid)',
    'public.payments_complete_order(uuid, text, integer)',
    'public.payments_apply_refund_total(uuid, integer)',
    'public.admin_record_refund(uuid, uuid, integer, text, text, text, integer)',
    'public.payments_record_chargeback(uuid, text, text, text)',
    'public.orders_buyer_confirm_received(uuid, uuid)',
    'public.admin_payments_overview()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

grant execute on function public.seller_can_accept_payments(uuid) to anon, authenticated, service_role;
grant execute on function public.fee_amount_cents(integer, public.fee_configuration) to anon, authenticated, service_role;
