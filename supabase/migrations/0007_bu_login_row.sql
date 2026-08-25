-- Replace the broken bu_verify_pin (crypt() is not available on this project).
-- Looks up the live users row by phone. PIN is checked in the Next.js app with bcrypt.

drop function if exists public.bu_verify_pin(text, text);

create or replace function public.bu_login_row(p_phone text)
returns table (
  id uuid,
  email text,
  phone_number text,
  pin_hash text,
  first_name text,
  last_name text,
  account_name text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  last10 text;
begin
  if length(digits) >= 10 then
    last10 := right(digits, 10);
  else
    last10 := digits;
  end if;

  return query
  select
    u.id,
    u.email,
    u.phone_number,
    u.pin_hash,
    u.first_name,
    u.last_name,
    u.account_name,
    u.role::text
  from public.users u
  where last10 <> ''
    and right(regexp_replace(coalesce(u.phone_number, ''), '[^0-9]', '', 'g'), 10) = last10
  order by u.created_at desc
  limit 1;
end;
$$;

revoke all on function public.bu_login_row(text) from public;
grant execute on function public.bu_login_row(text) to anon, authenticated;
