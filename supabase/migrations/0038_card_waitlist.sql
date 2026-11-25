-- Ƀucks Card (NFC + EMV) interest waitlist until an issuer goes live.

create table if not exists public.bu_card_waitlist (
  user_id uuid primary key,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists bu_card_waitlist_created_idx
  on public.bu_card_waitlist (created_at desc);

alter table public.bu_card_waitlist enable row level security;
