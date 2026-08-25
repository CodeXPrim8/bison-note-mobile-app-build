import type { EventRecord, EventStatus, EventVisibility, Payment, TicketRecord, TicketStatus, TicketTier } from '@/lib/types/database'
import { createDataClient } from '@/lib/supabase/data'
import type { SupabaseClient } from '@supabase/supabase-js'

export function liveTierId(eventId: string) {
  return `${eventId}:general`
}

export function parseLiveTierId(tierId: string): string | null {
  if (!tierId.endsWith(':general')) return null
  return tierId.slice(0, -':general'.length)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asIso(value: unknown): string {
  if (typeof value === 'string' && value) {
    const time = new Date(value).getTime()
    if (Number.isFinite(time)) return new Date(time).toISOString()
    return value
  }
  return new Date().toISOString()
}

function visibilityOf(row: Record<string, unknown>): EventVisibility {
  if (row.visibility === 'PUBLIC' || row.visibility === 'PRIVATE') return row.visibility
  if (row.strictly_by_invitation === true) return 'PRIVATE'
  if (row.is_public === false) return 'PRIVATE'
  return 'PUBLIC'
}

function statusOf(row: Record<string, unknown>): EventStatus {
  if (row.status === 'draft' || row.status === 'published' || row.status === 'cancelled' || row.status === 'ended') {
    return row.status
  }
  return 'published'
}

export function mapLiveEvent(row: Record<string, unknown>): EventRecord {
  const id = asString(row.id)
  const title = asString(row.title) || asString(row.name, 'Event')
  const start = asIso(row.start_time ?? row.date)
  const location = asString(row.venue_name) || asString(row.location) || null
  return {
    id,
    organizer_id: (asString(row.organizer_id) || asString(row.celebrant_id) || null) as string | null,
    merchant_id: (asString(row.merchant_id) || asString(row.gateway_id) || null) as string | null,
    title,
    slug: asString(row.slug) || id,
    description: asString(row.description) || null,
    venue_name: location,
    venue_address: asString(row.venue_address) || asString(row.location) || null,
    venue_lat: row.venue_lat == null ? null : asNumber(row.venue_lat),
    venue_lng: row.venue_lng == null ? null : asNumber(row.venue_lng),
    start_time: start,
    end_time: row.end_time ? asIso(row.end_time) : null,
    cover_image_url: asString(row.cover_image_url) || asString(row.image_url) || null,
    status: statusOf(row),
    visibility: visibilityOf(row),
    category: asString(row.category) || null,
    ticket_sales_start: row.ticket_sales_start ? asIso(row.ticket_sales_start) : null,
    ticket_sales_end: row.ticket_sales_end ? asIso(row.ticket_sales_end) : null,
    contact_email: asString(row.contact_email) || null,
    contact_phone: asString(row.contact_phone) || null,
    organizer_name: asString(row.organizer_name) || asString(row.vendor_name) || null,
    organizer_info: asString(row.organizer_info) || null,
    is_gateway_event: Boolean(row.is_gateway_event || row.gateway_id),
    paystack_subaccount_code: asString(row.paystack_subaccount_code) || null,
    commission_rate: asNumber(row.commission_rate),
    spray_budget_bu: asNumber(row.spray_budget_bu ?? row.total_bu_received),
    celebrant_name: asString(row.celebrant_name) || null,
    celebrant_wallet_id: asString(row.celebrant_wallet_id) || null,
    capacity: row.capacity == null && row.max_guests == null ? null : asNumber(row.capacity ?? row.max_guests),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at ?? row.created_at),
  }
}

export function liveEventTiers(row: Record<string, unknown>, event: EventRecord): TicketTier[] {
  if (!row.tickets_enabled && row.ticket_price_bu == null && !row.max_tickets) {
    if (Array.isArray(row.ticket_tiers)) return row.ticket_tiers as TicketTier[]
    return []
  }
  const now = new Date().toISOString()
  return [
    {
      id: liveTierId(event.id),
      event_id: event.id,
      name: 'General',
      price: asNumber(row.ticket_price_bu),
      currency: 'NGN',
      quantity_total: asNumber(row.max_tickets, asNumber(row.max_guests, 0)),
      quantity_sold: asNumber(row.tickets_sold),
      sales_start: null,
      sales_end: null,
      is_active: row.tickets_enabled !== false,
      description: null,
      benefits: null,
      max_per_buyer: 6,
      metadata: {},
      created_at: now,
      updated_at: now,
    },
  ]
}

function mapLiveTicket(row: Record<string, unknown>): TicketRecord {
  const raw = asString(row.status, 'confirmed')
  let status: TicketStatus = 'paid'
  if (raw === 'checked_in' || raw === 'used') status = 'checked_in'
  else if (raw === 'refunded') status = 'refunded'
  else if (raw === 'cancelled') status = 'cancelled'
  else if (raw === 'reserved') status = 'reserved'
  else status = 'paid'

  const eventId = asString(row.event_id)
  return {
    id: asString(row.id),
    ticket_number: asString(row.ticket_number) || null,
    event_id: eventId,
    tier_id: asString(row.tier_id) || liveTierId(eventId),
    payment_id: asString(row.payment_id) || asString(row.transfer_id) || null,
    buyer_user_id: asString(row.buyer_user_id) || asString(row.buyer_id) || null,
    buyer_email: asString(row.buyer_email),
    buyer_name: asString(row.buyer_name) || null,
    buyer_phone: asString(row.buyer_phone) || null,
    amount_paid: asNumber(row.amount_paid ?? row.total_price_bu),
    status,
    qr_code_data: asString(row.qr_code_data) || null,
    qr_token: asString(row.qr_token) || asString(row.qr_code_data) || null,
    checkin_code: asString(row.checkin_code) || null,
    checked_in_at: row.checked_in_at ? asIso(row.checked_in_at) : null,
    checked_in_by: asString(row.checked_in_by) || null,
    reserved_until: row.reserved_until ? asIso(row.reserved_until) : null,
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at ?? row.created_at),
  }
}

export function ticketsAsPayments(tickets: TicketRecord[]): Payment[] {
  return tickets.map((ticket) => ({
    id: ticket.id,
    reference: ticket.id,
    paystack_reference: null,
    user_id: ticket.buyer_user_id,
    merchant_id: null,
    event_id: ticket.event_id,
    kind: 'ticket',
    amount: ticket.amount_paid,
    currency: 'NGN',
    status: ticket.status === 'refunded' ? 'failed' : 'success',
    buyer_email: ticket.buyer_email || '—',
    buyer_name: ticket.buyer_name,
    buyer_phone: ticket.buyer_phone,
    callback_url: null,
    authorization_url: null,
    metadata: { event_id: ticket.event_id, quantity: 1 },
    fulfilled_at: ticket.created_at,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
  }))
}

function isMissingColumn(error: { message?: string; code?: string } | null) {
  const message = error?.message ?? ''
  return /column|could not find|schema cache|PGRST/i.test(message)
}

export async function fetchOrganizerEventRows(userId: string, db: SupabaseClient = createDataClient()) {
  const live = await db.from('events').select('*').eq('celebrant_id', userId).order('date', { ascending: false })
  if (!live.error) return (live.data as Record<string, unknown>[] | null) ?? []
  const next = await db.from('events').select('*').eq('organizer_id', userId).order('created_at', { ascending: false })
  if (next.error && isMissingColumn(live.error)) return []
  if (next.error) return []
  return (next.data as Record<string, unknown>[] | null) ?? []
}

export async function fetchPublicEventRows(db: SupabaseClient = createDataClient()) {
  const live = await db.from('events').select('*').eq('is_public', true).order('date', { ascending: true })
  if (!live.error) return (live.data as Record<string, unknown>[] | null) ?? []
  const next = await db
    .from('events')
    .select('*')
    .eq('status', 'published')
    .eq('visibility', 'PUBLIC')
    .order('start_time', { ascending: true })
  if (next.error) return []
  return (next.data as Record<string, unknown>[] | null) ?? []
}

export async function fetchEventRowBySlug(slug: string, db: SupabaseClient = createDataClient()) {
  const byId = await db.from('events').select('*').eq('id', slug).maybeSingle()
  if (!byId.error && byId.data) return byId.data as Record<string, unknown>
  const bySlug = await db.from('events').select('*').eq('slug', slug).maybeSingle()
  if (!bySlug.error && bySlug.data) return bySlug.data as Record<string, unknown>
  return null
}

function mapInviteRow(row: Record<string, unknown>) {
  return {
    id: asString(row.id),
    event_id: asString(row.event_id),
    invited_user_id: asString(row.guest_id) || asString(row.invited_user_id) || null,
    invited_bu_id: asString(row.guest_phone) || asString(row.invited_bu_id) || '',
    invited_phone: asString(row.guest_phone) || asString(row.invited_phone) || null,
    invited_by: asString(row.celebrant_id) || asString(row.invited_by) || null,
    gate: asString(row.gate) || null,
    seat: asString(row.seat) || null,
    status: asString(row.status, 'pending'),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at ?? row.created_at),
  }
}

export async function fetchLiveEventInvites(eventId: string, db: SupabaseClient = createDataClient()) {
  const live = await db.from('invites').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
  if (!live.error) return ((live.data as Record<string, unknown>[]) ?? []).map(mapInviteRow)
  const next = await db
    .from('event_invitations')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (next.error) return []
  return ((next.data as Record<string, unknown>[]) ?? []).map(mapInviteRow)
}

export async function fetchLiveEventDashboard(eventId: string, organizerId: string) {
  const db = createDataClient()
  const row = await fetchEventRowBySlug(eventId, db)
  if (!row) return null
  const packed = withLiveTiers(row)
  if (packed.organizer_id !== organizerId) return { forbidden: true as const }
  const tickets = await fetchTicketsForEvents([packed.id], db)
  const invitations = await fetchLiveEventInvites(packed.id, db)
  const paid = tickets.filter((ticket) => ticket.status === 'paid' || ticket.status === 'checked_in')
  return {
    event: packed,
    ticket_tiers: packed.ticket_tiers,
    tickets,
    invitations,
    payments: ticketsAsPayments(tickets),
    stats: {
      tickets_sold: paid.length,
      revenue: paid.reduce((sum, ticket) => sum + Number(ticket.amount_paid), 0),
      guests: paid.length,
      checked_in: tickets.filter((ticket) => ticket.status === 'checked_in').length,
      invited: invitations.length,
      accepted: invitations.filter((invite) => invite.status === 'accepted' || invite.status === 'ticket_purchased').length,
      pending: invitations.filter((invite) => invite.status === 'pending' || invite.status === 'viewed').length,
    },
  }
}

export function withLiveTiers(row: Record<string, unknown>) {
  const event = mapLiveEvent(row)
  const ticket_tiers = liveEventTiers(row, event)
  const prices = ticket_tiers.map((tier) => Number(tier.price))
  const available = ticket_tiers.reduce((sum, tier) => sum + (tier.quantity_total - tier.quantity_sold), 0)
  return {
    ...event,
    ticket_tiers,
    starting_price: prices.length ? Math.min(...prices) : 0,
    tickets_available: available,
    sold_out: available <= 0,
  }
}

export async function fetchTicketsForEvents(eventIds: string[], db: SupabaseClient = createDataClient()) {
  if (!eventIds.length) return [] as TicketRecord[]
  const live = await db.from('tickets').select('*').in('event_id', eventIds)
  if (live.error) return []
  return ((live.data as Record<string, unknown>[]) ?? []).map(mapLiveTicket)
}

export async function fetchLiveTierPrice(tierId: string, db: SupabaseClient = createDataClient()) {
  const eventId = parseLiveTierId(tierId)
  if (!eventId) return null
  const { data, error } = await db.from('events').select('*').eq('id', eventId).maybeSingle()
  if (error || !data) return null
  const packed = withLiveTiers(data as Record<string, unknown>)
  return packed.ticket_tiers[0] ?? null
}

export async function insertLiveEvent(
  userId: string,
  input: {
    title: string
    start_time: string
    venue_name?: string | null
    venue_address?: string | null
    description?: string | null
    cover_image_url?: string | null
    visibility?: EventVisibility
    category?: string | null
    capacity?: number | null
    ticket_price_bu?: number
    max_tickets?: number
  },
  db: SupabaseClient = createDataClient(),
) {
  const payload = {
    celebrant_id: userId,
    name: input.title,
    date: input.start_time,
    location: input.venue_name || input.venue_address || null,
    description: input.description ?? null,
    image_url: input.cover_image_url ?? null,
    is_public: input.visibility !== 'PRIVATE',
    strictly_by_invitation: input.visibility === 'PRIVATE',
    category: input.category ?? null,
    max_guests: input.capacity ?? null,
    tickets_enabled: true,
    ticket_price_bu: input.ticket_price_bu ?? 0,
    max_tickets: input.max_tickets ?? input.capacity ?? 0,
    tickets_sold: 0,
  }

  const inserted = await db.from('events').insert(payload).select('*').single()
  if (!inserted.error && inserted.data) return { row: inserted.data as Record<string, unknown> }

  const rpc = await db.rpc('bu_create_event', {
    p_celebrant_id: userId,
    p_name: input.title,
    p_date: input.start_time,
    p_location: payload.location,
    p_description: payload.description,
    p_image_url: payload.image_url,
    p_is_public: payload.is_public,
    p_invite_only: payload.strictly_by_invitation,
    p_category: payload.category,
    p_max_guests: payload.max_guests,
    p_ticket_price_bu: payload.ticket_price_bu,
    p_max_tickets: payload.max_tickets,
  })
  if (rpc.error) {
    return { error: inserted.error?.message || rpc.error.message }
  }
  const created = await db.from('events').select('*').eq('id', rpc.data).maybeSingle()
  if (created.data) return { row: created.data as Record<string, unknown> }
  return { error: 'Event created but could not be loaded' }
}

export async function fetchLiveWallet(userId: string) {
  const db = createDataClient()
  const { data, error } = await db.from('wallets').select('*').eq('user_id', userId).maybeSingle()
  if (error || !data) {
    return {
      id: userId,
      user_id: userId,
      bu_balance: 0,
      naira_available: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }
  const row = data as Record<string, unknown>
  return {
    id: asString(row.id, userId),
    user_id: userId,
    bu_balance: asNumber(row.balance ?? row.bu_balance),
    naira_available: asNumber(row.naira_balance ?? row.naira_available),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at ?? row.created_at),
  }
}

export async function fetchLiveInvites(userId: string, phone?: string | null) {
  const db = createDataClient()
  const live = await db.from('invites').select('*').eq('guest_id', userId).order('created_at', { ascending: false })
  let rows: Record<string, unknown>[] = !live.error ? ((live.data as Record<string, unknown>[]) ?? []) : []
  if (!rows.length && phone) {
    const byPhone = await db.from('invites').select('*').eq('guest_phone', phone).order('created_at', { ascending: false })
    if (!byPhone.error) rows = (byPhone.data as Record<string, unknown>[]) ?? []
  }
  if (live.error && !rows.length) {
    const next = await db.from('event_invitations').select('*').eq('invited_user_id', userId).order('created_at', { ascending: false })
    if (!next.error) rows = (next.data as Record<string, unknown>[]) ?? []
  }

  const eventIds = [...new Set(rows.map((row) => asString(row.event_id)).filter(Boolean))]
  const events = eventIds.length ? await db.from('events').select('*').in('id', eventIds) : { data: [] }
  const eventMap = new Map(
    ((events.data as Record<string, unknown>[] | null) ?? []).map((row) => [asString(row.id), mapLiveEvent(row)]),
  )

  return rows.map((row) => {
    const eventId = asString(row.event_id)
    return {
      id: asString(row.id),
      event_id: eventId,
      invited_user_id: asString(row.guest_id) || asString(row.invited_user_id) || null,
      invited_bu_id: asString(row.guest_phone) || asString(row.invited_bu_id) || '',
      invited_phone: asString(row.guest_phone) || asString(row.invited_phone) || null,
      invited_by: asString(row.celebrant_id) || asString(row.invited_by) || null,
      gate: asString(row.gate) || null,
      seat: asString(row.seat) || null,
      status: asString(row.status, 'pending'),
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at ?? row.created_at),
      event: eventMap.get(eventId) ?? null,
    }
  })
}

export async function fetchMyLiveTickets(userId: string) {
  const db = createDataClient()
  const { data, error } = await db.from('tickets').select('*').eq('buyer_id', userId).order('created_at', { ascending: false })
  if (error || !data) {
    const next = await db.from('tickets').select('*').eq('buyer_user_id', userId).order('created_at', { ascending: false })
    if (next.error || !next.data) return []
    return (next.data as Record<string, unknown>[]).map(mapLiveTicket)
  }
  return (data as Record<string, unknown>[]).map(mapLiveTicket)
}

export async function lookupLiveUser(phone: string) {
  const db = createDataClient()
  const { data, error } = await db.rpc('bu_login_row', { p_phone: phone })
  if (error) return null
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  if (!row?.id) return null
  const display =
    [asString(row.first_name), asString(row.last_name)].filter(Boolean).join(' ').trim() ||
    asString(row.account_name) ||
    asString(row.email) ||
    'ɃU member'
  return {
    id: asString(row.id),
    display_name: display,
    phone: asString(row.phone_number) || null,
    email: asString(row.email) || null,
  }
}
