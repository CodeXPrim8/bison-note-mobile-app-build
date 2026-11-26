-- Refuse privileged functions unless the caller is the service role.
-- A later GRANT to anon cannot reopen wallet or login access.
-- The Next.js server calls these with SUPABASE_SERVICE_ROLE_KEY, so the app keeps working.
-- The SQL editor (postgres, no JWT) can still run them for repairs.

create or replace function public.bu_assert_service_role()
returns void
language plpgsql
stable
security invoker
set search_path = public, auth
as $$
declare
  jwt_role text;
begin
  begin
    jwt_role := nullif(auth.role(), '');
  exception when others then
    jwt_role := null;
  end;

  if jwt_role is null then
    jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  end if;

  if jwt_role is null and nullif(current_setting('request.jwt.claims', true), '') is not null then
    begin
      jwt_role := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
    exception when others then
      jwt_role := null;
    end;
  end if;

  if jwt_role = 'service_role' then
    return;
  end if;

  if jwt_role is null and current_user in ('postgres', 'supabase_admin') then
    return;
  end if;

  raise exception 'forbidden' using errcode = '42501';
end;
$$;

revoke all on function public.bu_assert_service_role() from public;

do $$
declare
  fn record;
  def text;
  body_from integer;
  rel integer;
  abs_pos integer;
  patched text;
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
    execute 'revoke all on function public.bu_assert_service_role() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.bu_assert_service_role() from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.bu_assert_service_role() to service_role';
  end if;

  for fn in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
      and l.lanname = 'plpgsql'
      and p.proname = any (targets)
      and p.proname <> 'bu_assert_service_role'
  loop
    def := pg_get_functiondef(fn.oid);
    if position('bu_assert_service_role' in def) > 0 then
      continue;
    end if;

    body_from := position('$function$' in def);
    if body_from = 0 then
      raise exception 'could not patch % (no function body)', fn.proname;
    end if;
    body_from := body_from + length('$function$');

    rel := regexp_instr(substr(def, body_from), '\mbegin\M', 1, 1, 0, 'i');
    if rel = 0 then
      raise exception 'could not patch % (no begin)', fn.proname;
    end if;

    abs_pos := body_from + rel - 1 + length('begin');
    patched := substr(def, 1, abs_pos - 1)
      || E'\n  perform public.bu_assert_service_role();\n'
      || substr(def, abs_pos);
    execute patched;

    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from public, anon, authenticated', fn.oid::regprocedure);
    else
      execute format('revoke all on function %s from public', fn.oid::regprocedure);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', fn.oid::regprocedure);
    end if;
  end loop;
end $$;

create or replace function public.auth_email_for_phone(p_phone_e164 text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found text;
begin
  perform public.bu_assert_service_role();
  select p.email into found
  from public.profiles p
  where p.phone_e164 = p_phone_e164
  limit 1;
  return found;
end;
$$;

revoke all on function public.auth_email_for_phone(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.auth_email_for_phone(text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.auth_email_for_phone(text) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.auth_email_for_phone(text) to service_role';
  end if;
end $$;

notify pgrst, 'reload schema';
