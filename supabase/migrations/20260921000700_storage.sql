-- =============================================================================
-- Caryandi · 0007 · Storage buckets and file policies
-- =============================================================================
-- Every upload goes in the uploader's own folder:  <bucket>/<user id>/<file>
-- so ownership is checked from the path, not trusted from the client.
--
-- Public buckets (files served by public URL, e.g. listing photos):
--   avatars, business-media, vehicle-images, part-images
-- Private buckets (never public; owner + admins only, via signed URLs):
--   vehicle-documents  — registration / import / duty paperwork
--   verification       — in-app selfies and ID / business documents
--
-- Size and type limits are enforced by Storage itself (bucket settings below).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',           'avatars',           true,   5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('business-media',    'business-media',    true,   5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('vehicle-images',    'vehicle-images',    true,  10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('part-images',       'part-images',       true,   5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('vehicle-documents', 'vehicle-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('verification',      'verification',      false,  8388608, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets ----------------------------------------------------------------------
-- No SELECT policy for everyone: public URLs work without one, and leaving it
-- out stops people listing every file in the bucket through the API.
create policy "owners read their own public-bucket files"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('avatars', 'business-media', 'vehicle-images', 'part-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owners upload to their folder in public buckets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('avatars', 'business-media', 'vehicle-images', 'part-images')
    and (storage.foldername(name))[1] = auth.uid()::text
    and private.is_active_user()
  );

create policy "owners replace their files in public buckets"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('avatars', 'business-media', 'vehicle-images', 'part-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('avatars', 'business-media', 'vehicle-images', 'part-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owners delete their files in public buckets"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('avatars', 'business-media', 'vehicle-images', 'part-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Vehicle documents (private) ------------------------------------------------------------
create policy "owners and admins read vehicle documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or private.is_admin())
  );

create policy "owners upload vehicle documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vehicle-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and private.is_active_user()
  );

create policy "owners delete vehicle documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Verification (private, write-once) --------------------------------------------------------
-- Users can add evidence but not overwrite or delete it once submitted.
create policy "owners and admins read verification files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'verification'
    and ((storage.foldername(name))[1] = auth.uid()::text or private.is_admin())
  );

create policy "owners upload verification files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification'
    and (storage.foldername(name))[1] = auth.uid()::text
    and private.is_active_user()
  );
