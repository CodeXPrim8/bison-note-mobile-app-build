-- Live ɃU ticketing without a service_role key.
-- Run this in the ɃU Supabase SQL editor so the website can claim inventory,
-- mint tickets after Paystack, and check them in.

create or replace function public.bu_tickets_by_pay_ref(p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ref is null or length(trim(p_ref)) < 8 then
    return '[]'::jsonb;
  end if;
  return coalesce(
    (
      select jsonb_agg(to_jsonb(t) order by t.created_at)
      from public.tickets t
      where t.qr_code_data::text ilike '%' || trim(p_ref) || '%'
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.bu_claim_event_tickets(p_event_id uuid, p_qty integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated int;
begin
  if p_qty is null or p_qty < 1 then
    return false;
  end if;

  update public.events
  set tickets_sold = coalesce(tickets_sold, 0) + p_qty
  where id = p_event_id
    and coalesce(max_tickets, 0) >= coalesce(tickets_sold, 0) + p_qty;

  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

create or replace function public.bu_fulfill_live_tickets(
  p_event_id uuid,
  p_buyer_id uuid,
  p_qty integer,
  p_unit_price numeric,
  p_pay_ref text,
  p_qr_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  remaining int;
  item jsonb;
  new_id uuid;
  minted jsonb := '[]'::jsonb;
  requested_id uuid;
begin
  existing := public.bu_tickets_by_pay_ref(p_pay_ref);
  if existing is not null and jsonb_array_length(existing) > 0 then
    return existing;
  end if;

  if p_qty is null or p_qty < 1 then
    raise exception using message = 'sold out';
  end if;

  select coalesce(max_tickets, 0) - coalesce(tickets_sold, 0)
    into remaining
  from public.events
  where id = p_event_id
  for update;

  if remaining is null then
    raise exception using message = 'event not found';
  end if;
  if remaining < p_qty then
    raise exception using message = 'sold out';
  end if;

  update public.events
  set tickets_sold = coalesce(tickets_sold, 0) + p_qty
  where id = p_event_id;

  for item in select * from jsonb_array_elements(coalesce(p_qr_items, '[]'::jsonb))
  loop
    requested_id := nullif(item->>'id', '')::uuid;
    begin
      insert into public.tickets (
        id,
        event_id,
        buyer_id,
        quantity,
        total_price_bu,
        status,
        qr_code_data
      ) values (
        coalesce(requested_id, gen_random_uuid()),
        p_event_id,
        p_buyer_id,
        1,
        coalesce(p_unit_price, 0),
        'confirmed',
        coalesce(item->'qr_code_data', (item->>'qr_code_data')::jsonb)
      )
      returning id into new_id;
    exception
      when others then
        insert into public.tickets (
          id,
          event_id,
          buyer_id,
          quantity,
          total_price_bu,
          status,
          qr_code_data
        ) values (
          coalesce(requested_id, gen_random_uuid()),
          p_event_id,
          p_buyer_id,
          1,
          coalesce(p_unit_price, 0),
          'confirmed',
          item->>'qr_code_data'
        )
        returning id into new_id;
    end;

    minted := minted || jsonb_build_array(to_jsonb((select t from public.tickets t where t.id = new_id)));
  end loop;

  return minted;
end;
$$;

create or replace function public.bu_lookup_event_ticket(p_event_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found public.tickets;
  needle text;
begin
  if p_code is null or length(trim(p_code)) < 4 then
    return null;
  end if;
  needle := trim(p_code);

  select * into found
  from public.tickets
  where event_id = p_event_id
    and (
      id::text = needle
      or qr_code_data::text = needle
      or qr_code_data::text ilike '%' || needle || '%'
    )
  order by created_at desc
  limit 1;

  if found.id is null then
    return null;
  end if;
  return to_jsonb(found);
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
begin
  select * into found
  from public.tickets
  where id = p_ticket_id and event_id = p_event_id;

  if found.id is null then
    return null;
  end if;

  if found.status in ('used', 'checked_in') then
    return to_jsonb(found);
  end if;
  if found.status in ('refunded', 'cancelled', 'reserved') then
    return to_jsonb(found);
  end if;

  begin
    update public.tickets
    set status = 'used'
    where id = p_ticket_id
    returning * into found;
  exception
    when others then
      update public.tickets
      set status = 'checked_in'
      where id = p_ticket_id
      returning * into found;
  end;

  return to_jsonb(found);
end;
$$;

revoke all on function public.bu_tickets_by_pay_ref(text) from public;
grant execute on function public.bu_tickets_by_pay_ref(text) to anon, authenticated;

revoke all on function public.bu_claim_event_tickets(uuid, integer) from public;
grant execute on function public.bu_claim_event_tickets(uuid, integer) to anon, authenticated;

revoke all on function public.bu_fulfill_live_tickets(uuid, uuid, integer, numeric, text, jsonb) from public;
grant execute on function public.bu_fulfill_live_tickets(uuid, uuid, integer, numeric, text, jsonb) to anon, authenticated;

revoke all on function public.bu_lookup_event_ticket(uuid, text) from public;
grant execute on function public.bu_lookup_event_ticket(uuid, text) to anon, authenticated;

revoke all on function public.bu_checkin_event_ticket(uuid, uuid) from public;
grant execute on function public.bu_checkin_event_ticket(uuid, uuid) to anon, authenticated;
