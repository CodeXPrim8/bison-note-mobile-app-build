-- Compatibility with older ɃU event tables that used `state` instead of `status`.
-- Safe to run after 0001 + 0002.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'state'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'status'
  ) then
    alter table public.events rename column state to status;
  end if;
end $$;

-- Ensure organiser-platform columns exist even if 0002 was skipped.
do $$ begin
  create type public.event_visibility as enum ('PUBLIC', 'PRIVATE');
exception when duplicate_object then null; end $$;

alter table public.events
  add column if not exists visibility public.event_visibility not null default 'PUBLIC',
  add column if not exists category text,
  add column if not exists venue_address text,
  add column if not exists ticket_sales_start timestamptz,
  add column if not exists ticket_sales_end timestamptz,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists organizer_name text,
  add column if not exists organizer_info text;

alter table public.profiles
  add column if not exists phone_e164 text,
  add column if not exists email text;
