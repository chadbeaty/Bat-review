-- Product Radar: access control, helper functions and audit logging.
-- Nobody sees anything unless they are listed in public.users. The owner manages settings, creators and
-- products; members can read and keep their own watchlist and feedback. Background jobs use the service role.

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid());
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'owner');
$$;

-- One-time bootstrap: the first verified sign-in from ADMIN_EMAIL becomes the owner (called by the server
-- with the service role after Supabase has verified the address). Does nothing once an owner exists.
create or replace function public.bootstrap_owner(p_user uuid, p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.users where role = 'owner') then
    return exists (select 1 from public.users where id = p_user);
  end if;
  insert into public.users (id, email, role) values (p_user, lower(p_email), 'owner')
  on conflict (id) do update set role = 'owner';
  insert into public.audit_log (actor_id, action, entity, entity_id) values (p_user, 'owner_bootstrapped', 'users', p_user::text);
  return true;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger sources_touch before update on public.sources for each row execute function public.touch_updated_at();
create trigger creators_touch before update on public.creators for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
create trigger watchlists_touch before update on public.watchlists for each row execute function public.touch_updated_at();

create or replace function public.products_status_changed()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then new.status_changed_at := now(); end if;
  return new;
end;
$$;
create trigger products_status_changed before update on public.products for each row execute function public.products_status_changed();

-- Audit trail for changes people make (jobs running as the service role have no auth.uid() and are skipped,
-- since their work is already recorded in ingestion_jobs).
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  rec jsonb;
begin
  if actor is null then
    return coalesce(new, old);
  end if;
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (actor, lower(tg_op), tg_table_name, rec ->> (case when tg_table_name = 'app_settings' then 'key' else 'id' end),
          case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)) else rec end);
  return coalesce(new, old);
end;
$$;

create trigger audit_app_settings after insert or update or delete on public.app_settings for each row execute function public.audit_row();
create trigger audit_creators after insert or update or delete on public.creators for each row execute function public.audit_row();
create trigger audit_sources after insert or update or delete on public.sources for each row execute function public.audit_row();
create trigger audit_products after update or delete on public.products for each row execute function public.audit_row();
create trigger audit_product_aliases after insert or update or delete on public.product_aliases for each row execute function public.audit_row();
create trigger audit_users after insert or update or delete on public.users for each row execute function public.audit_row();

-- Postgres-backed rate limiter (works across serverless instances).
create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  r public.rate_limits;
begin
  insert into public.rate_limits as rl (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.hits + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning * into r;
  return r.hits <= p_limit;
end;
$$;

create or replace function public.ai_spend_since(p_since timestamptz)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(estimated_cost), 0) from public.ai_runs where created_at >= p_since;
$$;

-- Candidate products whose names resemble any of the given (already normalized) names.
create or replace function public.match_product_candidates(p_names text[], p_limit integer default 8)
returns table (product_id uuid, canonical_name text, best_alias text, similarity real)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.canonical_name, best.alias_normalized, best.sim
  from (
    select distinct on (a.product_id) a.product_id, a.alias_normalized, extensions.similarity(a.alias_normalized, n.name) as sim
    from public.product_aliases a
    cross join unnest(p_names) as n(name)
    where a.source <> 'search_term' and extensions.similarity(a.alias_normalized, n.name) >= 0.25
    order by a.product_id, extensions.similarity(a.alias_normalized, n.name) desc
  ) best
  join public.products p on p.id = best.product_id and p.status not in ('merged', 'not_a_product')
  order by best.sim desc
  limit p_limit;
$$;

-- Recomputes the earliest known appearance of a product from its mentions (keeps the source of the claim).
create or replace function public.refresh_first_observed(p_product uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.product_mentions;
begin
  select * into m from public.product_mentions where product_id = p_product order by observed_at asc, detected_at asc limit 1;
  if m.id is null then return; end if;
  update public.products set
    first_observed_at = m.observed_at,
    first_observed_platform = m.platform,
    first_observed_creator_id = m.creator_id,
    first_observed_url = m.url
  where id = p_product;
end;
$$;

-- Merges a duplicate product into another. History moves with it; the duplicate stays as a pointer.
create or replace function public.merge_products(p_from uuid, p_into uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  is_service boolean := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
begin
  if not (public.is_owner() or is_service) then
    raise exception 'Only the owner can merge products' using errcode = '42501';
  end if;
  if p_from = p_into then raise exception 'Choose two different products'; end if;
  if not exists (select 1 from public.products where id = p_into and status not in ('merged', 'not_a_product')) then
    raise exception 'The product to merge into is not active';
  end if;

  update public.product_mentions set product_id = p_into, match_method = 'manual' where product_id = p_from;
  insert into public.product_aliases (product_id, alias, alias_normalized, source, confidence)
    select p_into, alias, alias_normalized, source, confidence from public.product_aliases where product_id = p_from
    on conflict (product_id, alias_normalized) do nothing;
  insert into public.product_aliases (product_id, alias, alias_normalized, source, confidence)
    select p_into, canonical_name, lower(regexp_replace(canonical_name, '[^a-zA-Z0-9 ]', ' ', 'g')), 'manual', 1
    from public.products where id = p_from
    on conflict (product_id, alias_normalized) do nothing;
  insert into public.product_images (product_id, url, source_url, kind, mention_id)
    select p_into, url, source_url, kind, mention_id from public.product_images where product_id = p_from
    on conflict (product_id, url) do nothing;
  insert into public.seller_products (seller_id, product_id, listing_title, evidence_url, first_seen_at, last_seen_at)
    select seller_id, p_into, listing_title, evidence_url, first_seen_at, last_seen_at from public.seller_products where product_id = p_from
    on conflict (seller_id, product_id) do update set first_seen_at = least(seller_products.first_seen_at, excluded.first_seen_at);
  insert into public.watchlists (user_id, product_id, status, notes)
    select user_id, p_into, status, notes from public.watchlists where product_id = p_from
    on conflict (user_id, product_id) do nothing;
  update public.user_feedback set product_id = p_into where product_id = p_from;
  update public.match_suggestions set status = 'merged', resolved_at = now()
    where status = 'open' and ((product_id = p_from and candidate_product_id = p_into) or (product_id = p_into and candidate_product_id = p_from));
  delete from public.match_suggestions where status = 'open' and (product_id = p_from or candidate_product_id = p_from);

  update public.products set status = 'merged', merged_into = p_into where id = p_from;
  perform public.refresh_first_observed(p_into);
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values (auth.uid(), 'merge', 'products', p_into::text, jsonb_build_object('merged_from', p_from));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Row Level Security on every table.
do $$
declare t text;
begin
  foreach t in array array['users','sources','creators','creator_videos','video_stat_snapshots','products','product_aliases',
    'product_mentions','match_suggestions','trend_snapshots','competition_snapshots','sellers','seller_products','product_images',
    'opportunity_scores','video_ideas','watchlists','product_alerts','ingestion_jobs','user_feedback','manual_submissions',
    'ai_runs','api_usage','app_settings','audit_log','rate_limits']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Read access for members on research data.
do $$
declare t text;
begin
  foreach t in array array['sources','creators','creator_videos','video_stat_snapshots','products','product_aliases',
    'product_mentions','match_suggestions','trend_snapshots','competition_snapshots','sellers','seller_products','product_images',
    'opportunity_scores','video_ideas','product_alerts','ingestion_jobs','app_settings','ai_runs','api_usage']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member())', t || '_member_read', t);
  end loop;
end;
$$;

-- Owner-managed tables: the owner can change them from the admin pages.
do $$
declare t text;
begin
  foreach t in array array['sources','creators','products','product_aliases','match_suggestions','product_images','app_settings']
  loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_owner())', t || '_owner_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_owner()) with check (public.is_owner())', t || '_owner_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_owner())', t || '_owner_delete', t);
  end loop;
end;
$$;

create policy users_read on public.users for select to authenticated using (id = auth.uid() or public.is_member());
create policy users_update_self on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = (select u.role from public.users u where u.id = auth.uid()));
create policy users_owner_manage on public.users for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy watchlists_own on public.watchlists for all to authenticated
  using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());
create policy user_feedback_own on public.user_feedback for all to authenticated
  using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());
create policy manual_submissions_read on public.manual_submissions for select to authenticated using (public.is_member());
create policy manual_submissions_insert on public.manual_submissions for insert to authenticated
  with check (submitted_by = auth.uid() and public.is_member());
create policy audit_log_owner_read on public.audit_log for select to authenticated using (public.is_owner());
-- rate_limits: no policies, so only the service role can touch it.

-- Functions: anonymous visitors get none of them; members get only the read helpers.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_member(), public.is_owner(), public.merge_products(uuid, uuid), public.match_product_candidates(text[], integer) to authenticated;
grant execute on all functions in schema public to service_role;
