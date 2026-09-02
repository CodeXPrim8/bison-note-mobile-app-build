-- Paystack Transfer columns + live wallet debit/credit for withdrawals.
-- Run in the live ɃU SQL editor after 0016. Use "Run and enable RLS" if prompted.

alter table public.bu_withdrawals
  add column if not exists bank_code text,
  add column if not exists paystack_recipient text,
  add column if not exists paystack_transfer_code text,
  add column if not exists paystack_reference text,
  add column if not exists transfer_error text,
  add column if not exists paid_at timestamptz;

create index if not exists bu_withdrawals_paystack_ref_idx
  on public.bu_withdrawals (paystack_reference)
  where paystack_reference is not null;

create or replace function public.bu_move_wallet(
  p_user_id uuid,
  p_naira numeric,
  p_direction text,
  p_type text default 'withdrawal',
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w jsonb;
  naira numeric := 0;
  next_bal numeric := 0;
  has_bu boolean;
  has_naira boolean;
  has_balance boolean;
  has_naira_bal boolean;
  has_updated boolean;
  tx_id uuid;
begin
  if p_user_id is null or p_naira is null or p_naira <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if p_direction not in ('debit', 'credit') then
    return jsonb_build_object('ok', false, 'reason', 'invalid direction');
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallets' and column_name = 'bu_balance'
  ) into has_bu;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallets' and column_name = 'naira_available'
  ) into has_naira;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallets' and column_name = 'balance'
  ) into has_balance;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallets' and column_name = 'naira_balance'
  ) into has_naira_bal;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallets' and column_name = 'updated_at'
  ) into has_updated;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select to_jsonb(wlt) into w
  from public.wallets wlt
  where wlt.user_id = p_user_id
  for update;

  if w is not null then
    naira := coalesce(
      greatest(
        coalesce(nullif((w->>'naira_available')::numeric, 0), 0),
        coalesce(nullif((w->>'naira_balance')::numeric, 0), 0),
        coalesce(nullif((w->>'balance')::numeric, 0), 0),
        coalesce(nullif((w->>'bu_balance')::numeric, 0), 0)
      ),
      0
    );
  end if;

  if p_direction = 'debit' then
    if w is null or naira < p_naira then
      return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT_FUNDS', 'naira', coalesce(naira, 0));
    end if;
    next_bal := naira - p_naira;
    if has_bu then
      update public.wallets set bu_balance = next_bal where user_id = p_user_id;
    end if;
    if has_naira then
      update public.wallets set naira_available = next_bal where user_id = p_user_id;
    end if;
    if has_balance then
      update public.wallets set balance = next_bal where user_id = p_user_id;
    end if;
    if has_naira_bal then
      update public.wallets set naira_balance = next_bal where user_id = p_user_id;
    end if;
  else
    next_bal := coalesce(naira, 0) + p_naira;
    if w is null then
      if has_balance then
        insert into public.wallets (user_id, balance) values (p_user_id, p_naira);
      elsif has_bu and has_naira then
        insert into public.wallets (user_id, bu_balance, naira_available) values (p_user_id, p_naira, p_naira);
      elsif has_bu then
        insert into public.wallets (user_id, bu_balance) values (p_user_id, p_naira);
      else
        return jsonb_build_object('ok', false, 'reason', 'no wallet columns');
      end if;
      if has_naira_bal then
        begin
          update public.wallets set naira_balance = p_naira where user_id = p_user_id;
        exception when others then
          null;
        end;
      end if;
    else
      if has_bu then
        update public.wallets set bu_balance = next_bal where user_id = p_user_id;
      end if;
      if has_naira then
        update public.wallets set naira_available = next_bal where user_id = p_user_id;
      end if;
      if has_balance then
        update public.wallets set balance = next_bal where user_id = p_user_id;
      end if;
      if has_naira_bal then
        update public.wallets set naira_balance = next_bal where user_id = p_user_id;
      end if;
    end if;
  end if;

  if has_updated then
    update public.wallets set updated_at = now() where user_id = p_user_id;
  end if;

  if to_regclass('public.bu_transactions') is not null then
    begin
      insert into public.bu_transactions (user_id, type, amount, description, metadata)
      values (
        p_user_id,
        p_type,
        p_naira,
        coalesce(p_description, p_type),
        coalesce(p_metadata, '{}'::jsonb)
      )
      returning id into tx_id;
    exception when others then
      begin
        insert into public.bu_transactions (user_id, type, amount, description, metadata)
        values (
          p_user_id,
          case when p_direction = 'debit' then 'withdrawal' else 'refund' end,
          p_naira,
          coalesce(p_description, p_type),
          coalesce(p_metadata, '{}'::jsonb)
        )
        returning id into tx_id;
      exception when others then
        tx_id := null;
      end;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'naira', next_bal,
    'moved', p_naira,
    'direction', p_direction,
    'tx_id', tx_id
  );
end;
$$;

revoke all on function public.bu_move_wallet(uuid, numeric, text, text, text, jsonb) from public;
grant execute on function public.bu_move_wallet(uuid, numeric, text, text, text, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
