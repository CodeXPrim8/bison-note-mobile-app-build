-- Paste into Supabase SQL editor to fix:
--   new row violates row-level security policy for table "bu_withdrawals"
-- Safe to re-run.

create or replace function public.bu_insert_withdrawal(p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.bu_withdrawals%rowtype;
  rid uuid;
begin
  if p_row is null or p_row->>'user_id' is null then
    raise exception 'user_id is required';
  end if;
  rid := coalesce(nullif(p_row->>'id', '')::uuid, gen_random_uuid());

  insert into public.bu_withdrawals (
    id, user_id, bu, naira, bank_name, bank_code, account_number, account_name,
    paystack_recipient, status, mode, reviewed_at, created_at
  )
  values (
    rid,
    (p_row->>'user_id')::uuid,
    coalesce((p_row->>'bu')::numeric, 0),
    coalesce((p_row->>'naira')::numeric, 0),
    coalesce(p_row->>'bank_name', ''),
    nullif(p_row->>'bank_code', ''),
    coalesce(p_row->>'account_number', ''),
    coalesce(p_row->>'account_name', ''),
    nullif(p_row->>'paystack_recipient', ''),
    coalesce(nullif(p_row->>'status', ''), 'pending'),
    coalesce(nullif(p_row->>'mode', ''), 'manual'),
    case when p_row ? 'reviewed_at' and nullif(p_row->>'reviewed_at', '') is not null
      then (p_row->>'reviewed_at')::timestamptz else null end,
    now()
  )
  returning * into row;

  return to_jsonb(row);
end;
$$;

create or replace function public.bu_update_withdrawal(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.bu_withdrawals%rowtype;
begin
  if p_id is null then
    raise exception 'id is required';
  end if;

  update public.bu_withdrawals w
  set
    status = coalesce(nullif(p_patch->>'status', ''), w.status),
    note = case when p_patch ? 'note' then p_patch->>'note' else w.note end,
    transfer_error = case when p_patch ? 'transfer_error' then p_patch->>'transfer_error' else w.transfer_error end,
    paystack_recipient = case when p_patch ? 'paystack_recipient' then p_patch->>'paystack_recipient' else w.paystack_recipient end,
    paystack_transfer_code = case when p_patch ? 'paystack_transfer_code' then p_patch->>'paystack_transfer_code' else w.paystack_transfer_code end,
    paystack_reference = case when p_patch ? 'paystack_reference' then p_patch->>'paystack_reference' else w.paystack_reference end,
    bank_code = case when p_patch ? 'bank_code' then p_patch->>'bank_code' else w.bank_code end,
    reviewed_at = case
      when p_patch ? 'reviewed_at' and nullif(p_patch->>'reviewed_at', '') is not null
        then (p_patch->>'reviewed_at')::timestamptz
      when p_patch ? 'status' then coalesce(w.reviewed_at, now())
      else w.reviewed_at
    end,
    paid_at = case
      when p_patch ? 'paid_at' and nullif(p_patch->>'paid_at', '') is not null
        then (p_patch->>'paid_at')::timestamptz
      when p_patch->>'status' = 'paid' then coalesce(w.paid_at, now())
      else w.paid_at
    end
  where w.id = p_id
  returning * into row;

  if not found then
    return null;
  end if;
  return to_jsonb(row);
end;
$$;

create or replace function public.bu_list_withdrawals(p_user_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rows jsonb;
begin
  if p_user_id is null then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at desc), '[]'::jsonb)
    into rows
  from (
    select *
    from public.bu_withdrawals
    where user_id = p_user_id
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) w;
  return rows;
end;
$$;

revoke all on function public.bu_insert_withdrawal(jsonb) from public;
revoke all on function public.bu_update_withdrawal(uuid, jsonb) from public;
revoke all on function public.bu_list_withdrawals(uuid, integer) from public;
grant execute on function public.bu_insert_withdrawal(jsonb) to anon, authenticated, service_role;
grant execute on function public.bu_update_withdrawal(uuid, jsonb) to anon, authenticated, service_role;
grant execute on function public.bu_list_withdrawals(uuid, integer) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
