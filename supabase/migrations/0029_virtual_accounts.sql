-- Paystack Dedicated Virtual Accounts (NUBAN) for bank-transfer funding → ɃU.
-- Safe to run in the live ɃU SQL editor.

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

notify pgrst, 'reload schema';
