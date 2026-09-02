-- Remove the one-time ticket-sale backfill. Those rows all share the SQL run time
-- (e.g. 8:55) and look like new sales. Real Paystack ticket credits (source ticket_sale)
-- are left on the wallet.

do $u$
declare
  c record;
  has_bu boolean;
  has_naira boolean;
  has_balance boolean;
begin
  if to_regclass('public.bu_sale_credits') is null then
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallets' and column_name = 'bu_balance'
  ) into has_bu;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallets' and column_name = 'naira_available'
  ) into has_naira;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallets' and column_name = 'balance'
  ) into has_balance;

  for c in
    select *
    from public.bu_sale_credits
    where coalesce(metadata->>'source', '') = 'backfill'
  loop
    begin
      if c.applied then
        if has_bu then
          update public.wallets
            set bu_balance = greatest(0, coalesce(bu_balance, 0) - c.naira)
            where user_id = c.user_id;
        end if;
        if has_naira then
          update public.wallets
            set naira_available = greatest(0, coalesce(naira_available, 0) - c.naira)
            where user_id = c.user_id;
        end if;
        if has_balance then
          update public.wallets
            set balance = greatest(0, coalesce(balance, 0) - c.naira)
            where user_id = c.user_id;
        end if;
      end if;

      if to_regclass('public.bu_transactions') is not null then
        delete from public.bu_transactions
        where user_id = c.user_id
          and paystack_reference = c.reference;
      end if;

      delete from public.bu_sale_credits where id = c.id;
    exception when others then
      null;
    end;
  end loop;
end
$u$;

notify pgrst, 'reload schema';
