-- Vendor pay profile and locked purpose gifts.
-- Run in the live Supabase SQL editor after 0036.

create table if not exists public.bu_vendor_profiles (
  user_id uuid primary key,
  business_name text,
  category text,
  logo_data_url text,
  settlement text not null default 'wallet' check (settlement in ('wallet', 'bank')),
  bank_name text,
  bank_code text,
  bank_account_number text,
  latitude double precision,
  longitude double precision,
  updated_at timestamptz not null default now()
);

create table if not exists public.bu_purpose_gifts (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null,
  to_user_id uuid not null,
  from_name text,
  purpose text not null,
  locked boolean not null default false,
  amount_bu numeric not null,
  remaining_bu numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists bu_purpose_gifts_to_idx
  on public.bu_purpose_gifts (to_user_id, remaining_bu);
