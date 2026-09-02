-- One ɃU account can be guest + organiser + affiliate.
-- Super Admin is the existing public.users.role on that same live account, not a new login.
-- Run in the live ɃU Supabase SQL editor after 0014.

create table if not exists public.bu_account_roles (
  user_id uuid primary key,
  is_organizer boolean not null default false,
  is_affiliate boolean not null default false,
  is_super_admin boolean not null default false,
  affiliate_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
create index if not exists bu_sale_credits_event_idx on public.bu_sale_credits (event_id, created_at desc);
create index if not exists bu_account_roles_code_idx on public.bu_account_roles (affiliate_code);

alter table public.bu_account_roles enable row level security;
alter table public.bu_sale_credits enable row level security;

create or replace function public.bu_make_affiliate_code(p_user_id uuid)
returns text
language plpgsql
as $$
declare
  code text;
begin
  code := 'bua' || substr(replace(p_user_id::text, '-', ''), 1, 8);
  if exists (select 1 from public.bu_account_roles where affiliate_code = code and user_id <> p_user_id) then
    code := code || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  end if;
  return code;
end;
$$;

create or replace function public.bu_upsert_account_role(p_user_id uuid, p_flag text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.bu_account_roles;
begin
  if p_user_id is null then
    raise exception using message = 'missing user';
  end if;
  insert into public.bu_account_roles (user_id, affiliate_code)
  values (p_user_id, public.bu_make_affiliate_code(p_user_id))
  on conflict (user_id) do update set updated_at = now()
  returning * into row;

  if p_flag = 'organizer' then
    update public.bu_account_roles set is_organizer = true, updated_at = now() where user_id = p_user_id returning * into row;
  elsif p_flag = 'affiliate' then
    update public.bu_account_roles
      set is_affiliate = true,
          affiliate_code = coalesce(affiliate_code, public.bu_make_affiliate_code(p_user_id)),
          updated_at = now()
      where user_id = p_user_id
      returning * into row;
  elsif p_flag = 'super_admin' then
    raise exception using message = 'super_admin is SQL-only';
  end if;

  return to_jsonb(row);
end;
$$;

create or replace function public.bu_get_account_role(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.bu_account_roles;
begin
  select * into row from public.bu_account_roles where user_id = p_user_id;
  if not found then
    return jsonb_build_object(
      'user_id', p_user_id,
      'is_organizer', false,
      'is_affiliate', false,
      'is_super_admin', false,
      'affiliate_code', null
    );
  end if;
  return to_jsonb(row);
end;
$$;

create or replace function public.bu_lookup_affiliate(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.bu_account_roles;
begin
  if p_code is null or length(trim(p_code)) < 4 then
    return null;
  end if;
  select * into row
  from public.bu_account_roles
  where lower(affiliate_code) = lower(trim(p_code))
    and is_affiliate = true;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'user_id', row.user_id,
    'affiliate_code', row.affiliate_code
  );
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
      return jsonb_build_object('ok', true, 'duplicate', true, 'credit', to_jsonb(inserted));
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
    elsif has_bu and has_naira then
      insert into public.wallets (user_id, bu_balance, naira_available)
      values (p_user_id, p_naira, p_naira);
    elsif has_bu then
      insert into public.wallets (user_id, bu_balance)
      values (p_user_id, p_naira);
    elsif has_balance then
      insert into public.wallets (user_id, balance)
      values (p_user_id, p_naira);
    end if;

    update public.bu_sale_credits set applied = true where id = inserted.id returning * into inserted;
  exception when others then
    return jsonb_build_object('ok', true, 'duplicate', false, 'wallet_applied', false, 'credit', to_jsonb(inserted));
  end;

  return jsonb_build_object('ok', true, 'duplicate', false, 'wallet_applied', true, 'credit', to_jsonb(inserted));
end;
$$;

create or replace function public.bu_list_sale_credits(p_user_id uuid default null, p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return coalesce(
    (
      select jsonb_agg(to_jsonb(c) order by c.created_at desc)
      from (
        select *
        from public.bu_sale_credits
        where p_user_id is null or user_id = p_user_id
        order by created_at desc
        limit greatest(1, least(coalesce(p_limit, 200), 500))
      ) c
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.bu_make_affiliate_code(uuid) from public;
revoke all on function public.bu_upsert_account_role(uuid, text) from public;
revoke all on function public.bu_get_account_role(uuid) from public;
revoke all on function public.bu_lookup_affiliate(text) from public;
revoke all on function public.bu_credit_sale_share(uuid, numeric, text, text, uuid, uuid, uuid, jsonb) from public;
revoke all on function public.bu_list_sale_credits(uuid, integer) from public;
grant execute on function public.bu_upsert_account_role(uuid, text) to anon, authenticated, service_role;
grant execute on function public.bu_get_account_role(uuid) to anon, authenticated, service_role;
grant execute on function public.bu_lookup_affiliate(text) to anon, authenticated, service_role;
grant execute on function public.bu_credit_sale_share(uuid, numeric, text, text, uuid, uuid, uuid, jsonb) to anon, authenticated, service_role;
grant execute on function public.bu_list_sale_credits(uuid, integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
