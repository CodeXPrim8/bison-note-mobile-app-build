-- Vendor role, event vendor links, and POS sales.
-- Run in the live ɃU Supabase SQL editor after 0015 / 0033.

alter table public.bu_account_roles
  add column if not exists is_vendor boolean not null default false;

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
  elsif p_flag = 'vendor' then
    update public.bu_account_roles set is_vendor = true, updated_at = now() where user_id = p_user_id returning * into row;
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
      'is_vendor', false,
      'is_super_admin', false,
      'affiliate_code', null
    );
  end if;
  return to_jsonb(row);
end;
$$;

create table if not exists public.bu_event_vendors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  vendor_user_id uuid not null,
  commission_pct numeric not null default 10,
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, vendor_user_id)
);

create index if not exists bu_event_vendors_vendor_idx on public.bu_event_vendors (vendor_user_id, status);
create index if not exists bu_event_vendors_event_idx on public.bu_event_vendors (event_id, status);

alter table public.bu_event_vendors enable row level security;

create table if not exists public.bu_pos_sales (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  vendor_user_id uuid not null,
  celebrant_user_id uuid,
  guest_user_id uuid not null,
  event_id uuid,
  mode text not null check (mode in ('event', 'business')),
  amount_naira numeric not null,
  celebrant_naira numeric not null default 0,
  vendor_naira numeric not null default 0,
  commission_pct numeric not null default 0,
  status text not null default 'pending_notes'
    check (status in ('pending_notes', 'confirmed', 'notes_issued', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bu_pos_sales_vendor_idx on public.bu_pos_sales (vendor_user_id, created_at desc);
create index if not exists bu_pos_sales_event_idx on public.bu_pos_sales (event_id, created_at desc);
create index if not exists bu_pos_sales_guest_idx on public.bu_pos_sales (guest_user_id, created_at desc);

alter table public.bu_pos_sales enable row level security;
