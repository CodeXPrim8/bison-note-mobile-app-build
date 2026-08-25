-- Let phone + PIN sign-in find the auth email without the service role key.
create or replace function public.auth_email_for_phone(p_phone_e164 text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where phone_e164 = p_phone_e164
  limit 1;
$$;

revoke all on function public.auth_email_for_phone(text) from public;
grant execute on function public.auth_email_for_phone(text) to anon, authenticated;
