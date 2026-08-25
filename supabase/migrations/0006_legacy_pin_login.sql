-- Live ɃU accounts are in public.users (phone_number + pin_hash), not public.profiles.
-- This lets phone + PIN sign-in work without the service_role key.
-- Run in the Supabase SQL editor.

create extension if not exists pgcrypto;

create or replace function public.bu_verify_pin(p_phone text, p_pin text)
returns table (
  id uuid,
  email text,
  phone_number text,
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
  local_part text;
begin
  if length(digits) = 13 and digits like '234%' then
    local_part := substring(digits from 4);
  elsif length(digits) = 11 and digits like '0%' then
    local_part := substring(digits from 2);
  elsif length(digits) = 10 then
    local_part := digits;
  else
    local_part := digits;
  end if;

  return query
  select
    u.id,
    u.email,
    u.phone_number,
    u.first_name,
    u.last_name,
    u.account_name,
    u.role::text
  from public.users u
  where (
    u.phone_number = p_phone
    or regexp_replace(coalesce(u.phone_number, ''), '[^0-9]', '', 'g') in (
      digits,
      local_part,
      '0' || local_part,
      '234' || local_part
    )
  )
  and u.pin_hash is not null
  and (
    u.pin_hash = crypt(p_pin, u.pin_hash)
    or (
      left(u.pin_hash, 4) = '$2b$'
      and crypt(p_pin, replace(u.pin_hash, '$2b$', '$2a$')) = replace(u.pin_hash, '$2b$', '$2a$')
    )
    or u.pin_hash = p_pin
  )
  limit 1;
end;
$$;

revoke all on function public.bu_verify_pin(text, text) from public;
grant execute on function public.bu_verify_pin(text, text) to anon, authenticated;
