-- Optional audit table for PIN resets (challenge tokens are signed in-app).
create table if not exists public.bu_pin_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  phone text not null,
  email text,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists bu_pin_resets_user_idx
  on public.bu_pin_resets (user_id, created_at desc);

alter table public.bu_pin_resets enable row level security;
