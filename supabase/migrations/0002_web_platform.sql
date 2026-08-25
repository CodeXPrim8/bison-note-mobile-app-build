-- Web event platform: visibility, ɃU ID invites, extra event/ticket fields.
-- Apply after 0001_ticketing.sql

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.event_visibility as enum ('PUBLIC', 'PRIVATE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invitation_status as enum (
    'pending', 'viewed', 'accepted', 'declined', 'ticket_purchased'
  );
exception when duplicate_object then null; end $$;

alter type public.user_role add value if not exists 'organizer';

-- ---------------------------------------------------------------------------
-- Profiles: ɃU ID is the normalised phone number
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists phone_e164 text,
  add column if not exists email text;

create unique index if not exists profiles_phone_e164_uidx
  on public.profiles (phone_e164)
  where phone_e164 is not null;

-- ---------------------------------------------------------------------------
-- Events: organiser website fields + PUBLIC/PRIVATE
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists visibility public.event_visibility not null default 'PUBLIC',
  add column if not exists category text,
  add column if not exists venue_address text,
  add column if not exists ticket_sales_start timestamptz,
  add column if not exists ticket_sales_end timestamptz,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists organizer_name text,
  add column if not exists organizer_info text;

create index if not exists events_public_upcoming_idx
  on public.events (start_time)
  where status = 'published' and visibility = 'PUBLIC';

update public.events
set visibility = 'PUBLIC'
where visibility is null;

-- ---------------------------------------------------------------------------
-- Ticket tiers: perks, max per buyer, sold-out helper
-- ---------------------------------------------------------------------------
alter table public.ticket_tiers
  add column if not exists description text,
  add column if not exists benefits text,
  add column if not exists max_per_buyer integer default 10;

-- ---------------------------------------------------------------------------
-- Tickets: human ticket number
-- ---------------------------------------------------------------------------
alter table public.tickets
  add column if not exists ticket_number text,
  add column if not exists qr_token text;

create unique index if not exists tickets_ticket_number_uidx
  on public.tickets (ticket_number)
  where ticket_number is not null;

create unique index if not exists tickets_qr_token_uidx
  on public.tickets (qr_token)
  where qr_token is not null;

-- ---------------------------------------------------------------------------
-- Event invitations (private events, ɃU ID = phone)
-- ---------------------------------------------------------------------------
create table if not exists public.event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  invited_user_id uuid references public.profiles (id) on delete set null,
  invited_bu_id text not null,
  invited_phone text,
  invited_by uuid references public.profiles (id) on delete set null,
  gate text,
  seat text,
  status public.invitation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, invited_bu_id)
);

create index if not exists event_invitations_user_idx
  on public.event_invitations (invited_user_id, status);
create index if not exists event_invitations_event_idx
  on public.event_invitations (event_id);

do $$ begin
  create trigger event_invitations_updated_at before update on public.event_invitations
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Check-in audit log (offline-ready: signed snapshot + later sync)
-- ---------------------------------------------------------------------------
create table if not exists public.event_check_ins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  operator_id uuid references public.profiles (id) on delete set null,
  source text not null default 'online',
  checked_in_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (ticket_id)
);

create index if not exists event_check_ins_event_idx on public.event_check_ins (event_id);

-- ---------------------------------------------------------------------------
-- Gateway API audit
-- ---------------------------------------------------------------------------
create table if not exists public.api_audit_logs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references public.gateway_merchants (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  method text not null,
  path text not null,
  status_code integer,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists api_audit_logs_merchant_idx
  on public.api_audit_logs (merchant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS updates: private events are not publicly listed
-- ---------------------------------------------------------------------------
alter table public.event_invitations enable row level security;
alter table public.event_check_ins enable row level security;
alter table public.api_audit_logs enable row level security;

drop policy if exists "events_select_published" on public.events;
create policy "events_select_published" on public.events
  for select using (
    organizer_id = auth.uid()
    or (
      status = 'published'
      and visibility = 'PUBLIC'
    )
    or exists (
      select 1 from public.event_invitations i
      where i.event_id = events.id
        and i.invited_user_id = auth.uid()
        and i.status <> 'declined'
    )
  );

drop policy if exists "tiers_select_public" on public.ticket_tiers;
create policy "tiers_select_public" on public.ticket_tiers
  for select using (
    exists (
      select 1 from public.events e
      where e.id = ticket_tiers.event_id
        and (
          e.organizer_id = auth.uid()
          or (e.status = 'published' and e.visibility = 'PUBLIC')
          or exists (
            select 1 from public.event_invitations i
            where i.event_id = e.id
              and i.invited_user_id = auth.uid()
              and i.status <> 'declined'
          )
        )
    )
  );

drop policy if exists "invites_select_involved" on public.event_invitations;
create policy "invites_select_involved" on public.event_invitations
  for select using (
    invited_user_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = event_invitations.event_id and e.organizer_id = auth.uid()
    )
  );

drop policy if exists "invites_update_own" on public.event_invitations;
create policy "invites_update_own" on public.event_invitations
  for update using (invited_user_id = auth.uid());

drop policy if exists "checkins_select_organizer" on public.event_check_ins;
create policy "checkins_select_organizer" on public.event_check_ins
  for select using (
    exists (
      select 1 from public.events e
      where e.id = event_check_ins.event_id and e.organizer_id = auth.uid()
    )
  );

-- Signup: persist normalised ɃU ID
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role, phone, phone_e164, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'BU Guest'),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'guest'),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'phone_e164',
    new.email
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  -- Attach any pending invitations that used this ɃU ID before signup.
  if new.raw_user_meta_data->>'phone_e164' is not null then
    update public.event_invitations
    set invited_user_id = new.id
    where invited_bu_id = new.raw_user_meta_data->>'phone_e164'
      and invited_user_id is null;
  end if;

  return new;
end;
$$;
