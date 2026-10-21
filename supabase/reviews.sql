-- Shared player reviews for Barrel Talk.
-- Run this once in the Supabase SQL editor, then put the project URL and anon key in assets/js/config.js.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  bat_id text not null check (bat_id ~ '^[a-z0-9-]{3,120}$'),
  rating smallint not null check (rating between 1 and 5),
  pop smallint check (pop between 1 and 5),
  durability smallint check (durability between 1 and 5),
  feel smallint check (feel between 1 and 5),
  weight text check (char_length(weight) <= 8),
  league text check (char_length(league) <= 40),
  body text check (char_length(body) <= 2000),
  name text check (char_length(name) <= 40),
  created_at timestamptz not null default now()
);

create index if not exists reviews_bat_id_created_at on public.reviews (bat_id, created_at desc);

alter table public.reviews enable row level security;

-- Anyone can read reviews and post new ones. Nobody can edit or delete through the public key.
drop policy if exists "Reviews are public" on public.reviews;
create policy "Reviews are public" on public.reviews for select to anon, authenticated using (true);

drop policy if exists "Anyone can post a review" on public.reviews;
create policy "Anyone can post a review" on public.reviews for insert to anon, authenticated with check (true);
