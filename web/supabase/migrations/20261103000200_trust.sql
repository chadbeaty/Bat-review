-- Trust: offers rules, inbox summary, dispute messages, report source, admin dispute functions.
-- Additive and safe to run more than once.

-- ---------------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------------

-- Only one accepted offer per listing at a time, and only one open offer per buyer and listing.
create unique index if not exists offers_one_accepted_per_listing on public.offers (listing_id) where status = 'accepted';
create unique index if not exists offers_one_open_per_buyer on public.offers (listing_id, buyer_id) where status = 'pending';

create or replace function public.offer_expiry_interval()
returns interval
language sql
stable
as $$
  select make_interval(hours => coalesce((select (value #>> '{}')::int from public.site_settings where key = 'offer_expiry_hours'), 48));
$$;

-- Buyers' offers get the configured expiry and must be below the asking price.
create or replace function public.prepare_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  asking integer;
begin
  select asking_price_cents into asking from public.equipment_listings where id = new.listing_id;
  if new.parent_offer_id is null then
    if asking is not null and new.amount_cents >= asking then
      raise exception 'Offers must be below the asking price. Use Buy now to pay the full price.' using errcode = '22023';
    end if;
  end if;
  if public.is_end_user() then
    new.expires_at := now() + public.offer_expiry_interval();
  end if;
  return new;
end;
$$;

drop trigger if exists offers_prepare on public.offers;
create trigger offers_prepare before insert on public.offers
  for each row execute function public.prepare_offer();

-- Marks open offers past their expiry as expired. Safe to call from a scheduler. Returns the offers it expired.
create or replace function public.expire_offers()
returns table (offer_id uuid, buyer_id uuid, seller_id uuid, listing_id uuid)
language sql
security definer
set search_path = public
as $$
  update public.offers o set status = 'expired', responded_at = coalesce(o.responded_at, now())
  where o.status in ('pending', 'accepted') and o.expires_at <= now()
  returning o.id, o.buyer_id, o.seller_id, o.listing_id;
$$;

-- The one place offers change state. Called by the server with the service role after it has verified the
-- signed-in member. Actions: accept, reject, counter (the party who did not make the offer), withdraw (its maker).
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
-- Blocks: the earlier policies looked up user_blocks as the buyer, but members can only see their own blocks, so
-- a seller's block was invisible to them and never applied. This definer function can see every block.
-- ---------------------------------------------------------------------------

create or replace function public.has_blocked(p_blocker uuid, p_blocked uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_blocks where blocker_id = p_blocker and blocked_id = p_blocked);
$$;
revoke all on function public.has_blocked(uuid, uuid) from public, anon;
grant execute on function public.has_blocked(uuid, uuid) to authenticated, service_role;

drop policy if exists "Buyers make offers on live listings" on public.offers;
create policy "Buyers make offers on live listings" on public.offers
  for insert to authenticated
  with check (
    buyer_id = (select auth.uid()) and made_by = (select auth.uid()) and status = 'pending' and parent_offer_id is null
    and exists (
      select 1 from public.equipment_listings l
      where l.id = listing_id and l.seller_id = offers.seller_id and l.listing_status = 'active' and l.accepts_offers)
    and not public.has_blocked(offers.seller_id, (select auth.uid()))
  );

drop policy if exists "Buyers start conversations about a listing" on public.conversations;
create policy "Buyers start conversations about a listing" on public.conversations
  for insert to authenticated
  with check (
    buyer_id = (select auth.uid())
    and exists (select 1 from public.equipment_listings l where l.id = listing_id and l.seller_id = conversations.seller_id)
    and not public.has_blocked(conversations.seller_id, (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Inbox summary (security invoker, so row level security limits it to the caller's conversations)
-- ---------------------------------------------------------------------------

create or replace function public.inbox_summary()
returns table (conversation_id uuid, last_body text, last_sender uuid, last_at timestamptz, unread integer)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id,
    (select m.message_text from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
    (select m.sender_id from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
    c.last_message_at,
    (select count(*)::int from public.messages m where m.conversation_id = c.id and m.recipient_id = (select auth.uid()) and m.read_at is null)
  from public.conversations c
  where (select auth.uid()) in (c.buyer_id, c.seller_id);
$$;

-- ---------------------------------------------------------------------------
-- Reports: where a report came from
-- ---------------------------------------------------------------------------

alter table public.reports add column if not exists source text not null default 'member';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reports_source_check') then
    alter table public.reports add constraint reports_source_check check (source in ('member', 'auto'));
  end if;
end;
$$;

-- Members cannot mark their own reports as automatic.
drop policy if exists "Members file reports" on public.reports;
create policy "Members file reports" on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open' and resolved_by is null and source = 'member');

-- ---------------------------------------------------------------------------
-- Dispute messages
-- ---------------------------------------------------------------------------

create table if not exists public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  author_role text not null check (author_role in ('buyer', 'seller', 'support')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists dispute_messages_dispute_idx on public.dispute_messages (dispute_id, created_at);

alter table public.dispute_messages enable row level security;

create or replace function public.prepare_dispute_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.disputes;
  o public.orders;
begin
  if not public.is_end_user() then
    return new;
  end if;
  select * into d from public.disputes where id = new.dispute_id;
  select * into o from public.orders where id = d.order_id;
  if d.id is null or o.id is null or new.author_id not in (o.buyer_id, o.seller_id) then
    raise exception 'You are not part of this case' using errcode = '42501';
  end if;
  if d.status in ('resolved_buyer', 'resolved_seller', 'closed') then
    raise exception 'This case is closed' using errcode = '22023';
  end if;
  new.author_role := case when new.author_id = o.buyer_id then 'buyer' else 'seller' end;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists dispute_messages_prepare on public.dispute_messages;
create trigger dispute_messages_prepare before insert on public.dispute_messages
  for each row execute function public.prepare_dispute_message();

-- Messages are never edited.
create or replace function public.dispute_messages_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Messages cannot be changed' using errcode = '42501';
end;
$$;
drop trigger if exists dispute_messages_no_update on public.dispute_messages;
create trigger dispute_messages_no_update before update on public.dispute_messages
  for each row execute function public.dispute_messages_immutable();

drop policy if exists "Case parties and support read dispute messages" on public.dispute_messages;
create policy "Case parties and support read dispute messages" on public.dispute_messages
  for select to authenticated using (exists (select 1 from public.disputes d where d.id = dispute_id));
drop policy if exists "Case parties write dispute messages" on public.dispute_messages;
create policy "Case parties write dispute messages" on public.dispute_messages
  for insert to authenticated with check (author_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Admin dispute functions (service role only; audit every change)
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_dispute(
  p_actor uuid, p_dispute uuid, p_status text, p_admin_notes text default null, p_resolution text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.disputes;
  o public.orders;
  closing boolean := p_status in ('resolved_buyer', 'resolved_seller', 'closed');
begin
  perform public.admin_require(p_actor, array['support']);
  if p_status not in ('open', 'awaiting_seller', 'awaiting_buyer', 'under_review', 'resolved_buyer', 'resolved_seller', 'closed') then
    raise exception 'Unknown dispute status' using errcode = '22023';
  end if;
  select * into d from public.disputes where id = p_dispute for update;
  if d.id is null then
    raise exception 'Dispute not found' using errcode = 'P0002';
  end if;
  if closing and nullif(trim(coalesce(p_resolution, d.resolution, '')), '') is null then
    raise exception 'Write a resolution before closing the case' using errcode = '22023';
  end if;
  update public.disputes set
    status = p_status,
    admin_notes = coalesce(nullif(trim(coalesce(p_admin_notes, '')), ''), admin_notes),
    resolution = coalesce(nullif(trim(coalesce(p_resolution, '')), ''), resolution),
    resolved_at = case when closing then coalesce(resolved_at, now()) else null end
  where id = p_dispute;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'dispute.' || p_status, 'dispute', p_dispute,
    jsonb_build_object('from', d.status, 'to', p_status, 'resolution', p_resolution, 'notes', p_admin_notes));
  select * into o from public.orders where id = d.order_id;
  return jsonb_build_object('buyer_id', o.buyer_id, 'seller_id', o.seller_id, 'order_number', o.order_number);
end;
$$;

create or replace function public.admin_add_dispute_message(p_actor uuid, p_dispute uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
begin
  perform public.admin_require(p_actor, array['support']);
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 4000 then
    raise exception 'Write a message (up to 4000 characters)' using errcode = '22023';
  end if;
  select o2.* into o from public.disputes d join public.orders o2 on o2.id = d.order_id where d.id = p_dispute;
  if o.id is null then
    raise exception 'Dispute not found' using errcode = 'P0002';
  end if;
  insert into public.dispute_messages (dispute_id, author_id, author_role, body) values (p_dispute, p_actor, 'support', trim(p_body));
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'dispute.message', 'dispute', p_dispute, jsonb_build_object('length', char_length(p_body)));
  return jsonb_build_object('buyer_id', o.buyer_id, 'seller_id', o.seller_id, 'order_number', o.order_number);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.expire_offers()',
    'public.respond_to_offer(uuid, uuid, text, integer, text)',
    'public.admin_update_dispute(uuid, uuid, text, text, text)',
    'public.admin_add_dispute_message(uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
