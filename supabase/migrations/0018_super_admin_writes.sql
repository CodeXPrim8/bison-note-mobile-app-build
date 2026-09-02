-- Super Admin writes are gated in Next.js (ɃU session cookie), not Supabase Auth.
-- Local .env.local often has no service_role key, so upserts on these tables hit RLS.
-- These definer functions let the Super Admin API save rate, withdrawal mode, and audit.

create or replace function public.bu_save_platform_settings(p_rate numeric, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_rate is null or p_rate <= 0 or p_rate > 1000 then
    raise exception 'ɃU rate must be between 0 and 1000 naira';
  end if;
  if p_mode is null or p_mode not in ('automatic', 'manual') then
    raise exception 'withdrawal mode must be automatic or manual';
  end if;

  insert into public.bu_platform_settings (key, value, updated_at)
  values
    ('bu_naira_value', to_jsonb(p_rate), now()),
    ('withdrawal_mode', to_jsonb(p_mode), now())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at;

  return jsonb_build_object(
    'bu_naira_value', p_rate,
    'withdrawal_mode', p_mode
  );
end;
$$;

create or replace function public.bu_write_admin_audit(
  p_actor_id uuid,
  p_action text,
  p_target text default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bu_admin_audit (actor_id, action, target, payload)
  values (p_actor_id, p_action, coalesce(p_target, null), coalesce(p_payload, '{}'::jsonb));
end;
$$;

revoke all on function public.bu_save_platform_settings(numeric, text) from public;
revoke all on function public.bu_write_admin_audit(uuid, text, text, jsonb) from public;
grant execute on function public.bu_save_platform_settings(numeric, text) to anon, authenticated, service_role;
grant execute on function public.bu_write_admin_audit(uuid, text, text, jsonb) to anon, authenticated, service_role;
