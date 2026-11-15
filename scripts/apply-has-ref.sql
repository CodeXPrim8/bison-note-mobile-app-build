create or replace function public.bu_wallet_has_reference(p_user_id uuid, p_reference text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_reference is null or length(trim(p_reference)) = 0 then
    return false;
  end if;
  if to_regclass('public.bu_wallet_ledger') is not null then
    if exists (
      select 1
      from public.bu_wallet_ledger
      where user_id = p_user_id
        and reference = trim(p_reference)
    ) then
      return true;
    end if;
  end if;
  return false;
end;
$$;

revoke all on function public.bu_wallet_has_reference(uuid, text) from public;
grant execute on function public.bu_wallet_has_reference(uuid, text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
