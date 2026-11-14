-- Full wallet history for live users (transfers, sales, top-ups, withdrawals).
-- Run in the live ɃU Supabase SQL editor. Safe to re-run.

create table if not exists public.bu_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  direction text not null,
  type text not null,
  naira numeric not null,
  description text,
  reference text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, reference)
);

create index if not exists bu_wallet_ledger_user_idx
  on public.bu_wallet_ledger (user_id, created_at desc);

alter table public.bu_wallet_ledger enable row level security;

create or replace function public.bu_list_user_wallet_history(p_user_id uuid, p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lim integer := greatest(1, least(coalesce(p_limit, 200), 500));
  rows jsonb := '[]'::jsonb;
begin
  if p_user_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(entry order by (entry->>'created_at') desc),
    '[]'::jsonb
  )
  into rows
  from (
    select entry
    from (
      select jsonb_build_object(
        'id', l.id,
        'source', 'ledger',
        'kind', case when l.direction = 'debit' then 'wallet_debit' else 'wallet_credit' end,
        'type', l.type,
        'amount', l.naira,
        'naira', l.naira,
        'description', coalesce(l.description, l.type),
        'created_at', l.created_at,
        'reference', l.reference,
        'metadata', coalesce(l.metadata, '{}'::jsonb),
        'direction', l.direction,
        'status', 'completed',
        'counterparty', case
          when l.direction = 'debit' then nullif(coalesce(l.metadata->>'to_name', ''), '')
          else nullif(coalesce(l.metadata->>'from_name', ''), '')
        end,
        'counterparty_user_id', case
          when l.direction = 'debit' then nullif(coalesce(l.metadata->>'to', ''), '')
          else nullif(coalesce(l.metadata->>'from', ''), '')
        end
      ) as entry,
      l.created_at as sort_at
      from public.bu_wallet_ledger l
      where to_regclass('public.bu_wallet_ledger') is not null
        and l.user_id = p_user_id
      union all
      select jsonb_build_object(
        'id', c.id,
        'source', 'sale',
        'kind', c.kind,
        'type', case
          when c.kind = 'wallet_debit' then 'spray'
          when c.kind = 'wallet_credit' then 'spray_credit'
          else 'deposit'
        end,
        'amount', c.naira,
        'naira', c.naira,
        'description', case
          when c.kind = 'affiliate_commission' then 'Affiliate commission'
          when c.kind = 'wallet_debit' then coalesce(
            nullif(c.metadata->>'description', ''),
            case
              when coalesce(c.metadata->>'to_name', '') <> '' then 'BU transfer to ' || (c.metadata->>'to_name')
              else 'BU transfer'
            end
          )
          when c.kind = 'wallet_credit' then coalesce(
            nullif(c.metadata->>'description', ''),
            case
              when coalesce(c.metadata->>'from_name', '') <> '' then 'BU received from ' || (c.metadata->>'from_name')
              else 'BU received'
            end
          )
          else 'Ticket sale'
        end,
        'counterparty', case
          when c.kind = 'wallet_debit' then nullif(c.metadata->>'to_name', '')
          when c.kind = 'wallet_credit' then nullif(c.metadata->>'from_name', '')
          else null
        end,
        'counterparty_user_id', case
          when c.kind = 'wallet_debit' then nullif(c.metadata->>'to', '')
          when c.kind = 'wallet_credit' then nullif(c.metadata->>'from', '')
          else null
        end,
        'created_at', c.created_at,
        'reference', c.reference,
        'metadata', coalesce(c.metadata, '{}'::jsonb),
        'direction', case
          when c.kind = 'wallet_debit' then 'debit'
          else 'credit'
        end,
        'status', 'completed'
      ) as entry,
      c.created_at as sort_at
      from public.bu_sale_credits c
      where to_regclass('public.bu_sale_credits') is not null
        and c.user_id = p_user_id
      union all
      select jsonb_build_object(
        'id', t.id,
        'source', 'tx',
        'kind', t.type::text,
        'type', t.type::text,
        'amount', t.amount,
        'naira', t.amount,
        'description', coalesce(t.description, t.type::text),
        'created_at', t.created_at,
        'reference', coalesce(t.paystack_reference, t.id::text),
        'metadata', coalesce(t.metadata, '{}'::jsonb),
        'direction', case
          when coalesce(t.metadata->>'direction', '') in ('credit', 'debit') then t.metadata->>'direction'
          when t.type::text in ('spray', 'withdrawal', 'purchase', 'ticket_purchase') then 'debit'
          else 'credit'
        end,
        'status', coalesce(t.status, 'completed'),
        'counterparty', case
          when coalesce(t.metadata->>'direction', '') = 'debit'
            or t.type::text in ('spray', 'withdrawal', 'purchase', 'ticket_purchase')
            then nullif(coalesce(t.metadata->>'to_name', ''), '')
          else nullif(coalesce(t.metadata->>'from_name', ''), '')
        end,
        'counterparty_user_id', case
          when coalesce(t.metadata->>'direction', '') = 'debit'
            or t.type::text in ('spray', 'withdrawal', 'purchase', 'ticket_purchase')
            then nullif(coalesce(t.metadata->>'to', ''), '')
          else nullif(coalesce(t.metadata->>'from', ''), '')
        end
      ) as entry,
      t.created_at as sort_at
      from public.bu_transactions t
      where to_regclass('public.bu_transactions') is not null
        and t.user_id = p_user_id
      union all
      select jsonb_build_object(
        'id', w.id,
        'source', 'withdrawal',
        'kind', 'withdrawal',
        'type', 'withdrawal',
        'amount', w.naira,
        'naira', w.naira,
        'description', 'Withdrawal to ' || coalesce(w.bank_name, 'bank'),
        'created_at', coalesce(w.reviewed_at, w.created_at),
        'reference', coalesce(w.paystack_reference, w.id::text),
        'metadata', jsonb_build_object('bank_name', w.bank_name, 'status', w.status),
        'direction', 'debit',
        'status', w.status
      ) as entry,
      coalesce(w.reviewed_at, w.created_at) as sort_at
      from public.bu_withdrawals w
      where to_regclass('public.bu_withdrawals') is not null
        and w.user_id = p_user_id
    ) combined
    order by sort_at desc
    limit lim
  ) limited;

  return coalesce(rows, '[]'::jsonb);
end;
$$;

revoke all on function public.bu_list_user_wallet_history(uuid, integer) from public;
grant execute on function public.bu_list_user_wallet_history(uuid, integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
