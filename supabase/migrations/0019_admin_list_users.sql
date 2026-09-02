-- Super Admin user directory. Gated in Next.js; this definer function bypasses
-- users/wallets RLS so the owner can list and search every ɃU account.

create table if not exists public.bu_account_roles (
  user_id uuid primary key,
  is_organizer boolean not null default false,
  is_affiliate boolean not null default false,
  is_super_admin boolean not null default false,
  affiliate_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bu_user_control (
  user_id uuid primary key,
  suspended boolean not null default false,
  organizer_suspended boolean not null default false,
  deleted_at timestamptz,
  note text,
  updated_at timestamptz not null default now()
);

create or replace function public.bu_admin_list_users(
  p_query text default '',
  p_role text default '',
  p_limit integer default 500,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q text := lower(trim(coalesce(p_query, '')));
  digits text := regexp_replace(q, '[^0-9]', '', 'g');
  role_filter text := lower(trim(coalesce(p_role, '')));
  lim integer := greatest(1, least(coalesce(p_limit, 500), 2000));
  off integer := greatest(0, coalesce(p_offset, 0));
  total integer := 0;
  rows jsonb := '[]'::jsonb;
begin
  if role_filter not in ('', 'guest', 'organizer', 'affiliate') then
    role_filter := '';
  end if;

  with directory as (
    select
      u.id,
      u.email,
      coalesce(to_jsonb(u)->>'phone_number', to_jsonb(u)->>'phone') as phone_number,
      u.first_name,
      u.last_name,
      u.account_name,
      coalesce(to_jsonb(u)->>'role', 'guest') as role,
      (to_jsonb(u)->>'created_at')::timestamptz as created_at,
      coalesce(
        (to_jsonb(w)->>'naira_available')::numeric,
        (to_jsonb(w)->>'naira_balance')::numeric,
        (to_jsonb(w)->>'balance')::numeric,
        (to_jsonb(w)->>'bu_balance')::numeric,
        0
      ) as naira,
      coalesce(r.is_organizer, false) as is_organizer,
      coalesce(r.is_affiliate, false) as is_affiliate,
      r.affiliate_code,
      coalesce(c.suspended, false) as suspended,
      coalesce(c.organizer_suspended, false) as organizer_suspended,
      c.deleted_at,
      c.note
    from public.users u
    left join public.wallets w on w.user_id = u.id
    left join public.bu_account_roles r on r.user_id = u.id
    left join public.bu_user_control c on c.user_id = u.id
  ),
  filtered as (
    select *
    from directory d
    where (
      q = ''
      or lower(coalesce(d.first_name, '')) like '%' || q || '%'
      or lower(coalesce(d.last_name, '')) like '%' || q || '%'
      or lower(coalesce(d.account_name, '')) like '%' || q || '%'
      or lower(coalesce(d.email, '')) like '%' || q || '%'
      or lower(d.id::text) like '%' || q || '%'
      or lower(coalesce(d.affiliate_code, '')) like '%' || q || '%'
      or lower(coalesce(d.role, '')) like '%' || q || '%'
      or (digits <> '' and regexp_replace(coalesce(d.phone_number, ''), '[^0-9]', '', 'g') like '%' || digits || '%')
      or (q in ('organiser', 'organizer') and d.is_organizer)
      or (q = 'affiliate' and d.is_affiliate)
      or (q = 'guest' and not d.is_organizer and not d.is_affiliate)
    )
    and (
      role_filter = ''
      or (role_filter = 'organizer' and (d.is_organizer or d.role in ('organizer', 'celebrant')))
      or (role_filter = 'affiliate' and d.is_affiliate)
      or (role_filter = 'guest' and not d.is_organizer and not d.is_affiliate)
    )
  ),
  counted as (
    select count(*)::integer as total from filtered
  ),
  paged as (
    select *
    from filtered
    order by created_at desc nulls last, account_name asc
    limit lim offset off
  )
  select jsonb_build_object(
    'total', (select total from counted),
    'users', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'email', p.email,
            'phone_number', p.phone_number,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'account_name', p.account_name,
            'role', p.role,
            'naira', p.naira,
            'is_organizer', p.is_organizer,
            'is_affiliate', p.is_affiliate,
            'affiliate_code', p.affiliate_code,
            'suspended', p.suspended,
            'organizer_suspended', p.organizer_suspended,
            'deleted_at', p.deleted_at,
            'note', p.note,
            'created_at', p.created_at
          )
          order by p.created_at desc nulls last, p.account_name asc
        )
        from paged p
      ),
      '[]'::jsonb
    )
  )
  into rows;

  return rows;
end;
$$;

create or replace function public.bu_admin_get_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  if p_user_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'phone_number', coalesce(to_jsonb(u)->>'phone_number', to_jsonb(u)->>'phone'),
    'first_name', u.first_name,
    'last_name', u.last_name,
    'account_name', u.account_name,
    'role', coalesce(to_jsonb(u)->>'role', 'guest'),
    'created_at', to_jsonb(u)->>'created_at',
    'naira', coalesce(
      (to_jsonb(w)->>'naira_available')::numeric,
      (to_jsonb(w)->>'naira_balance')::numeric,
      (to_jsonb(w)->>'balance')::numeric,
      (to_jsonb(w)->>'bu_balance')::numeric,
      0
    ),
    'is_organizer', coalesce(r.is_organizer, false),
    'is_affiliate', coalesce(r.is_affiliate, false),
    'affiliate_code', r.affiliate_code,
    'suspended', coalesce(c.suspended, false),
    'organizer_suspended', coalesce(c.organizer_suspended, false),
    'deleted_at', c.deleted_at,
    'note', c.note
  )
  into payload
  from public.users u
  left join public.wallets w on w.user_id = u.id
  left join public.bu_account_roles r on r.user_id = u.id
  left join public.bu_user_control c on c.user_id = u.id
  where u.id = p_user_id;

  return payload;
end;
$$;

revoke all on function public.bu_admin_list_users(text, text, integer, integer) from public;
revoke all on function public.bu_admin_get_user(uuid) from public;
grant execute on function public.bu_admin_list_users(text, text, integer, integer) to anon, authenticated, service_role;
grant execute on function public.bu_admin_get_user(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
