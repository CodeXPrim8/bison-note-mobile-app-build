-- Lock privileged SECURITY DEFINER RPCs to service_role.
-- The Next.js server already calls these with SUPABASE_SERVICE_ROLE_KEY
-- (see lib/supabase/data.ts and lib/supabase/admin.ts), so transfers, login,
-- deposits, withdrawals, tickets, and admin keep working.
-- The public anon key must not be able to call them.

create table if not exists public.bu_pin_attempts (
  bucket text primary key,
  count integer not null default 0,
  reset_at timestamptz not null default now()
);

alter table public.bu_pin_attempts enable row level security;
revoke all on table public.bu_pin_attempts from public;

do $$
declare 
  fn record;
  targets text[] := array[
    'bu_move_wallet',
    'credit_wallet',
    'debit_wallet',
    'reserve_tickets',
    'release_tickets',
    'bu_login_row',
    'bu_verify_pin',
    'auth_email_for_phone',
    'bu_credit_sale_share',
    'bu_insert_withdrawal',
    'bu_update_withdrawal',
    'bu_list_withdrawals',
    'bu_get_virtual_account',
    'bu_find_virtual_account',
    'bu_upsert_virtual_account',
    'bu_wallet_has_reference',
    'bu_save_platform_settings',
    'bu_write_admin_audit',
    'bu_admin_list_users',
    'bu_admin_get_user',
    'bu_upsert_account_role',
    'bu_get_account_role',
    'bu_get_wallet',
    'bu_list_wallet_history',
    'bu_list_user_wallet_history',
    'bu_list_wallet_ledger',
    'bu_list_sale_credits',
    'bu_ensure_live_user',
    'bu_backfill_live_user_by_phone',
    'bu_delete_event',
    'bu_create_event',
    'bu_update_event',
    'bu_set_event_details',
    'bu_fulfill_live_tickets',
    'bu_claim_event_tickets',
    'bu_tickets_by_pay_ref',
    'bu_lookup_event_ticket',
    'bu_checkin_event_ticket',
    'bu_list_event_tickets',
    'bu_submit_ticket_feedback',
    'bu_ticket_qr_object',
    'bu_lookup_affiliate',
    'bu_make_affiliate_code'
  ];
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.bu_pin_attempts from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.bu_pin_attempts from authenticated';
  end if;

  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (targets)
  loop
    execute format('revoke all on function %s from public', fn.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', fn.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', fn.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', fn.sig);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
