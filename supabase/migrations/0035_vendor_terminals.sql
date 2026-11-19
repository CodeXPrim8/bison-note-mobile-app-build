-- Paystack Terminal pairing + pending contactless charges for Business POS.
-- Run after 0034_vendor_pos.sql

create table if not exists public.bu_vendor_terminals (
  id uuid primary key default gen_random_uuid(),
  vendor_user_id uuid not null,
  terminal_id text not null,
  serial_number text,
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_user_id, terminal_id)
);

create index if not exists bu_vendor_terminals_vendor_idx
  on public.bu_vendor_terminals (vendor_user_id, active);

alter table public.bu_vendor_terminals enable row level security;

create table if not exists public.bu_pos_terminal_charges (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  vendor_user_id uuid not null,
  terminal_id text not null,
  amount_naira numeric not null,
  payment_request_id bigint,
  offline_reference text,
  paystack_event_id text,
  paystack_reference text,
  status text not null default 'pending'
    check (status in ('pending', 'pushed', 'paid', 'failed', 'cancelled')),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bu_pos_terminal_charges_vendor_idx
  on public.bu_pos_terminal_charges (vendor_user_id, created_at desc);
create index if not exists bu_pos_terminal_charges_offline_idx
  on public.bu_pos_terminal_charges (offline_reference);
create index if not exists bu_pos_terminal_charges_paystack_idx
  on public.bu_pos_terminal_charges (paystack_reference);

alter table public.bu_pos_terminal_charges enable row level security;

-- Card/NFC POS has no ɃU guest wallet.
alter table public.bu_pos_sales
  alter column guest_user_id drop not null;
