-- Image storage. Files live under a folder named after the uploader's user id, e.g. listing-images/<user id>/<file>.
-- Listing photos and avatars are public to read; dispute evidence is private and served through signed URLs.
-- Size and type limits are enforced by Storage itself. Skipped when the storage schema is absent (local tests).

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not found, skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('listing-images', 'listing-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
    ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
    ('dispute-evidence', 'dispute-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy "Members upload to their own folder" on storage.objects
      for insert to authenticated
      with check (
        bucket_id in ('listing-images', 'avatars', 'dispute-evidence')
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;
  execute $p$
    create policy "Members manage their own files" on storage.objects
      for update to authenticated
      using (bucket_id in ('listing-images', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
  execute $p$
    create policy "Members delete their own files" on storage.objects
      for delete to authenticated
      using (bucket_id in ('listing-images', 'avatars', 'dispute-evidence') and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
  execute $p$
    create policy "Members read their own evidence" on storage.objects
      for select to authenticated
      using (bucket_id = 'dispute-evidence' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_role('support')))
  $p$;
end;
$$;
