-- Live ɃU events table uses celebrant_id / name / date, not organizer_id / title / slug.
-- This lets the website create events on the same project the ɃU app already uses.

create or replace function public.bu_create_event(
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
  p_max_tickets integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.events (
    celebrant_id,
    name,
    date,
    location,
    description,
    image_url,
    is_public,
    strictly_by_invitation,
    category,
    max_guests,
    tickets_enabled,
    ticket_price_bu,
    max_tickets,
    tickets_sold
  ) values (
    p_celebrant_id,
    p_name,
    p_date,
    p_location,
    p_description,
    p_image_url,
    coalesce(p_is_public, true),
    coalesce(p_invite_only, false),
    p_category,
    p_max_guests,
    true,
    coalesce(p_ticket_price_bu, 0),
    coalesce(p_max_tickets, 0),
    0
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.bu_create_event(
  uuid, text, timestamptz, text, text, text, boolean, boolean, text, integer, numeric, integer
) from public;
grant execute on function public.bu_create_event(
  uuid, text, timestamptz, text, text, text, boolean, boolean, text, integer, numeric, integer
) to anon, authenticated;
