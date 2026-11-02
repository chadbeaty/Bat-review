-- Accepted offers in checkout: the offer amount is the price, the listing is reserved for the offer's buyer
-- during the payment window, and the reservation ends when the window lapses or the offer is withdrawn.
-- Additive. Never edits earlier migrations; replaces two functions (same names) with versions that know offers.
--
-- Payment window: an accepted offer's expires_at is set to now() + offer_expiry_hours when it is accepted
-- (20261103000200_trust.sql), so the same admin setting controls both response time and payment time.
--
-- Reservation = an offer with status 'accepted' and expires_at in the future. There is no separate flag to go
-- stale: when expire_offers() flips the offer, or it is withdrawn, the reservation is simply gone.

-- ---------------------------------------------------------------------------
-- Who holds the reservation? Public (the listing page needs it); reveals only that the item is reserved and
-- until when, plus the offer id to the buyer it is reserved for.
-- ---------------------------------------------------------------------------

create or replace function public.listing_offer_reservation(p_listing uuid)
returns table (reserved boolean, held_by_me boolean, reserved_until timestamptz, offer_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select true,
    coalesce(o.buyer_id = (select auth.uid()), false),
    o.expires_at,
    case when o.buyer_id = (select auth.uid()) then o.id else null end
  from public.offers o
  where o.listing_id = p_listing and o.status = 'accepted' and o.expires_at > now()
  limit 1;
$$;
grant execute on function public.listing_offer_reservation(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Offers: an accepted offer can be withdrawn by either member until it is paid for, which frees the listing.
-- (Pending offers behave as before.)
-- ---------------------------------------------------------------------------

create or replace function public.respond_to_offer(
  p_actor uuid, p_offer uuid, p_action text, p_amount_cents integer default null, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.offers;
  l public.equipment_listings;
  other uuid;
  new_id uuid;
  rejected uuid[] := '{}';
begin
  perform public.expire_offers();
  select * into o from public.offers where id = p_offer for update;
  if o.id is null or p_actor not in (o.buyer_id, o.seller_id) then
    raise exception 'Offer not found' using errcode = 'P0002';
  end if;

  -- Backing out of an accepted offer before paying (either member) releases the reservation.
  if o.status = 'accepted' and p_action = 'withdraw' then
    if exists (select 1 from public.orders x where x.offer_id = o.id and x.order_status = 'awaiting_payment') then
      raise exception 'A payment for this offer is in progress. Try again in about 30 minutes.' using errcode = '22023';
    end if;
    update public.offers set status = 'withdrawn', responded_at = now() where id = o.id;
    return jsonb_build_object('status', 'withdrawn', 'offer_id', o.id,
      'notify', case when p_actor = o.buyer_id then o.seller_id else o.buyer_id end);
  end if;

  if o.status <> 'pending' then
    raise exception 'This offer is %, so it can no longer be changed.', o.status using errcode = '22023';
  end if;
  other := case when o.made_by = o.buyer_id then o.seller_id else o.buyer_id end;
  select * into l from public.equipment_listings where id = o.listing_id for update;

  if p_action = 'withdraw' then
    if p_actor <> o.made_by then
      raise exception 'Only the member who made an offer can withdraw it' using errcode = '42501';
    end if;
    update public.offers set status = 'withdrawn', responded_at = now() where id = o.id;
    return jsonb_build_object('status', 'withdrawn', 'offer_id', o.id, 'notify', other);
  end if;

  if p_actor <> other then
    raise exception 'You cannot respond to your own offer' using errcode = '42501';
  end if;
  if l.id is null or l.listing_status <> 'active' then
    update public.offers set status = 'expired', responded_at = now() where id = o.id;
    raise exception 'This listing is no longer available.' using errcode = '22023';
  end if;

  if p_action = 'reject' then
    update public.offers set status = 'rejected', responded_at = now() where id = o.id;
    return jsonb_build_object('status', 'rejected', 'offer_id', o.id, 'notify', o.made_by);
  elsif p_action = 'accept' then
    if exists (select 1 from public.offers where listing_id = o.listing_id and status = 'accepted') then
      raise exception 'Another offer on this listing was already accepted.' using errcode = '23505';
    end if;
    if exists (select 1 from public.order_items i where i.listing_id = o.listing_id and i.holds_listing) then
      raise exception 'Someone is checking out this item right now. Try again in about 30 minutes.' using errcode = '23505';
    end if;
    update public.offers set status = 'accepted', responded_at = now(), expires_at = now() + public.offer_expiry_interval()
      where id = o.id;
    with r as (
      update public.offers set status = 'rejected', responded_at = now()
      where listing_id = o.listing_id and status = 'pending' and id <> o.id
      returning id
    ) select coalesce(array_agg(id), '{}') into rejected from r;
    return jsonb_build_object('status', 'accepted', 'offer_id', o.id, 'notify', o.made_by, 'auto_rejected', to_jsonb(rejected));
  elsif p_action = 'counter' then
    if p_amount_cents is null or p_amount_cents < 100 or p_amount_cents >= l.asking_price_cents then
      raise exception 'A counteroffer must be at least $1.00 and below the asking price.' using errcode = '22023';
    end if;
    update public.offers set status = 'countered', responded_at = now() where id = o.id;
    insert into public.offers (listing_id, buyer_id, seller_id, made_by, parent_offer_id, amount_cents, message, status, expires_at)
    values (o.listing_id, o.buyer_id, o.seller_id, p_actor, o.id, p_amount_cents, nullif(left(trim(coalesce(p_message, '')), 500), ''),
      'pending', now() + public.offer_expiry_interval())
    returning id into new_id;
    return jsonb_build_object('status', 'countered', 'offer_id', o.id, 'new_offer_id', new_id, 'notify', o.made_by);
  end if;
  raise exception 'Unknown offer action' using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- Checkout: same function as before plus an optional accepted offer.
--  * With p_offer: the offer must belong to this buyer and listing, be accepted, and still be inside its
--    payment window. The offer amount replaces the asking price; commission, passthrough and totals are
--    computed on it exactly as for a list-price order, and the order records offer_id.
--  * Without p_offer: an unexpired accepted offer held by someone else reserves the listing, so the order is refused.
-- ---------------------------------------------------------------------------

drop function if exists public.checkout_create_order(uuid, uuid, uuid, uuid, text, integer, jsonb, integer);

create or replace function public.checkout_create_order(
  p_buyer uuid,
  p_listing uuid,
  p_address uuid,
  p_quote uuid,
  p_rate_id text,
  p_tax_cents integer default 0,
  p_tax_jurisdiction jsonb default null,
  p_hold_minutes integer default 35,
  p_offer uuid default null)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.equipment_listings;
  q public.shipping_quotes;
  off public.offers;
  reserved_for uuid;
  rate jsonb;
  commission public.fee_configuration;
  passthrough public.fee_configuration;
  item_cents integer;
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

  -- Reserved for another buyer by an accepted offer that is still inside its payment window?
  select buyer_id into reserved_for from public.offers
  where listing_id = p_listing and status = 'accepted' and expires_at > now() limit 1;
  if reserved_for is not null and reserved_for <> p_buyer then
    raise exception 'This item is reserved for another buyer while they pay for an accepted offer.' using errcode = '22023';
  end if;

  item_cents := l.asking_price_cents;
  if p_offer is not null then
    select * into off from public.offers where id = p_offer for update;
    if off.id is null or off.buyer_id <> p_buyer or off.listing_id <> p_listing then
      raise exception 'Offer not found' using errcode = 'P0002';
    end if;
    if off.status <> 'accepted' then
      raise exception 'This offer is %, so it can''t be paid for.', off.status using errcode = '22023';
    end if;
    if off.expires_at <= now() then
      raise exception 'The payment window for this offer has ended.' using errcode = '22023';
    end if;
    item_cents := off.amount_cents;
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

  total := item_cents + ship_cents + p_tax_cents;
  commission_cents := public.fee_amount_cents(item_cents, commission);
  passthrough_cents := public.fee_amount_cents(total, passthrough);

  select coalesce(p.product_name, l.title) into title from public.equipment_listings x
  left join public.products p on p.id = x.product_id where x.id = l.id;

  insert into public.orders (
    buyer_id, seller_id, order_status, subtotal_cents, shipping_cost_cents, tax_amount_cents, tax_jurisdiction,
    platform_fee_cents, seller_payout_cents, total_amount_cents, fee_snapshot, shipping_address_id, shipping_rate_snapshot,
    checkout_expires_at, offer_id)
  values (
    p_buyer, l.seller_id, 'awaiting_payment', item_cents, ship_cents, p_tax_cents, p_tax_jurisdiction,
    commission_cents, greatest(0, item_cents - commission_cents - passthrough_cents), total,
    jsonb_build_object(
      'seller_commission', jsonb_build_object('id', commission.id, 'fee_type', commission.fee_type, 'fee_value', commission.fee_value),
      'seller_processing_passthrough_percent', case when passthrough.id is null then null else
        jsonb_build_object('id', passthrough.id, 'fee_type', passthrough.fee_type, 'fee_value', passthrough.fee_value) end,
      'commission_cents', commission_cents,
      'passthrough_cents', passthrough_cents,
      'passthrough_base', 'order_total',
      'list_price_cents', l.asking_price_cents,
      'offer_id', p_offer),
    p_address,
    rate || jsonb_build_object('quote_id', q.id, 'provider', q.provider, 'is_test', q.is_test, 'package', q.package),
    now() + make_interval(mins => p_hold_minutes),
    p_offer)
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
      item_cents);
  exception when unique_violation then
    raise exception 'Someone else is checking out this item right now. Try again in about 30 minutes.' using errcode = '23505';
  end;

  return o;
end;
$$;

revoke all on function public.checkout_create_order(uuid, uuid, uuid, uuid, text, integer, jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.checkout_create_order(uuid, uuid, uuid, uuid, text, integer, jsonb, integer, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Paying for an offer's order uses the offer up (status 'completed'), so it can't be paid for twice.
-- ---------------------------------------------------------------------------

create or replace function public.orders_use_up_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.offer_id is not null and new.order_status = 'paid' and old.order_status is distinct from 'paid' then
    update public.offers set status = 'completed' where id = new.offer_id and status in ('accepted', 'expired');
  end if;
  return new;
end;
$$;

drop trigger if exists orders_use_up_offer on public.orders;
create trigger orders_use_up_offer after update of order_status on public.orders
  for each row execute function public.orders_use_up_offer();
