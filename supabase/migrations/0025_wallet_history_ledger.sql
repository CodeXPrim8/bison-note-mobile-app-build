-- Let wallet history rows attach to live users.id (not only profiles).
-- Run in the live ɃU SQL editor if History stays empty after a send/top-up/withdraw.

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
