-- Named ticket types on live ɃU events (Regular, VIP, Table, …).
-- Run this in the live ɃU Supabase SQL editor.

alter table public.events
  add column if not exists ticket_types jsonb;

comment on column public.events.ticket_types is
  'JSON array of { key, name, price, quantity_total, quantity_sold }. ticket_price_bu stays the first type for older clients.';
