-- Paste this whole file into the live Supabase SQL editor and run once.
-- Registers Daniella (07026056067) for Send ɃU.

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
#variable_conflict use_variable
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_phone text;
  v_existing uuid;
  v_new uuid;
  v_first text := nullif(trim(coalesce(p_first_name, '')), '');
  v_last text := nullif(trim(coalesce(p_last_name, '')), '');
  v_account text;
  v_role text := lower(coalesce(nullif(trim(p_role), ''), 'guest'));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_pin text := nullif(trim(coalesce(p_pin_hash, '')), '');
begin
  if p_id is null then
    raise exception 'p_id required';
  end if;

  if v_digits like '00%' then
    v_digits := substr(v_digits, 3);
  end if;
  if v_digits like '0%' and length(v_digits) = 11 then
    v_digits := '234' || substr(v_digits, 2);
  end if;
  if length(v_digits) = 10 and substr(v_digits, 1, 1) in ('7', '8', '9') then
    v_digits := '234' || v_digits;
  end if;
  v_phone := v_digits;
  if v_phone is null or length(v_phone) < 10 then
    raise exception 'invalid phone';
  end if;

  if v_first is null then
    v_first := 'Bucks';
  end if;
  if v_last is null then
    v_last := 'Member';
  end if;
  v_account := trim(v_first || ' ' || v_last);

  select u.id into v_existing from public.users u where u.id = p_id limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  select u.id into v_existing
  from public.users u
  where right(regexp_replace(coalesce(u.phone_number, ''), '[^0-9]', '', 'g'), 10) = right(v_phone, 10)
  order by u.created_at desc
  limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.users (id, phone_number, first_name, last_name, role)
  select p_id, v_phone, v_first, v_last, src.role
  from public.users src
  where src.role is not null
    and lower(src.role::text) = v_role
  limit 1
  returning id into v_new;

  if v_new is null then
    insert into public.users (id, phone_number, first_name, last_name, role)
    select p_id, v_phone, v_first, v_last, src.role
    from public.users src
    where src.role is not null
    limit 1
    returning id into v_new;
  end if;

  if v_new is null then
    raise exception 'could not insert live user for % (no existing role to copy)', v_phone;
  end if;

  begin
    update public.users u
    set
      email = coalesce(v_email, u.email),
      account_name = coalesce(v_account, u.account_name),
      pin_hash = coalesce(v_pin, u.pin_hash)
    where u.id = v_new;
  exception
    when others then
      null;
  end;

  begin
    insert into public.wallets (user_id, bu_balance, naira_available)
    values (v_new, 0, 0)
    on conflict (user_id) do nothing;
  exception
    when others then
      begin
        insert into public.wallets (user_id, balance)
        values (v_new, 0)
        on conflict (user_id) do nothing;
      exception
        when others then
          null;
      end;
  end;

  return v_new;
end;
$$;

revoke all on function public.bu_ensure_live_user(uuid, text, text, text, text, text, text) from public;
grant execute on function public.bu_ensure_live_user(uuid, text, text, text, text, text, text) to anon, authenticated, service_role;

create or replace function public.bu_backfill_live_user_by_phone(p_phone text)
returns table (user_id uuid, phone_number text, display_name text, created boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
#variable_conflict use_variable
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_last10 text;
  v_auth_id uuid;
  v_meta jsonb;
  v_email text;
  v_name text;
  v_ensured uuid;
begin
  if length(v_digits) >= 10 then
    v_last10 := right(v_digits, 10);
  else
    v_last10 := v_digits;
  end if;
  if v_last10 is null or v_last10 = '' then
    return;
  end if;

  select u.id
  into v_auth_id
  from public.users u
  where right(regexp_replace(coalesce(u.phone_number, ''), '[^0-9]', '', 'g'), 10) = v_last10
  limit 1;
  if v_auth_id is not null then
    user_id := v_auth_id;
    phone_number := p_phone;
    display_name := null;
    created := false;
    return next;
    return;
  end if;

  select au.id, au.email, au.raw_user_meta_data
  into v_auth_id, v_email, v_meta
  from auth.users au
  where right(regexp_replace(coalesce(au.raw_user_meta_data->>'phone_e164', au.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g'), 10) = v_last10
     or right(regexp_replace(coalesce(au.email, ''), '[^0-9]', '', 'g'), 10) = v_last10
     or au.email ilike '%' || v_last10 || '%'
  order by au.created_at desc
  limit 1;

  if v_auth_id is null then
    return;
  end if;

  v_name := coalesce(nullif(trim(v_meta->>'display_name'), ''), 'Bucks Member');
  v_ensured := public.bu_ensure_live_user(
    v_auth_id,
    coalesce(nullif(v_meta->>'phone_e164', ''), nullif(v_meta->>'phone', ''), v_digits),
    split_part(v_name, ' ', 1),
    nullif(trim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), ''),
    v_email,
    null,
    coalesce(nullif(v_meta->>'role', ''), 'guest')
  );

  user_id := v_ensured;
  phone_number := coalesce(nullif(v_meta->>'phone_e164', ''), nullif(v_meta->>'phone', ''), v_digits);
  display_name := v_name;
  created := true;
  return next;
end;
$$;

revoke all on function public.bu_backfill_live_user_by_phone(text) from public;
grant execute on function public.bu_backfill_live_user_by_phone(text) to anon, authenticated, service_role;
