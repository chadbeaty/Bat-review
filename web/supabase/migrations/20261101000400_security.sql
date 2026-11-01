-- Row Level Security for every table, column privileges for private fields, and safe public views.
--
-- Principles:
--   * Browsers use the public "anon" key and act as `anon` or `authenticated`. Everything they can do is listed here.
--   * Orders, payments, shipments, payouts, webhooks, notifications and moderation decisions are written only by
--     server code using the service role, after it has checked who is asking. Admin screens work the same way and
--     write an audit log entry for every change.
--   * (select auth.uid()) is used instead of auth.uid() so Postgres evaluates it once per query.

-- Turn on RLS for every table in the public schema.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create policy "Members see their own roles; admins see all" on public.user_roles
  for select using (user_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Profiles: public columns for everyone, private columns only through get_my_profile()
-- ---------------------------------------------------------------------------
revoke select, insert, update, delete on public.profiles from anon, authenticated;
grant select (id, username, display_name, profile_photo_url, bio, city, state, seller_verified, identity_verified, account_status, created_at)
  on public.profiles to anon, authenticated;
grant update (username, display_name, profile_photo_url, bio, city, state, postal_code) on public.profiles to authenticated;

create policy "Active profiles are public" on public.profiles
  for select using (account_status in ('active', 'suspended') or id = (select auth.uid()) or public.has_role('support'));
create policy "Members edit their own profile" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

create or replace function public.get_my_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;
revoke execute on function public.get_my_profile() from anon;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create policy "Active categories are public" on public.product_categories
  for select using (active or public.is_admin());
create policy "Active manufacturers are public" on public.manufacturers
  for select using (active or public.is_admin());
create policy "Published products are public" on public.products
  for select using (catalog_status = 'published' or public.has_role('moderator'));
create policy "Specs of published products are public" on public.bat_specifications
  for select using (exists (select 1 from public.products p where p.id = product_id));

create policy "Members see their own catalog requests" on public.product_submissions
  for select using (submitted_by = (select auth.uid()) or public.has_role('moderator'));
create policy "Members can request a catalog entry" on public.product_submissions
  for insert to authenticated
  with check (submitted_by = (select auth.uid()) and status = 'pending' and reviewed_by is null and created_product_id is null);

create policy "Public settings are readable" on public.site_settings
  for select using (is_public or public.is_admin());
create policy "Active fees are public" on public.fee_configuration
  for select using (active or public.is_admin());

-- ---------------------------------------------------------------------------
-- Listings and photos. The ship-from ZIP is hidden from everyone but the seller (via a function).
-- ---------------------------------------------------------------------------
revoke select on public.equipment_listings from anon, authenticated;
grant select (
  id, seller_id, product_id, category_id, manufacturer_id, title, description, attributes, asking_price_cents, accepts_offers,
  condition_score, condition_label, structural_disclosure, has_cracks, has_rattle, has_loose_end_cap, has_repairs,
  has_alterations, has_significant_damage, cosmetic_wear, damage_disclosure, authenticity_declaration, ownership_declaration,
  quantity, shipping_weight_oz, package_length_inches, package_width_inches, package_height_inches, location_city,
  location_state, listing_status, featured, featured_until, views_count, created_at, updated_at, published_at, sold_at,
  expires_at, search_vector
) on public.equipment_listings to anon, authenticated;

create policy "Live listings are public; sellers see their own" on public.equipment_listings
  for select using (
    listing_status in ('active', 'reserved', 'sold')
    or seller_id = (select auth.uid())
    or public.has_role('moderator')
  );
create policy "Members create their own listings" on public.equipment_listings
  for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_status = 'active')
  );
create policy "Sellers edit their own listings" on public.equipment_listings
  for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));
create policy "Sellers delete their own drafts" on public.equipment_listings
  for delete to authenticated
  using (seller_id = (select auth.uid()) and listing_status = 'draft');

create or replace function public.get_listing_shipping_origin(p_listing_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select shipping_origin_postal_code from public.equipment_listings
  where id = p_listing_id and (seller_id = auth.uid() or public.has_role('support'));
$$;
revoke execute on function public.get_listing_shipping_origin(uuid) from anon;

create policy "Photos follow their listing" on public.listing_images
  for select using (exists (select 1 from public.equipment_listings l where l.id = listing_id));
create policy "Sellers manage photos on their editable listings" on public.listing_images
  for all to authenticated
  using (exists (
    select 1 from public.equipment_listings l
    where l.id = listing_id and l.seller_id = (select auth.uid()) and l.listing_status not in ('reserved', 'sold')))
  with check (exists (
    select 1 from public.equipment_listings l
    where l.id = listing_id and l.seller_id = (select auth.uid()) and l.listing_status not in ('reserved', 'sold')));

-- ---------------------------------------------------------------------------
-- Favorites, saved searches, watchlist, blocks: owner only
-- ---------------------------------------------------------------------------
create policy "Own favorites" on public.favorites
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own saved searches" on public.saved_searches
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own watchlist" on public.product_watchlist
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own blocks" on public.user_blocks
  for all to authenticated using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Offers: buyers make the first offer; responses and counters go through the server.
-- ---------------------------------------------------------------------------
create policy "Offer parties can see offers" on public.offers
  for select to authenticated using ((select auth.uid()) in (buyer_id, seller_id));
create policy "Buyers make offers on live listings" on public.offers
  for insert to authenticated
  with check (
    buyer_id = (select auth.uid()) and made_by = (select auth.uid()) and status = 'pending' and parent_offer_id is null
    and exists (
      select 1 from public.equipment_listings l
      where l.id = listing_id and l.seller_id = offers.seller_id and l.listing_status = 'active' and l.accepts_offers)
    and not exists (select 1 from public.user_blocks b where b.blocker_id = offers.seller_id and b.blocked_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create policy "Participants see conversations" on public.conversations
  for select to authenticated using ((select auth.uid()) in (buyer_id, seller_id) or public.has_role('support'));
create policy "Buyers start conversations about a listing" on public.conversations
  for insert to authenticated
  with check (
    buyer_id = (select auth.uid())
    and exists (select 1 from public.equipment_listings l where l.id = listing_id and l.seller_id = conversations.seller_id)
    and not exists (select 1 from public.user_blocks b where b.blocker_id = conversations.seller_id and b.blocked_id = (select auth.uid()))
  );

create policy "Participants see messages" on public.messages
  for select to authenticated using ((select auth.uid()) in (sender_id, recipient_id));
create policy "Participants send messages" on public.messages
  for insert to authenticated with check (sender_id = (select auth.uid()));
create policy "Recipients mark messages read" on public.messages
  for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Reports and notifications
-- ---------------------------------------------------------------------------
create policy "Members file reports" on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open' and resolved_by is null);
create policy "Reporters and moderators see reports" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()) or public.has_role('moderator'));

revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "Own notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Mark own notifications read" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Addresses: owner only, plus the seller of a paid order can see where it ships
-- ---------------------------------------------------------------------------
create policy "Own addresses" on public.addresses
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Sellers see the ship-to address of their paid orders" on public.addresses
  for select to authenticated using (exists (
    select 1 from public.orders o
    where o.shipping_address_id = addresses.id and o.seller_id = (select auth.uid())
      and o.order_status in ('paid', 'processing', 'shipped', 'delivered', 'completed', 'disputed')));

-- ---------------------------------------------------------------------------
-- Orders, payments, shipping: read-only for the parties
-- ---------------------------------------------------------------------------
create policy "Order parties see orders" on public.orders
  for select to authenticated using ((select auth.uid()) in (buyer_id, seller_id) or public.has_role('support'));
create policy "Order parties see items" on public.order_items
  for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id));
create policy "Sellers see their payout account status" on public.seller_payment_accounts
  for select to authenticated using (seller_id = (select auth.uid()) or public.has_role('support'));
create policy "Order parties see shipments" on public.shipping_shipments
  for select to authenticated using ((select auth.uid()) in (buyer_id, seller_id) or public.has_role('support'));
create policy "Order parties see tracking events" on public.shipping_events
  for select to authenticated using (exists (select 1 from public.shipping_shipments s where s.id = shipment_id));

-- webhook_events and newsletter_subscribers: no policies, so only the server can touch them.

-- ---------------------------------------------------------------------------
-- Disputes and reviews
-- ---------------------------------------------------------------------------
create policy "Order parties see disputes" on public.disputes
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and (select auth.uid()) in (o.buyer_id, o.seller_id))
    or public.has_role('support'));
create policy "Order parties open disputes" on public.disputes
  for insert to authenticated
  with check (
    opened_by = (select auth.uid()) and status = 'open' and resolution is null and admin_notes is null and stripe_dispute_id is null
    and exists (
      select 1 from public.orders o
      where o.id = order_id and (select auth.uid()) in (o.buyer_id, o.seller_id)
        and o.order_status in ('paid', 'processing', 'shipped', 'delivered', 'completed'))
  );

create policy "Published reviews are public" on public.reviews
  for select using (
    review_status = 'published' or (select auth.uid()) in (reviewer_id, reviewed_user_id) or public.has_role('moderator'));
create policy "Parties of completed orders leave reviews" on public.reviews
  for insert to authenticated with check (reviewer_id = (select auth.uid()));
create policy "Reviewed members respond" on public.reviews
  for update to authenticated using (reviewed_user_id = (select auth.uid())) with check (reviewed_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Price history, subscriptions, advertising, audit
-- ---------------------------------------------------------------------------
create policy "Verified sales are public" on public.price_history
  for select using (verified_transaction);
create policy "Sellers see their subscription" on public.seller_subscriptions
  for select to authenticated using (seller_id = (select auth.uid()) or public.has_role('support'));
create policy "Paid, running campaigns are public" on public.advertising_campaigns
  for select using ((active and paid and current_date between start_date and end_date) or public.is_admin());
create policy "Admins read the audit log" on public.audit_logs
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Public seller reputation: aggregates only, no private order details
-- ---------------------------------------------------------------------------
create view public.seller_public_stats
with (security_barrier = true)
as
select
  p.id as user_id,
  (select count(*) from public.orders o where o.seller_id = p.id and o.order_status = 'completed')::int as completed_sales,
  (select count(*) from public.orders o where o.buyer_id = p.id and o.order_status = 'completed')::int as completed_purchases,
  (select round(avg(r.rating)::numeric, 2) from public.reviews r
    where r.reviewed_user_id = p.id and r.review_status = 'published') as average_rating,
  (select count(*) from public.reviews r where r.reviewed_user_id = p.id and r.review_status = 'published')::int as review_count,
  (select count(*) from public.equipment_listings l where l.seller_id = p.id and l.listing_status = 'active')::int as active_listings
from public.profiles p
where p.account_status in ('active', 'suspended');

revoke all on public.seller_public_stats from anon, authenticated;
grant select on public.seller_public_stats to anon, authenticated;
