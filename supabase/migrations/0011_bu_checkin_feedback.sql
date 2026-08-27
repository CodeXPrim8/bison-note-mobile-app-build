-- Stamp check-in on live tickets without requiring a `used` / `checked_in` status value.
-- Also stores guest comments for organisers. Run this in the live ɃU SQL editor.

create or replace function public.bu_ticket_qr_object(raw jsonb)
returns jsonb
language plpgsql
immutable
as $$
begin
  if raw is null then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(raw) = 'object' then
    return raw;
  end if;
  if jsonb_typeof(raw) = 'string' then
    begin
      return (raw #>> '{}')::jsonb;
    exception
      when others then
        return jsonb_build_object('raw', raw #>> '{}');
    end;
  end if;
  return jsonb_build_object('raw', raw);
end;
$$;

create or replace function public.bu_checkin_event_ticket(p_event_id uuid, p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found public.tickets;
  stamped jsonb;
begin
  select * into found
  from public.tickets
  where id = p_ticket_id and event_id = p_event_id;

  if found.id is null then
    return null;
  end if;

  stamped := public.bu_ticket_qr_object(to_jsonb(found) -> 'qr_code_data');
  if coalesce(stamped->>'checked_in', '') in ('true', 't', '1')
     or found.status in ('used', 'checked_in') then
    return to_jsonb(found);
  end if;
  if found.status in ('refunded', 'cancelled', 'reserved') then
    return to_jsonb(found);
  end if;

  stamped := stamped || jsonb_build_object(
    'checked_in', true,
    'checked_in_at', now()
  );

  begin
    update public.tickets
    set qr_code_data = stamped
    where id = p_ticket_id
    returning * into found;
  exception
    when others then
      update public.tickets
      set qr_code_data = stamped::text
      where id = p_ticket_id
      returning * into found;
  end;

  begin
    update public.tickets
    set status = 'used'
    where id = p_ticket_id
    returning * into found;
  exception
    when others then
      begin
        update public.tickets
        set status = 'checked_in'
        where id = p_ticket_id
        returning * into found;
      exception
        when others then
          null;
      end;
  end;

  select * into found from public.tickets where id = p_ticket_id;
  return to_jsonb(found);
end;
$$;

create or replace function public.bu_list_event_tickets(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return coalesce(
    (
      select jsonb_agg(to_jsonb(t) order by t.created_at)
      from public.tickets t
      where t.event_id = p_event_id
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.bu_submit_ticket_feedback(
  p_ticket_id uuid,
  p_guest_id uuid,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found public.tickets;
  stamped jsonb;
  note text;
begin
  note := trim(coalesce(p_comment, ''));
  if p_ticket_id is null or p_guest_id is null or length(note) < 3 then
    raise exception using message = 'comment required';
  end if;

  select * into found
  from public.tickets
  where id = p_ticket_id
    and buyer_id = p_guest_id;

  if found.id is null then
    return null;
  end if;

  stamped := public.bu_ticket_qr_object(to_jsonb(found) -> 'qr_code_data') || jsonb_build_object(
    'guest_comment', left(note, 1000),
    'guest_comment_at', now()
  );

  begin
    update public.tickets
    set qr_code_data = stamped
    where id = p_ticket_id
    returning * into found;
  exception
    when others then
      update public.tickets
      set qr_code_data = stamped::text
      where id = p_ticket_id
      returning * into found;
  end;

  return to_jsonb(found);
end;
$$;

revoke all on function public.bu_ticket_qr_object(jsonb) from public;
grant execute on function public.bu_ticket_qr_object(jsonb) to anon, authenticated;

revoke all on function public.bu_checkin_event_ticket(uuid, uuid) from public;
grant execute on function public.bu_checkin_event_ticket(uuid, uuid) to anon, authenticated;

revoke all on function public.bu_list_event_tickets(uuid) from public;
grant execute on function public.bu_list_event_tickets(uuid) to anon, authenticated;

revoke all on function public.bu_submit_ticket_feedback(uuid, uuid, text) from public;
grant execute on function public.bu_submit_ticket_feedback(uuid, uuid, text) to anon, authenticated;
