-- Public advert images and short videos. Super Admin uploads via the ɃU app
-- (session cookie, not Supabase Auth), so inserts use the anon key.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bu-ads',
  'bu-ads',
  true,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists bu_ads_media_public_read on storage.objects;
create policy bu_ads_media_public_read
  on storage.objects
  for select
  using (bucket_id = 'bu-ads');

drop policy if exists bu_ads_media_anon_insert on storage.objects;
create policy bu_ads_media_anon_insert
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'bu-ads');
