-- Stores organiser form fields that the live ɃU events table does not have
-- (organiser name, end time, lat/lng, contact, sales window, separate venue address).
-- Run this in the live ɃU Supabase SQL editor.

alter table public.events
  add column if not exists details jsonb;

create or replace function public.bu_set_event_details(
  p_event_id uuid,
  p_celebrant_id uuid,
  p_details jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select celebrant_id into owner
  from public.events
  where id = p_event_id;

  if owner is null then
    raise exception 'Event not found';
  end if;
  if owner is distinct from p_celebrant_id then
    raise exception 'Not the organizer';
  end if;

  update public.events
  set details = p_details
  where id = p_event_id;

  return p_event_id;
end;
$$;

revoke all on function public.bu_set_event_details(uuid, uuid, jsonb) from public;
grant execute on function public.bu_set_event_details(uuid, uuid, jsonb) to anon, authenticated;
