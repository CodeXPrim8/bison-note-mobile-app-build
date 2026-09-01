-- Lets organisers update events they created (name, date, venue, tickets, …).
-- Also adds ticket_types if 0012 was not run yet.
-- Run this in the live ɃU Supabase SQL editor.

alter table public.events
  add column if not exists ticket_types jsonb;

create or replace function public.bu_update_event(
  p_event_id uuid,
  p_celebrant_id uuid,
  p_name text,
  p_date timestamptz,
  p_location text,
  p_description text,
  p_image_url text,
  p_is_public boolean,
  p_invite_only boolean,
  p_category text,
  p_max_guests integer,
  p_ticket_price_bu numeric,
  p_max_tickets integer,
  p_ticket_types jsonb
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
  set
    name = p_name,
    date = p_date,
    location = p_location,
    description = p_description,
    image_url = p_image_url,
    is_public = coalesce(p_is_public, is_public),
    strictly_by_invitation = coalesce(p_invite_only, strictly_by_invitation),
    category = p_category,
    max_guests = p_max_guests,
    tickets_enabled = true,
    ticket_price_bu = coalesce(p_ticket_price_bu, ticket_price_bu),
    max_tickets = coalesce(p_max_tickets, max_tickets),
    ticket_types = coalesce(p_ticket_types, ticket_types)
  where id = p_event_id;

  return p_event_id;
end;
$$;

revoke all on function public.bu_update_event(
  uuid, uuid, text, timestamptz, text, text, text, boolean, boolean, text, integer, numeric, integer, jsonb
) from public;
grant execute on function public.bu_update_event(
  uuid, uuid, text, timestamptz, text, text, text, boolean, boolean, text, integer, numeric, integer, jsonb
) to anon, authenticated;
