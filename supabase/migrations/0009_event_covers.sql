-- Public event cover images for organiser uploads.
-- This app signs in with a ɃU session cookie (not Supabase Auth), so inserts use the anon key.

insert into storage.buckets (id, name, public)
values ('event-covers', 'event-covers', true)
on conflict (id) do update set public = true;

drop policy if exists "event_covers_public_read" on storage.objects;
create policy "event_covers_public_read"
  on storage.objects
  for select
  using (bucket_id = 'event-covers');

drop policy if exists "event_covers_auth_write" on storage.objects;
drop policy if exists "event_covers_anon_insert" on storage.objects;
create policy "event_covers_anon_insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'event-covers');
