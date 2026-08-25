-- Store hashed ɃU PIN on the profile. Auth session still uses Supabase.
alter table public.profiles
  add column if not exists pin_hash text;
