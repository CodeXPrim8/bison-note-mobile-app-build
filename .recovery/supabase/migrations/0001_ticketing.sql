-- BU ticketing + gateway schema
-- Run in the Supabase SQL editor (or via supabase db push).

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('guest', 'celebrant', 'vendor', 'merchant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_status as enum ('draft', 'published', 'cancelled', 'ended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_status as enum ('reserved', 'paid', 'refunded', 'cancelled', 'checked_in');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'processing', 'success', 'failed', 'settled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_kind as enum ('ticket', 'deposit', 'withdrawal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.bu_tx_type as enum (
    'deposit', 'spray', 'purchase', 'ticket_purchase', 'withdrawal', 'spray_credit', 'refund'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.webhook_delivery_status as enum (
    'pending', 'delivered', 'failed', 'retrying'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'guest',
  display_name text not null default 'BU Guest',
  username text unique,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Wallets
-- ---------------------------------------------------------------------------
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  bu_balance numeric(14, 2) not null default 0 check (bu_balance >= 0),
  naira_available numeric(14, 2) not null default 0 check (naira_available >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Gateway merchants
-- ---------------------------------------------------------------------------
create table if not exists public.gateway_merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
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
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references public.profiles (id) on delete set null,
  merchant_id uuid references public.gateway_merchants (id) on delete set null,
  title text not null,
  slug text not null unique,
  description text,
  venue_name text,
  venue_lat numeric(9, 6),
  venue_lng numeric(9, 6),
  start_time timestamptz not null,
  end_time timestamptz,
  cover_image_url text,
  status public.event_status not null default 'draft',
  is_gateway_event boolean not null default false,
  paystack_subaccount_code text,
  commission_rate numeric(5, 4) not null default 0,
  spray_budget_bu numeric(14, 2) not null default 0,
  celebrant_name text,
  celebrant_wallet_id uuid references public.wallets (id) on delete set null,
  capacity integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_status_start_idx on public.events (status, start_time);
create index if not exists events_organizer_idx on public.events (organizer_id);
create index if not exists events_merchant_idx on public.events (merchant_id);
create index if not exists events_title_trgm on public.events using gin (title gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Ticket tiers
-- ---------------------------------------------------------------------------
create table if not exists public.ticket_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  price numeric(14, 2) not null default 0 check (price >= 0),
  currency text not null default 'NGN',
  quantity_total integer not null check (quantity_total >= 0),
  quantity_sold integer not null default 0 check (quantity_sold >= 0),
  sales_start timestamptz,
  sales_end timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_tiers_sold_lte_total check (quantity_sold <= quantity_total)
);

create index if not exists ticket_tiers_event_idx on public.ticket_tiers (event_id);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  paystack_reference text unique,
  user_id uuid references public.profiles (id) on delete set null,
  merchant_id uuid references public.gateway_merchants (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  kind public.payment_kind not null default 'ticket',
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'NGN',
  status public.payment_status not null default 'pending',
  buyer_email text not null,
  buyer_name text,
  buyer_phone text,
  callback_url text,
  authorization_url text,
  metadata jsonb not null default '{}'::jsonb,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_event_idx on public.payments (event_id);

-- ---------------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------------
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  tier_id uuid not null references public.ticket_tiers (id) on delete restrict,
  payment_id uuid references public.payments (id) on delete set null,
  buyer_user_id uuid references public.profiles (id) on delete set null,
  buyer_email text not null,
  buyer_name text,
  buyer_phone text,
  amount_paid numeric(14, 2) not null default 0,
  status public.ticket_status not null default 'reserved',
  qr_code_data text,
  checkin_code text unique,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id) on delete set null,
  reserved_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tickets_event_status_idx on public.tickets (event_id, status);
create index if not exists tickets_buyer_email_idx on public.tickets (buyer_email);
create index if not exists tickets_checkin_code_idx on public.tickets (checkin_code);
create index if not exists tickets_payment_idx on public.tickets (payment_id);

-- ---------------------------------------------------------------------------
-- BU ledger
-- ---------------------------------------------------------------------------
create table if not exists public.bu_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.bu_tx_type not null,
  amount numeric(14, 2) not null,
  currency text not null default 'NGN',
  status text not null default 'completed',
  paystack_reference text,
  payment_id uuid references public.payments (id) on delete set null,
  counterparty_user_id uuid references public.profiles (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bu_tx_user_idx on public.bu_transactions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Merchant webhook deliveries (retry queue)
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.gateway_merchants (id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_retry_at timestamptz not null default now(),
  last_status public.webhook_delivery_status not null default 'pending',
  last_error text,
  last_http_status integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webhook_deliveries_retry_idx
  on public.webhook_deliveries (last_status, next_retry_at);

-- ---------------------------------------------------------------------------
-- Idempotency
-- ---------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key text not null,
  request_hash text not null,
  response jsonb not null,
  status_code integer not null default 200,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (scope, key)
);

create index if not exists idempotency_expires_idx on public.idempotency_keys (expires_at);

-- ---------------------------------------------------------------------------
-- Updated-at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  create trigger profiles_updated_at before update on public.profiles
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger wallets_updated_at before update on public.wallets
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger events_updated_at before update on public.events
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger ticket_tiers_updated_at before update on public.ticket_tiers
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger tickets_updated_at before update on public.tickets
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger payments_updated_at before update on public.payments
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger merchants_updated_at before update on public.gateway_merchants
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Auth signup: profile + wallet
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'BU Guest'),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'guest')
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Atomic ticket reservation / release (money-critical)
-- ---------------------------------------------------------------------------
create or replace function public.reserve_tickets(p_tier_id uuid, p_qty integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if p_qty is null or p_qty < 1 then
    return false;
  end if;

  update public.ticket_tiers
  set quantity_sold = quantity_sold + p_qty
  where id = p_tier_id
    and is_active = true
    and quantity_sold + p_qty <= quantity_total
    and (sales_start is null or sales_start <= now())
    and (sales_end is null or sales_end >= now());

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

create or replace function public.release_tickets(p_tier_id uuid, p_qty integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if p_qty is null or p_qty < 1 then
    return false;
  end if;

  update public.ticket_tiers
  set quantity_sold = greatest(quantity_sold - p_qty, 0)
  where id = p_tier_id;

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

-- Credit wallet + ledger in one transaction
create or replace function public.credit_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_type public.bu_tx_type,
  p_description text default null,
  p_payment_id uuid default null,
  p_event_id uuid default null,
  p_reference text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  tx_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  insert into public.wallets (user_id, bu_balance, naira_available)
  values (p_user_id, p_amount, p_amount)
  on conflict (user_id) do update
    set bu_balance = public.wallets.bu_balance + excluded.bu_balance,
        naira_available = public.wallets.naira_available + excluded.naira_available;

  insert into public.bu_transactions (
    user_id, type, amount, description, payment_id, event_id, paystack_reference, metadata
  )
  values (
    p_user_id, p_type, p_amount, p_description, p_payment_id, p_event_id, p_reference, p_metadata
  )
  returning id into tx_id;

  return tx_id;
end;
$$;

create or replace function public.debit_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_type public.bu_tx_type,
  p_description text default null,
  p_counterparty uuid default null,
  p_event_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  tx_id uuid;
  current_bal numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select bu_balance into current_bal from public.wallets where user_id = p_user_id for update;
  if current_bal is null or current_bal < p_amount then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  update public.wallets
  set bu_balance = bu_balance - p_amount,
      naira_available = naira_available - p_amount
  where user_id = p_user_id;

  insert into public.bu_transactions (
    user_id, type, amount, description, counterparty_user_id, event_id, metadata
  )
  values (
    p_user_id, p_type, p_amount, p_description, p_counterparty, p_event_id, p_metadata
  )
  returning id into tx_id;

  return tx_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Writes for payments/tickets go through service-role Route Handlers.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.events enable row level security;
alter table public.ticket_tiers enable row level security;
alter table public.tickets enable row level security;
alter table public.payments enable row level security;
alter table public.bu_transactions enable row level security;
alter table public.gateway_merchants enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.idempotency_keys enable row level security;

-- Profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Wallets
drop policy if exists "wallets_select_own" on public.wallets;
create policy "wallets_select_own" on public.wallets
  for select using (auth.uid() = user_id);

-- Events: public can read published
drop policy if exists "events_select_published" on public.events;
create policy "events_select_published" on public.events
  for select using (
    status = 'published'
    or organizer_id = auth.uid()
  );

drop policy if exists "events_write_organizer" on public.events;
create policy "events_write_organizer" on public.events
  for all using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

-- Tiers: readable if parent event is
drop policy if exists "tiers_select_public" on public.ticket_tiers;
create policy "tiers_select_public" on public.ticket_tiers
  for select using (
    exists (
      select 1 from public.events e
      where e.id = ticket_tiers.event_id
        and (e.status = 'published' or e.organizer_id = auth.uid())
    )
  );

drop policy if exists "tiers_write_organizer" on public.ticket_tiers;
create policy "tiers_write_organizer" on public.ticket_tiers
  for all using (
    exists (
      select 1 from public.events e
      where e.id = ticket_tiers.event_id and e.organizer_id = auth.uid()
    )
  );

-- Tickets: buyer or organizer
drop policy if exists "tickets_select_involved" on public.tickets;
create policy "tickets_select_involved" on public.tickets
  for select using (
    buyer_user_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = tickets.event_id and e.organizer_id = auth.uid()
    )
  );

-- Payments: owner
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select using (user_id = auth.uid());

-- Ledger
drop policy if exists "bu_tx_select_own" on public.bu_transactions;
create policy "bu_tx_select_own" on public.bu_transactions
  for select using (user_id = auth.uid());

-- Merchants: owner
drop policy if exists "merchants_select_own" on public.gateway_merchants;
create policy "merchants_select_own" on public.gateway_merchants
  for select using (user_id = auth.uid());

-- webhook_deliveries / idempotency: service role only (no policies for anon/authenticated)

-- ---------------------------------------------------------------------------
-- Storage: event covers
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('event-covers', 'event-covers', true)
on conflict (id) do nothing;

drop policy if exists "event_covers_public_read" on storage.objects;
create policy "event_covers_public_read" on storage.objects
  for select using (bucket_id = 'event-covers');

drop policy if exists "event_covers_auth_write" on storage.objects;
create policy "event_covers_auth_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-covers');

-- ---------------------------------------------------------------------------
-- Demo published events (organizer_id null — works before first signup)
-- ---------------------------------------------------------------------------
insert into public.events (
  id, title, slug, description, venue_name, venue_lat, venue_lng,
  start_time, end_time, status, commission_rate, celebrant_name, cover_image_url
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'Graduation Party',
    'graduation-party-demo',
    'Join us for a celebration of achievements and milestones.',
    'Lagos, Nigeria',
    6.5244, 3.3792,
    timestamptz '2026-09-15 18:00:00+01',
    timestamptz '2026-09-16 02:00:00+01',
    'published',
    0,
    'University Events Committee',
    null
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Cultural Festival',
    'cultural-festival-demo',
    'Experience the rich cultural heritage of Nigeria through music and dance.',
    'Abuja, Nigeria',
    9.0765, 7.3986,
    timestamptz '2026-09-20 16:00:00+01',
    timestamptz '2026-09-20 23:00:00+01',
    'published',
    0,
    'Cultural Heritage Foundation',
    null
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'Chioma Adeyemi Wedding',
    'chioma-adeyemi-wedding-demo',
    'Celebrate with Chioma. Spray ɃU at the event after ticket purchase.',
    'Lagos, Nigeria',
    6.4281, 3.4219,
    timestamptz '2026-10-27 12:00:00+01',
    timestamptz '2026-10-27 23:00:00+01',
    'published',
    0,
    'Chioma Adeyemi',
    null
  )
on conflict (slug) do nothing;

insert into public.ticket_tiers (event_id, name, price, quantity_total, metadata)
values
  ('11111111-1111-4111-8111-111111111111', 'General', 5000, 150, '{"description":"Standard entry"}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'VIP', 15000, 40, '{"description":"VIP seating + drink"}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'General', 3500, 200, '{"description":"Festival access"}'::jsonb),
  ('33333333-3333-4333-8333-333333333333', 'VIP', 10000, 80, '{"description":"VIP table"}'::jsonb),
  ('33333333-3333-4333-8333-333333333333', 'VVIP', 25000, 20, '{"description":"VVIP table + spraying kit"}'::jsonb)
on conflict do nothing;
