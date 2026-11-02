-- Administration: server-only admin functions (each one checks the acting staff member's role and writes the
-- audit log with that person as the actor), fee-history protection, settings validation, support messages
-- and an email delivery log. Safe to run more than once.
--
-- How admin writes work: admin screens verify the signed-in member, their staff role and MFA on the server,
-- then call these functions with the service role key, passing the staff member's id as p_actor. The service
-- role has no auth.uid(), so the functions record p_actor in audit_logs. None of these functions can be called
-- by browsers (anon or authenticated): execute is granted to service_role only.

-- ---------------------------------------------------------------------------
-- Who is acting: the signed-in member, or the staff member an admin function is acting for.
-- ---------------------------------------------------------------------------

create or replace function public.audit_actor()
returns uuid
language sql
stable
as $$
  select coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
$$;

-- Same as before, but fee and setting changes made through the admin functions now record who made them.
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
    public.audit_actor(),
    lower(tg_op),
    tg_table_name,
    (coalesce(new_row, old_row) ->> 'id')::uuid,
    jsonb_build_object('old', old_row, 'new', new_row)
      || case when tg_table_name = 'site_settings' then jsonb_build_object('key', coalesce(new_row, old_row) ->> 'key') else '{}'::jsonb end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- True when the member holds the role (admins hold every role). Unlike has_role(), takes the member id.
create or replace function public.staff_has_role(p_user uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null and exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id and p.account_status = 'active'
    where r.user_id = p_user and (r.role = p_role or r.role = 'admin' or p_role = 'any')
  );
$$;

create or replace function public.admin_require(p_actor uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from unnest(p_roles) as want where public.staff_has_role(p_actor, want)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
end;
$$;

-- Writes one audit entry for a staff action.
create or replace function public.admin_log(p_actor uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  perform public.admin_require(p_actor, array['any']);
  if p_action !~ '^[a-z0-9_.]{2,64}$' or p_entity_type !~ '^[a-z0-9_]{2,64}$' then
    raise exception 'Invalid audit action or entity type' using errcode = '22023';
  end if;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Members: account status and staff roles
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_account_status(p_actor uuid, p_user uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_status text;
begin
  perform public.admin_require(p_actor, array['moderator']);
  if p_status not in ('active', 'suspended', 'banned') then
    raise exception 'Unknown account status' using errcode = '22023';
  end if;
  if p_user = p_actor then
    raise exception 'You cannot change your own account status' using errcode = '42501';
  end if;
  select account_status into old_status from public.profiles where id = p_user for update;
  if old_status is null then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if old_status = 'deleted' then
    raise exception 'This account was deleted' using errcode = '22023';
  end if;
  if old_status = 'banned' and not public.staff_has_role(p_actor, 'admin') then
    raise exception 'Only an admin can lift a ban' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'admin') and not public.staff_has_role(p_actor, 'admin') then
    raise exception 'Only an admin can change another admin' using errcode = '42501';
  end if;
  if old_status = p_status then
    return;
  end if;
  update public.profiles set account_status = p_status where id = p_user;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'user.' || case p_status when 'active' then 'reactivated' else p_status end, 'profile', p_user,
    jsonb_build_object('from', old_status, 'to', p_status, 'reason', nullif(trim(coalesce(p_reason, '')), '')));
end;
$$;

create or replace function public.admin_set_role(p_actor uuid, p_user uuid, p_role text, p_grant boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require(p_actor, array['admin']);
  if p_role not in ('admin', 'moderator', 'support') then
    raise exception 'Unknown role' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if not p_grant and p_role = 'admin' and p_user = p_actor then
    raise exception 'You cannot remove your own admin role' using errcode = '42501';
  end if;
  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role, p_actor) on conflict do nothing;
    if not found then return; end if;
  else
    delete from public.user_roles where user_id = p_user and role = p_role;
    if not found then return; end if;
  end if;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, case when p_grant then 'role.granted' else 'role.revoked' end, 'profile', p_user, jsonb_build_object('role', p_role));
end;
$$;

-- ---------------------------------------------------------------------------
-- Listings: removal (with a notification to the seller) and featuring
-- ---------------------------------------------------------------------------

create or replace function public.admin_remove_listing(p_actor uuid, p_listing uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.equipment_listings;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.admin_require(p_actor, array['moderator']);
  if reason is null or char_length(reason) < 5 or char_length(reason) > 1000 then
    raise exception 'Give a reason of 5 to 1000 characters' using errcode = '22023';
  end if;
  select * into l from public.equipment_listings where id = p_listing for update;
  if l.id is null then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  if l.listing_status in ('reserved', 'sold') then
    raise exception 'A listing with an order in progress cannot be removed here' using errcode = '22023';
  end if;
  if l.listing_status = 'removed' then
    return;
  end if;
  update public.equipment_listings set listing_status = 'removed', featured = false, featured_until = null where id = p_listing;
  insert into public.notifications (user_id, notification_type, title, message, related_entity_id, link_path)
  values (l.seller_id, 'listing_removed', 'Your listing was removed',
    format('"%s" was removed by our moderators. Reason: %s', l.title, reason), l.id, '/account');
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'listing.removed', 'equipment_listing', p_listing,
    jsonb_build_object('reason', reason, 'previous_status', l.listing_status, 'seller_id', l.seller_id, 'title', l.title));
end;
$$;

create or replace function public.admin_set_featured(p_actor uuid, p_listing uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.equipment_listings;
begin
  perform public.admin_require(p_actor, array['moderator']);
  select * into l from public.equipment_listings where id = p_listing for update;
  if l.id is null then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  if p_until is not null and (l.listing_status <> 'active' or p_until <= now()) then
    raise exception 'Only active listings can be featured, until a future date' using errcode = '22023';
  end if;
  update public.equipment_listings set featured = p_until is not null, featured_until = p_until where id = p_listing;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, case when p_until is null then 'listing.unfeatured' else 'listing.featured' end, 'equipment_listing', p_listing,
    jsonb_build_object('featured_until', p_until, 'previous_featured_until', l.featured_until));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports queue
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_report(p_actor uuid, p_report uuid, p_status text, p_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_status text;
begin
  perform public.admin_require(p_actor, array['moderator']);
  if p_status not in ('open', 'reviewing', 'actioned', 'dismissed') then
    raise exception 'Unknown report status' using errcode = '22023';
  end if;
  if p_status in ('actioned', 'dismissed') and nullif(trim(coalesce(p_notes, '')), '') is null then
    raise exception 'Add resolution notes when closing a report' using errcode = '22023';
  end if;
  select status into old_status from public.reports where id = p_report for update;
  if old_status is null then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  update public.reports set
    status = p_status,
    resolution_notes = nullif(trim(coalesce(p_notes, '')), ''),
    resolved_by = case when p_status in ('actioned', 'dismissed') then p_actor end,
    resolved_at = case when p_status in ('actioned', 'dismissed') then now() end
  where id = p_report;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'report.' || p_status, 'report', p_report, jsonb_build_object('from', old_status, 'to', p_status, 'notes', p_notes));
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalog submissions: approve (creates a product, optionally with a bat spec) or reject
-- ---------------------------------------------------------------------------

create or replace function public.admin_review_submission(
  p_actor uuid, p_submission uuid, p_approve boolean, p_notes text, p_product jsonb default null, p_bat_spec jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.product_submissions;
  new_product uuid;
begin
  perform public.admin_require(p_actor, array['moderator']);
  select * into s from public.product_submissions where id = p_submission for update;
  if s.id is null then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  if s.status <> 'pending' then
    raise exception 'This submission was already reviewed' using errcode = '22023';
  end if;

  if not p_approve then
    if nullif(trim(coalesce(p_notes, '')), '') is null then
      raise exception 'Add a note explaining the rejection' using errcode = '22023';
    end if;
    update public.product_submissions
      set status = 'rejected', review_notes = p_notes, reviewed_by = p_actor, reviewed_at = now()
      where id = p_submission;
    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    values (p_actor, 'submission.rejected', 'product_submission', p_submission, jsonb_build_object('notes', p_notes));
    return null;
  end if;

  insert into public.products (category_id, manufacturer_id, product_name, model_name, model_year, slug, catalog_status, data_source)
  values (
    coalesce((p_product ->> 'category_id')::uuid, s.category_id),
    coalesce((p_product ->> 'manufacturer_id')::uuid, s.manufacturer_id),
    p_product ->> 'product_name',
    coalesce(p_product ->> 'model_name', s.model_name),
    coalesce((p_product ->> 'model_year')::smallint, s.model_year),
    p_product ->> 'slug',
    coalesce(p_product ->> 'catalog_status', 'draft'),
    'member_submission'
  )
  returning id into new_product;

  if p_bat_spec is not null and p_bat_spec <> '{}'::jsonb then
    insert into public.bat_specifications (product_id, weight_oz, length_inches, barrel_length_inches, weighting_type, construction_type,
      construction_material, model_year, verified)
    values (
      new_product,
      (p_bat_spec ->> 'weight_oz')::numeric,
      coalesce((p_bat_spec ->> 'length_inches')::numeric, 34),
      (p_bat_spec ->> 'barrel_length_inches')::numeric,
      coalesce(p_bat_spec ->> 'weighting_type', 'unknown'),
      coalesce(p_bat_spec ->> 'construction_type', 'unknown'),
      coalesce(p_bat_spec ->> 'construction_material', 'unknown'),
      coalesce((p_product ->> 'model_year')::smallint, s.model_year),
      false
    );
  end if;

  update public.product_submissions
    set status = 'approved', created_product_id = new_product, review_notes = p_notes, reviewed_by = p_actor, reviewed_at = now()
    where id = p_submission;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'submission.approved', 'product_submission', p_submission,
    jsonb_build_object('product_id', new_product, 'notes', p_notes, 'bat_spec', p_bat_spec is not null and p_bat_spec <> '{}'::jsonb));
  return new_product;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fees: history is never edited in place. A change is a new version; superseded versions are deactivated.
-- ---------------------------------------------------------------------------

-- Rows that have taken effect keep their name, type, value and start date forever. Only `active` and the
-- description may change. Scheduled (future) rows can still be corrected before they start.
create or replace function public.protect_fee_history()
returns trigger
language plpgsql
as $$
begin
  if old.effective_from <= now() and (
    new.fee_name is distinct from old.fee_name or new.fee_type is distinct from old.fee_type
    or new.fee_value is distinct from old.fee_value or new.effective_from is distinct from old.effective_from) then
    raise exception 'Fee history cannot be edited. Create a new fee version instead.' using errcode = '42501';
  end if;
  if old.effective_from <= now() and not old.active and new.active then
    raise exception 'A retired fee version cannot be reactivated. Create a new fee version instead.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists fee_configuration_protect_history on public.fee_configuration;
create trigger fee_configuration_protect_history before update on public.fee_configuration
  for each row execute function public.protect_fee_history();

create or replace function public.admin_create_fee_version(
  p_actor uuid, p_fee_name text, p_fee_type text, p_fee_value numeric, p_description text, p_effective_from timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  starts timestamptz := greatest(coalesce(p_effective_from, now()), now());
  current_id uuid;
begin
  perform public.admin_require(p_actor, array['admin']);
  if p_effective_from is not null and p_effective_from < now() - interval '5 minutes' then
    raise exception 'A fee version cannot start in the past' using errcode = '22023';
  end if;
  insert into public.fee_configuration (fee_name, fee_type, fee_value, description, active, effective_from)
  values (p_fee_name, p_fee_type, p_fee_value, nullif(trim(coalesce(p_description, '')), ''), true, starts)
  returning id into new_id;

  -- Retire every started version that is no longer the one in force.
  select id into current_id from public.current_fee(p_fee_name);
  update public.fee_configuration set active = false
    where fee_name = p_fee_name and active and effective_from <= now() and id <> current_id;
  return new_id;
end;
$$;

-- Cancels a version that hasn't started yet.
create or replace function public.admin_cancel_fee_version(p_actor uuid, p_fee uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require(p_actor, array['admin']);
  update public.fee_configuration set active = false where id = p_fee and active and effective_from > now();
  if not found then
    raise exception 'Only a scheduled fee version that has not started can be cancelled' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Site settings: each known key has a type and range, checked here as well as in the admin screen.
-- ---------------------------------------------------------------------------

create or replace function public.validate_site_setting()
returns trigger
language plpgsql
as $$
declare
  int_rules jsonb := '{
    "price_guide_min_sales": [1, 1000],
    "price_guide_full_sales": [1, 10000],
    "offer_expiry_hours": [1, 720],
    "listing_expiry_days": [1, 365],
    "messages_per_minute_limit": [1, 120],
    "new_release_window_days": [1, 730],
    "early_report_threshold": [1, 1000],
    "durability_min_owners": [1, 1000],
    "owner_report_interval_days": [1, 365]
  }'::jsonb;
  bool_keys text[] := array['featured_listings_enabled', 'premium_seller_enabled'];
  v jsonb := new.value;
  n numeric;
  min_sales numeric;
begin
  if int_rules ? new.key then
    if jsonb_typeof(v) <> 'number' then
      raise exception 'Setting % must be a whole number', new.key using errcode = '22023';
    end if;
    n := (v #>> '{}')::numeric;
    if n <> trunc(n) or n < (int_rules -> new.key ->> 0)::numeric or n > (int_rules -> new.key ->> 1)::numeric then
      raise exception 'Setting % must be a whole number from % to %', new.key, int_rules -> new.key ->> 0, int_rules -> new.key ->> 1
        using errcode = '22023';
    end if;
    if new.key = 'price_guide_full_sales' then
      select (value #>> '{}')::numeric into min_sales from public.site_settings where key = 'price_guide_min_sales';
      if min_sales is not null and n < min_sales then
        raise exception 'The full price guide threshold cannot be below the minimum' using errcode = '22023';
      end if;
    elsif new.key = 'price_guide_min_sales' then
      select (value #>> '{}')::numeric into min_sales from public.site_settings where key = 'price_guide_full_sales';
      if min_sales is not null and n > min_sales then
        raise exception 'The minimum price guide threshold cannot be above the full threshold' using errcode = '22023';
      end if;
    end if;
  elsif new.key = any (bool_keys) then
    if jsonb_typeof(v) <> 'boolean' then
      raise exception 'Setting % must be true or false', new.key using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists site_settings_validate on public.site_settings;
create trigger site_settings_validate before insert or update on public.site_settings
  for each row execute function public.validate_site_setting();

create or replace function public.admin_update_setting(p_actor uuid, p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require(p_actor, array['admin']);
  update public.site_settings set value = p_value, updated_by = p_actor where key = p_key;
  if not found then
    raise exception 'Unknown setting' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard numbers, computed from the real tables.
-- ---------------------------------------------------------------------------

create or replace function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with paid as (
    select * from public.orders
    where order_status in ('paid', 'processing', 'shipped', 'delivered', 'completed', 'disputed')
  )
  select jsonb_build_object(
    'registered_users', (select count(*) from public.profiles where account_status <> 'deleted'),
    'suspended_users', (select count(*) from public.profiles where account_status in ('suspended', 'banned')),
    'active_sellers', (select count(distinct seller_id) from public.equipment_listings where listing_status = 'active'),
    'active_listings', (select count(*) from public.equipment_listings where listing_status = 'active'),
    'listings_by_category', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'count', x.n) order by x.n desc, c.name)
      from (select category_id, count(*) n from public.equipment_listings where listing_status = 'active' group by category_id) x
      join public.product_categories c on c.id = x.category_id), '[]'::jsonb),
    'listings_by_manufacturer', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(m.name, 'Not set'), 'count', x.n) order by x.n desc, m.name)
      from (select manufacturer_id, count(*) n from public.equipment_listings where listing_status = 'active' group by manufacturer_id) x
      left join public.manufacturers m on m.id = x.manufacturer_id), '[]'::jsonb),
    'orders_total', (select count(*) from public.orders),
    'completed_orders', (select count(*) from public.orders where order_status = 'completed'),
    'paid_orders', (select count(*) from paid),
    'gmv_cents', (select coalesce(sum(subtotal_cents), 0) from paid),
    'commission_cents', (select coalesce(sum(platform_fee_cents), 0) from paid),
    'refunded_orders', (select count(*) from public.orders where refunded_amount_cents > 0 or order_status = 'refunded'),
    'refunded_cents', (select coalesce(sum(refunded_amount_cents), 0) from public.orders),
    'open_disputes', (select count(*) from public.disputes where status in ('open', 'awaiting_seller', 'awaiting_buyer', 'under_review')),
    'open_reports', (select count(*) from public.reports where status in ('open', 'reviewing')),
    'pending_submissions', (select count(*) from public.product_submissions where status = 'pending')
  );
$$;

-- ---------------------------------------------------------------------------
-- Support messages from the contact page (members only; anonymous visitors see the support email address)
-- ---------------------------------------------------------------------------

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null check (topic in ('order', 'listing', 'account', 'safety', 'catalog', 'other')),
  subject text not null check (char_length(subject) between 3 and 120),
  body text not null check (char_length(body) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_status_idx on public.support_messages (status, created_at desc);
create index if not exists support_messages_user_idx on public.support_messages (user_id, created_at desc);

alter table public.support_messages enable row level security;

-- Members can send up to 5 messages an hour.
create or replace function public.prepare_support_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_end_user() then
    if (select count(*) from public.support_messages where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'You have sent several messages in the last hour. We will reply to those first.' using errcode = '54000';
    end if;
    new.status := 'open';
    new.closed_by := null;
    new.closed_at := null;
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists support_messages_prepare on public.support_messages;
create trigger support_messages_prepare before insert on public.support_messages
  for each row execute function public.prepare_support_message();

revoke update, delete on public.support_messages from anon, authenticated;
drop policy if exists "Members send support messages" on public.support_messages;
create policy "Members send support messages" on public.support_messages
  for insert to authenticated with check (user_id = (select auth.uid()) and status = 'open');
drop policy if exists "Members see their own support messages; support sees all" on public.support_messages;
create policy "Members see their own support messages; support sees all" on public.support_messages
  for select to authenticated using (user_id = (select auth.uid()) or public.has_role('support'));

create or replace function public.admin_close_support_message(p_actor uuid, p_message uuid, p_close boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require(p_actor, array['support']);
  update public.support_messages
    set status = case when p_close then 'closed' else 'open' end,
        closed_by = case when p_close then p_actor end,
        closed_at = case when p_close then now() end
    where id = p_message;
  if not found then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, case when p_close then 'support_message.closed' else 'support_message.reopened' end, 'support_message', p_message, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Email delivery log (server only): what was sent, or not sent because no email provider is configured.
-- ---------------------------------------------------------------------------

create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  template text not null check (template ~ '^[a-z0-9_]+$'),
  category text not null check (category in ('transactional', 'marketing')),
  to_email citext not null,
  subject text not null,
  provider text not null check (provider in ('resend', 'dev')),
  status text not null check (status in ('sent', 'not_sent', 'failed')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists email_deliveries_created_idx on public.email_deliveries (created_at desc);
alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from anon, authenticated;
-- No policies: only the server (service role) reads and writes the delivery log.

-- ---------------------------------------------------------------------------
-- Admin functions are server-only.
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.staff_has_role(uuid, text)',
    'public.admin_require(uuid, text[])',
    'public.admin_log(uuid, text, text, uuid, jsonb)',
    'public.admin_set_account_status(uuid, uuid, text, text)',
    'public.admin_set_role(uuid, uuid, text, boolean)',
    'public.admin_remove_listing(uuid, uuid, text)',
    'public.admin_set_featured(uuid, uuid, timestamptz)',
    'public.admin_update_report(uuid, uuid, text, text)',
    'public.admin_review_submission(uuid, uuid, boolean, text, jsonb, jsonb)',
    'public.admin_create_fee_version(uuid, text, text, numeric, text, timestamptz)',
    'public.admin_cancel_fee_version(uuid, uuid)',
    'public.admin_update_setting(uuid, text, jsonb)',
    'public.admin_overview()',
    'public.admin_close_support_message(uuid, uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
