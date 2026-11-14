-- Bypass RLS for Dedicated Virtual Account reads/writes.
-- Next.js uses the anon key when SUPABASE_SERVICE_ROLE_KEY is missing (same pattern as 0018).

create table if not exists public.bu_virtual_accounts (
  user_id uuid primary key,
  customer_code text not null,
  customer_id bigint,
  account_number text not null,
  account_name text,
  bank_name text,
  bank_slug text,
  bank_id bigint,
  currency text not null default 'NGN',
  active boolean not null default true,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_number)
);

create unique index if not exists bu_virtual_accounts_customer_uidx
  on public.bu_virtual_accounts (customer_code);

create index if not exists bu_virtual_accounts_account_idx
  on public.bu_virtual_accounts (account_number);

alter table public.bu_virtual_accounts enable row level security;

create or replace function public.bu_get_virtual_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.bu_virtual_accounts%rowtype;
begin
  if p_user_id is null then
    return null;
  end if;
  select * into row from public.bu_virtual_accounts where user_id = p_user_id;
  if not found then
    return null;
  end if;
  return to_jsonb(row);
end;
$$;

create or replace function public.bu_find_virtual_account(
  p_account_number text default null,
  p_customer_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.bu_virtual_accounts%rowtype;
  digits text;
begin
  digits := nullif(regexp_replace(coalesce(p_account_number, ''), '\D', '', 'g'), '');
  if digits is not null then
    select * into row from public.bu_virtual_accounts where account_number = digits;
    if found then
      return to_jsonb(row);
    end if;
  end if;
  if p_customer_code is not null and length(trim(p_customer_code)) > 0 then
    select * into row from public.bu_virtual_accounts where customer_code = trim(p_customer_code);
    if found then
      return to_jsonb(row);
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.bu_upsert_virtual_account(
  p_user_id uuid,
  p_customer_code text,
  p_account_number text,
  p_customer_id bigint default null,
  p_account_name text default null,
  p_bank_name text default null,
  p_bank_slug text default null,
  p_bank_id bigint default null,
  p_currency text default 'NGN',
  p_active boolean default true,
  p_raw jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.bu_virtual_accounts%rowtype;
  digits text;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;
  if p_customer_code is null or length(trim(p_customer_code)) = 0 then
    raise exception 'customer_code is required';
  end if;
  digits := nullif(regexp_replace(coalesce(p_account_number, ''), '\D', '', 'g'), '');
  if digits is null then
    raise exception 'account_number is required';
  end if;

  insert into public.bu_virtual_accounts (
    user_id,
    customer_code,
    customer_id,
    account_number,
    account_name,
    bank_name,
    bank_slug,
    bank_id,
    currency,
    active,
    raw,
    updated_at
  )
  values (
    p_user_id,
    trim(p_customer_code),
    p_customer_id,
    digits,
    p_account_name,
    p_bank_name,
    p_bank_slug,
    p_bank_id,
    coalesce(nullif(trim(p_currency), ''), 'NGN'),
    coalesce(p_active, true),
    coalesce(p_raw, '{}'::jsonb),
    now()
  )
  on conflict (user_id) do update
    set customer_code = excluded.customer_code,
        customer_id = excluded.customer_id,
        account_number = excluded.account_number,
        account_name = excluded.account_name,
        bank_name = excluded.bank_name,
        bank_slug = excluded.bank_slug,
        bank_id = excluded.bank_id,
        currency = excluded.currency,
        active = excluded.active,
        raw = excluded.raw,
        updated_at = excluded.updated_at
  returning * into row;

  return to_jsonb(row);
end;
$$;

revoke all on function public.bu_get_virtual_account(uuid) from public;
revoke all on function public.bu_find_virtual_account(text, text) from public;
revoke all on function public.bu_upsert_virtual_account(uuid, text, text, bigint, text, text, text, bigint, text, boolean, jsonb) from public;

grant execute on function public.bu_get_virtual_account(uuid) to anon, authenticated, service_role;
grant execute on function public.bu_find_virtual_account(text, text) to anon, authenticated, service_role;
grant execute on function public.bu_upsert_virtual_account(uuid, text, text, bigint, text, text, text, bigint, text, boolean, jsonb) to anon, authenticated, service_role;

create or replace function public.bu_wallet_has_reference(p_user_id uuid, p_reference text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_reference is null or length(trim(p_reference)) = 0 then
    return false;
  end if;
  if to_regclass('public.bu_wallet_ledger') is not null then
    if exists (
      select 1
      from public.bu_wallet_ledger
      where user_id = p_user_id
        and reference = trim(p_reference)
    ) then
      return true;
    end if;
  end if;
  return false;
end;
$$;

revoke all on function public.bu_wallet_has_reference(uuid, text) from public;
grant execute on function public.bu_wallet_has_reference(uuid, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
