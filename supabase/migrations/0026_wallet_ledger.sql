-- Wallet History / alerts for live users.id (not only profiles).
-- Safe to run in the live ɃU SQL editor. Does not change balances.

create table if not exists public.bu_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  direction text not null,
  type text not null,
  naira numeric not null,
  description text,
  reference text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, reference)
);

create index if not exists bu_wallet_ledger_user_idx
  on public.bu_wallet_ledger (user_id, created_at desc);

alter table public.bu_wallet_ledger enable row level security;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'bu_transactions'
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) ~* 'user_id'
  loop
    execute format('alter table public.bu_transactions drop constraint if exists %I', r.conname);
  end loop;
end $$;

notify pgrst, 'reload schema';
