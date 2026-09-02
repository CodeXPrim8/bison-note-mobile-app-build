-- Super Admin control plane. Run in the live ɃU Supabase SQL editor after 0015.
-- Does not grant Super Admin to organisers or affiliates.

create table if not exists public.bu_platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.bu_user_control (
  user_id uuid primary key,
  suspended boolean not null default false,
  organizer_suspended boolean not null default false,
  deleted_at timestamptz,
  note text,
  updated_at timestamptz not null default now()
);

create table if not exists public.bu_ads (
  id uuid primary key default gen_random_uuid(),
  slot text not null,
  title text not null default '',
  body text not null default '',
  image_url text,
  href text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bu_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  bu numeric not null,
  naira numeric not null,
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  status text not null default 'pending',
  mode text not null default 'manual',
  note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.bu_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  target text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bu_ads_slot_idx on public.bu_ads (slot, active, sort_order);
create index if not exists bu_withdrawals_status_idx on public.bu_withdrawals (status, created_at desc);
create index if not exists bu_withdrawals_user_idx on public.bu_withdrawals (user_id, created_at desc);
create index if not exists bu_admin_audit_idx on public.bu_admin_audit (created_at desc);

alter table public.bu_platform_settings enable row level security;
alter table public.bu_user_control enable row level security;
alter table public.bu_ads enable row level security;
alter table public.bu_withdrawals enable row level security;
alter table public.bu_admin_audit enable row level security;

drop policy if exists bu_settings_read on public.bu_platform_settings;
create policy bu_settings_read on public.bu_platform_settings for select using (true);

drop policy if exists bu_ads_public_read on public.bu_ads;
create policy bu_ads_public_read on public.bu_ads for select using (active = true);

grant select on public.bu_platform_settings to anon, authenticated;
grant select on public.bu_ads to anon, authenticated;
grant all on public.bu_platform_settings to service_role;
grant all on public.bu_user_control to service_role;
grant all on public.bu_ads to service_role;
grant all on public.bu_withdrawals to service_role;
grant all on public.bu_admin_audit to service_role;

insert into public.bu_platform_settings (key, value)
values
  ('bu_naira_value', '1'::jsonb),
  ('withdrawal_mode', '"automatic"'::jsonb)
on conflict (key) do nothing;
