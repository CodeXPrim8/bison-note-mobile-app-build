-- Lets organisers delete events they created.
-- Related tickets and invites are removed with the event. Wallet credits stay.
-- Run this in the live ɃU Supabase SQL editor.

create or replace function public.bu_delete_event(p_event_id uuid, p_celebrant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev jsonb;
  owner uuid;
  child text;
begin
  if p_event_id is null or p_celebrant_id is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION');
  end if;

  select to_jsonb(e) into ev
  from public.events e
  where e.id = p_event_id;

  if ev is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  owner := nullif(ev->>'celebrant_id', '')::uuid;
  if owner is null then
    owner := nullif(ev->>'organizer_id', '')::uuid;
  end if;

  if owner is distinct from p_celebrant_id then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  foreach child in array array[
    'event_check_ins',
    'event_invitations',
    'invites',
    'ticket_tiers',
    'tickets'
  ]
  loop
    begin
      if to_regclass('public.' || child) is not null then
        execute format('delete from public.%I where event_id = $1', child) using p_event_id;
      end if;
    exception
      when undefined_table then null;
      when undefined_column then null;
    end;
  end loop;

  delete from public.events where id = p_event_id;

  return jsonb_build_object('ok', true, 'event_id', p_event_id);
end;
$$;

revoke all on function public.bu_delete_event(uuid, uuid) from public;
grant execute on function public.bu_delete_event(uuid, uuid) to anon, authenticated, service_role;
