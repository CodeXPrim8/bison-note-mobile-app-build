-- Ticket sales credit the organiser wallet (minus affiliate %). Affiliate commission
-- credits that affiliate's wallet. Both appear on ɃU wallet history.
-- Requires 0015 for roles; this file also ensures bu_sale_credits exists.

create table if not exists public.bu_sale_credits (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  user_id uuid not null,
  kind text not null,
  naira numeric not null,
  event_id uuid,
  organiser_user_id uuid,
  affiliate_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (reference, user_id, kind)
);

alter table public.bu_sale_credits add column if not exists applied boolean not null default false;
create index if not exists bu_sale_credits_user_idx on public.bu_sale_credits (user_id, created_at desc);

alter table public.bu_sale_credits enable row level security;

create or replace function public.bu_get_wallet(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w jsonb;
  naira numeric := 0;
begin
  if p_user_id is null then
    return jsonb_build_object('user_id', null, 'naira', 0, 'naira_available', 0, 'bu_balance', 0);
  end if;

  select to_jsonb(wlt) into w
  from public.wallets wlt
  where wlt.user_id = p_user_id;

  if w is null then
    return jsonb_build_object(
      'user_id', p_user_id,
      'naira', 0,
      'naira_available', 0,
      'bu_balance', 0
    );
  end if;

  -- Unused 0 columns (e.g. naira_available) must not hide live wallets.balance.
  naira := coalesce(
    greatest(
      nullif((w->>'naira_available')::numeric, 0),
      nullif((w->>'naira_balance')::numeric, 0),
      nullif((w->>'balance')::numeric, 0),
      nullif((w->>'bu_balance')::numeric, 0)
    ),
    0
  );

  return jsonb_build_object(
    'user_id', p_user_id,
    'naira', naira,
    'naira_available', naira,
    'bu_balance', naira
  );
end;
$$;

create or replace function public.bu_list_wallet_history(p_user_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
  sales jsonb := '[]'::jsonb;
begin
  if p_user_id is null then
    return '[]'::jsonb;
  end if;

  if to_regclass('public.bu_sale_credits') is not null then
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'id', c.id,
        'type', c.kind,
        'amount', c.naira,
        'description', case when c.kind = 'affiliate_commission' then 'Affiliate commission' else 'Ticket sale' end,
        'created_at', c.created_at,
        'reference', c.reference,
        'event_id', c.event_id
      ) order by c.created_at desc),
      '[]'::jsonb
    )
    into sales
    from (
      select *
      from public.bu_sale_credits
      where user_id = p_user_id
      order by created_at desc
      limit lim
    ) c;
  end if;

  return coalesce(sales, '[]'::jsonb);
end;
$$;

create or replace function public.bu_credit_sale_share(
  p_user_id uuid,
  p_naira numeric,
  p_kind text,
  p_reference text,
  p_event_id uuid default null,
  p_organiser_id uuid default null,
  p_affiliate_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.bu_sale_credits;
  has_bu boolean;
  has_naira boolean;
  has_balance boolean;
  wallet_ok boolean := false;
  wallet_err text := null;
  label text;
  has_updated boolean;
begin
  if p_user_id is null or p_naira is null or p_naira <= 0 or p_reference is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if p_kind not in ('organiser_sale', 'affiliate_commission') then
    return jsonb_build_object('ok', false, 'reason', 'invalid kind');
  end if;
  if p_kind = 'organiser_sale' and p_organiser_id is not null and p_user_id <> p_organiser_id then
    return jsonb_build_object('ok', false, 'reason', 'user mismatch');
  end if;
  if p_kind = 'affiliate_commission' and p_affiliate_id is not null and p_user_id <> p_affiliate_id then
    return jsonb_build_object('ok', false, 'reason', 'user mismatch');
  end if;

  insert into public.bu_sale_credits (
    reference, user_id, kind, naira, event_id, organiser_user_id, affiliate_user_id, metadata, applied
  )
  values (
    trim(p_reference), p_user_id, p_kind, p_naira, p_event_id, p_organiser_id, p_affiliate_id, coalesce(p_metadata, '{}'::jsonb), false
  )
  on conflict (reference, user_id, kind) do nothing
  returning * into inserted;

  if inserted.id is null then
    select * into inserted from public.bu_sale_credits
    where reference = trim(p_reference) and user_id = p_user_id and kind = p_kind;
    if inserted.applied then
      return jsonb_build_object('ok', true, 'duplicate', true, 'wallet_applied', true, 'credit', to_jsonb(inserted));
    end if;
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
    where table_schema = 'public' and table_name = 'wallets' and column_name = 'updated_at'
  ) into has_updated;

  begin
    if exists (select 1 from public.wallets where user_id = p_user_id) then
      if has_bu then
        update public.wallets
          set bu_balance = coalesce(bu_balance, 0) + p_naira
          where user_id = p_user_id;
      end if;
      if has_naira then
        update public.wallets
          set naira_available = coalesce(naira_available, 0) + p_naira
          where user_id = p_user_id;
      end if;
      if has_balance then
        update public.wallets
          set balance = coalesce(balance, 0) + p_naira
          where user_id = p_user_id;
      end if;
      if has_updated then
        update public.wallets set updated_at = now() where user_id = p_user_id;
      end if;
      wallet_ok := true;
    elsif has_bu and has_naira then
      insert into public.wallets (user_id, bu_balance, naira_available)
      values (p_user_id, p_naira, p_naira);
      wallet_ok := true;
    elsif has_bu then
      insert into public.wallets (user_id, bu_balance)
      values (p_user_id, p_naira);
      wallet_ok := true;
    elsif has_balance then
      insert into public.wallets (user_id, balance)
      values (p_user_id, p_naira);
      wallet_ok := true;
    end if;
  exception when others then
    wallet_ok := false;
    wallet_err := sqlerrm;
  end;

  label := case when p_kind = 'affiliate_commission' then 'Affiliate commission' else 'Ticket sale' end;

  if wallet_ok and to_regclass('public.bu_transactions') is not null then
    begin
      insert into public.bu_transactions (
        user_id, type, amount, description, paystack_reference, metadata
      ) values (
        p_user_id,
        'deposit',
        p_naira,
        label,
        trim(p_reference),
        coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('kind', p_kind, 'source', 'ticket_sale')
      );
    exception when others then
      null;
    end;
  end if;

  if wallet_ok then
    update public.bu_sale_credits set applied = true where id = inserted.id returning * into inserted;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'wallet_applied', wallet_ok,
    'wallet_error', wallet_err,
    'credit', to_jsonb(inserted)
  );
end;
$$;

revoke all on function public.bu_get_wallet(uuid) from public;
revoke all on function public.bu_list_wallet_history(uuid, integer) from public;
grant execute on function public.bu_get_wallet(uuid) to anon, authenticated, service_role;
grant execute on function public.bu_list_wallet_history(uuid, integer) to anon, authenticated, service_role;
grant execute on function public.bu_credit_sale_share(uuid, numeric, text, text, uuid, uuid, uuid, jsonb) to anon, authenticated, service_role;

do $g$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'bu_list_sale_credits'
  ) then
    execute 'grant execute on function public.bu_list_sale_credits(uuid, integer) to anon, authenticated, service_role';
  end if;
end
$g$;

notify pgrst, 'reload schema';
