-- Selling: drafts that are saved before the seller has picked a price, and photo rules for the listing flow.
-- Additive and safe to run more than once.

-- ---------------------------------------------------------------------------
-- Drafts are created right after the seller picks a model (step 3 of the flow), before they have chosen a
-- price. The asking price may be empty only while the listing is a draft.
-- ---------------------------------------------------------------------------
alter table public.equipment_listings alter column asking_price_cents drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'equipment_listings_price_unless_draft' and conrelid = 'public.equipment_listings'::regclass
  ) then
    alter table public.equipment_listings
      add constraint equipment_listings_price_unless_draft
      check (listing_status = 'draft' or asking_price_cents is not null);
  end if;
end;
$$;

-- A friendly message instead of the bare constraint error. Runs before equipment_listings_rules (triggers fire
-- in name order), so the seller hears about the missing price first.
create or replace function public.require_listing_price()
returns trigger
language plpgsql
as $$
begin
  if new.listing_status <> 'draft' and new.asking_price_cents is null then
    raise exception 'Set an asking price before publishing' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists equipment_listings_price_required on public.equipment_listings;
create trigger equipment_listings_price_required before insert or update on public.equipment_listings
  for each row execute function public.require_listing_price();

-- ---------------------------------------------------------------------------
-- Listing photos uploaded by sellers live in listing-images/<seller id>/<listing id>/<file>.
-- A seller can't point a photo row at someone else's folder, can't add more than 12 photos, and can't remove
-- the last photo of a live listing.
-- ---------------------------------------------------------------------------
create or replace function public.check_listing_image()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  photo_count integer;
begin
  if not public.is_end_user() then
    return new;
  end if;
  select seller_id into owner_id from public.equipment_listings where id = new.listing_id;
  if new.storage_path is not null
    and new.storage_path !~ ('^' || owner_id::text || '/' || new.listing_id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Photos must be stored in your own listing folder' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    select count(*) into photo_count from public.listing_images where listing_id = new.listing_id;
    if photo_count >= 12 then
      raise exception 'A listing can have up to 12 photos' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists listing_images_check on public.listing_images;
create trigger listing_images_check before insert or update on public.listing_images
  for each row execute function public.check_listing_image();

create or replace function public.keep_last_live_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_end_user()
    and exists (select 1 from public.equipment_listings l where l.id = old.listing_id and l.listing_status = 'active')
    and not exists (select 1 from public.listing_images i where i.listing_id = old.listing_id and i.id <> old.id) then
    raise exception 'A live listing needs at least one photo' using errcode = '23514';
  end if;
  return old;
end;
$$;

drop trigger if exists listing_images_keep_last on public.listing_images;
create trigger listing_images_keep_last before delete on public.listing_images
  for each row execute function public.keep_last_live_photo();
