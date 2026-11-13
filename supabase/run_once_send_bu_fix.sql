-- Register website signups into live public.users so Send ɃU lookup can find them.
-- Works without the Next.js service_role key (security definer).

create or replace function public.bu_ensure_live_user(
  p_id uuid,
  p_phone text,
  p_first_name text default 'Bucks',
  p_last_name text default 'Member',
  p_email text default null,
  p_pin_hash text default null,
  p_role text default 'guest'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  phone text;
  existing_id uuid;
  new_id uuid;
  first_name text := nullif(trim(coalesce(p_first_name, '')), '');
  last_name text := nullif(trim(coalesce(p_last_name, '')), '');
  account_name text;
  role_text text := coalesce(nullif(trim(p_role), ''), 'guest');
begin
  if p_id is null then
    raise exception 'p_id required';
  end if;

  if digits like '00%' then
    digits := substr(digits, 3);
  end if;
  if digits like '0%' and length(digits) = 11 then
    digits := '234' || substr(digits, 2);
  end if;
  if length(digits) = 10 and substr(digits, 1, 1) in ('7', '8', '9') then
    digits := '234' || digits;
  end if;
  phone := digits;
  if phone is null or length(phone) < 10 then
    raise exception 'invalid phone';
  end if;

  if first_name is null then
    first_name := 'Bucks';
  end if;
  if last_name is null then
    last_name := 'Member';
  end if;
  account_name := trim(first_name || ' ' || last_name);

  select u.id into existing_id from public.users u where u.id = p_id limit 1;
  if existing_id is not null then
    return existing_id;
  end if;

  select u.id into existing_id
  from public.users u
  where right(regexp_replace(coalesce(u.phone_number, ''), '[^0-9]', '', 'g'), 10) = right(phone, 10)
  order by u.created_at desc
  limit 1;
  if existing_id is not null then
    return existing_id;
  end if;

  begin
    insert into public.users (
      id,
      phone_number,
      first_name,
      last_name,
      account_name,
      email,
      role,
      pin_hash
    ) values (
      p_id,
      phone,
      first_name,
      last_name,
      account_name,
      nullif(lower(trim(coalesce(p_email, ''))), ''),
      role_text::text,
      coalesce(p_pin_hash, encode(sha256((p_id::text || phone)::bytea), 'hex'))
    )
    returning id into new_id;
  exception
    when undefined_column then
      insert into public.users (id, phone_number, first_name, last_name, email)
      values (
        p_id,
        phone,
        first_name,
        last_name,
        nullif(lower(trim(coalesce(p_email, ''))), '')
      )
      returning id into new_id;
    when others then
      begin
        insert into public.users (
          id,
          phone_number,
          first_name,
          last_name,
          account_name,
          email,
          pin_hash
        ) values (
          p_id,
          phone,
          first_name,
          last_name,
          account_name,
          nullif(lower(trim(coalesce(p_email, ''))), ''),
          coalesce(p_pin_hash, encode(sha256((p_id::text || phone)::bytea), 'hex'))
        )
        returning id into new_id;
      exception
        when unique_violation then
          select u.id into new_id
          from public.users u
          where u.id = p_id
             or right(regexp_replace(coalesce(u.phone_number, ''), '[^0-9]', '', 'g'), 10) = right(phone, 10)
          order by case when u.id = p_id then 0 else 1 end, u.created_at desc
          limit 1;
        when others then
          insert into public.users (id, phone_number, first_name, last_name)
          values (p_id, phone, first_name, last_name)
          returning id into new_id;
      end;
  end;

  begin
    insert into public.wallets (user_id, bu_balance, naira_available)
    values (new_id, 0, 0)
    on conflict (user_id) do nothing;
  exception
    when others then
      begin
        insert into public.wallets (user_id, balance)
        values (new_id, 0)
        on conflict (user_id) do nothing;
      exception
        when others then
          null;
      end;
  end;

  return new_id;
end;
$$;

revoke all on function public.bu_ensure_live_user(uuid, text, text, text, text, text, text) from public;
grant execute on function public.bu_ensure_live_user(uuid, text, text, text, text, text, text) to anon, authenticated, service_role;

-- One-shot backfill for a website auth account that is missing from live users.
create or replace function public.bu_backfill_live_user_by_phone(p_phone text)
returns table (user_id uuid, phone_number text, display_name text, created boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  last10 text;
  auth_id uuid;
  meta jsonb;
  email text;
  name text;
  ensured uuid;
  already boolean := false;
begin
  if length(digits) >= 10 then
    last10 := right(digits, 10);
  else
    last10 := digits;
  end if;
  if last10 is null or last10 = '' then
    return;
  end if;

  select u.id
  into auth_id
  from public.users u
  where right(regexp_replace(coalesce(u.phone_number, ''), '[^0-9]', '', 'g'), 10) = last10
  limit 1;
  if auth_id is not null then
    user_id := auth_id;
    phone_number := p_phone;
    display_name := null;
    created := false;
    return next;
    return;
  end if;

  select au.id, au.email, au.raw_user_meta_data
  into auth_id, email, meta
  from auth.users au
  where right(regexp_replace(coalesce(au.raw_user_meta_data->>'phone_e164', au.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g'), 10) = last10
     or right(regexp_replace(coalesce(au.email, ''), '[^0-9]', '', 'g'), 10) = last10
     or au.email ilike '%' || last10 || '%'
  order by au.created_at desc
  limit 1;

  if auth_id is null then
    return;
  end if;

  name := coalesce(nullif(trim(meta->>'display_name'), ''), 'Bucks Member');
  ensured := public.bu_ensure_live_user(
    auth_id,
    coalesce(nullif(meta->>'phone_e164', ''), nullif(meta->>'phone', ''), digits),
    split_part(name, ' ', 1),
    nullif(trim(substr(name, length(split_part(name, ' ', 1)) + 1)), ''),
    email,
    null,
    coalesce(nullif(meta->>'role', ''), 'guest')
  );

  user_id := ensured;
  phone_number := coalesce(nullif(meta->>'phone_e164', ''), nullif(meta->>'phone', ''), digits);
  display_name := name;
  created := true;
  return next;
end;
$$;

revoke all on function public.bu_backfill_live_user_by_phone(text) from public;
grant execute on function public.bu_backfill_live_user_by_phone(text) to anon, authenticated, service_role;


select * from public.bu_backfill_live_user_by_phone('07026056067');
select id, phone_number, first_name, last_name, email from public.users where right(regexp_replace(coalesce(phone_number,''),'[^0-9]','','g'),10)='7026056067';
