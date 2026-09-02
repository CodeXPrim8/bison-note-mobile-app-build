-- ɃU Gateway (Paystack-style keys) on the live ɃU database.
-- Live events stay on celebrant_id / name / date. Merchants link by user_id = that celebrant.
-- Run in the live ɃU Supabase SQL editor.

create table if not exists public.gateway_merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  business_name text not null,
  email text not null,
  public_key text not null unique,
  secret_key_prefix text not null unique,
  secret_key_hash text not null,
  webhook_url text,
  webhook_secret text,
  bank_account_name text,
  bank_account_number_encrypted text,
  bank_code text,
  paystack_subaccount_code text,
  settlement_schedule text not null default 'auto',
  cors_origins text[] not null default '{}',
  commission_rate numeric(5, 4) not null default 0.04,
  is_verified boolean not null default true,
  live_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Website schema (0001) FKs user_id → profiles. Live organiser ids live in public.users.
alter table public.gateway_merchants drop constraint if exists gateway_merchants_user_id_fkey;

create unique index if not exists gateway_merchants_public_key_idx on public.gateway_merchants (public_key);
create unique index if not exists gateway_merchants_secret_prefix_idx on public.gateway_merchants (secret_key_prefix);
create index if not exists gateway_merchants_user_idx on public.gateway_merchants (user_id);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.gateway_merchants (id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_retry_at timestamptz not null default now(),
  last_status text not null default 'pending',
  last_error text,
  last_http_status integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webhook_deliveries_retry_idx
  on public.webhook_deliveries (last_status, next_retry_at);

create table if not exists public.idempotency_keys (
  scope text not null,
  key text not null,
  request_hash text not null,
  response jsonb,
  status_code integer,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (scope, key)
);

alter table public.gateway_merchants enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.idempotency_keys enable row level security;

drop policy if exists "gateway_merchants_select_own" on public.gateway_merchants;
create policy "gateway_merchants_select_own" on public.gateway_merchants
  for select using (user_id = auth.uid());
