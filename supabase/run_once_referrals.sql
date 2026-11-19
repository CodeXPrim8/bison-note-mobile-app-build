-- Run once in Supabase SQL editor if migration 0036 is not applied yet.

create table if not exists public.bu_referral_codes (
  user_id uuid primary key,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.bu_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null,
  referee_id uuid not null unique,
  code text not null,
  reward_bu numeric not null default 1000,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists bu_referral_codes_code_idx on public.bu_referral_codes (code);
create index if not exists bu_referrals_referrer_idx on public.bu_referrals (referrer_id, created_at desc);

alter table public.bu_referral_codes enable row level security;
alter table public.bu_referrals enable row level security;

-- Existing installs: new referrals stay pending until friend funds/spends Ƀ3,000.
alter table public.bu_referrals alter column status set default 'pending';
