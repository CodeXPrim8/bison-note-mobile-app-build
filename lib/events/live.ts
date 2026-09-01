import type { EventRecord, EventStatus, EventVisibility, Payment, TicketRecord, TicketStatus, TicketTier } from '@/lib/types/database'
import { buFromNaira } from '@/lib/bu-rate'
import { createDataClient } from '@/lib/supabase/data'
import { readBuSession } from '@/lib/auth/bu-session'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  liveTierId,
  parseLiveTierId,
  parseLiveTierKey,
  parseStoredTicketTypes,
  needsNamedTicketTypesColumn,
  mergeStoredTicketTypes,
  storedTypesFromTiers,
  ticketTiersFromStored,
  type StoredTicketType,
} from '@/lib/events/ticket-types'
import {
  buildEventFormDetails,
  eventFormDetailsHasValues,
  parseEventFormDetails,
  withFormSidecar,
  type EventFormDetails,
} from '@/lib/events/event-details'

export { liveTierId, parseLiveTierId, parseLiveTierKey } from '@/lib/events/ticket-types'

export const TICKET_TYPES_SQL_HINT =
  'Run supabase/migrations/0012_event_ticket_types.sql in the live ɃU Supabase SQL editor, then try again.'

export const UPDATE_EVENT_SQL_HINT =
  'Run supabase/migrations/0013_bu_update_event.sql in the live ɃU Supabase SQL editor, then try again.'

export const EVENT_DETAILS_SQL_HINT =
  'Run supabase/migrations/0014_event_details.sql in the live ɃU Supabase SQL editor, then try again.'

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
  const extra = parseEventFormDetails(row)
  const venueName =
    extra.venue_name ||
    asString(row.venue_name) ||
    (extra.venue_address ? null : asString(row.location)) ||
    null
  return {
    id,
    organizer_id: (asString(row.organizer_id) || asString(row.celebrant_id) || null) as string | null,
    merchant_id: (asString(row.merchant_id) || asString(row.gateway_id) || null) as string | null,
    title,
    slug: asString(row.slug) || id,
    description: asString(row.description) || null,
    venue_name: venueName,
    venue_address: extra.venue_address || asString(row.venue_address) || null,
    venue_lat: extra.venue_lat ?? (row.venue_lat == null ? null : asNumber(row.venue_lat)),
    venue_lng: extra.venue_lng ?? (row.venue_lng == null ? null : asNumber(row.venue_lng)),
    start_time: start,
    end_time: extra.end_time || (row.end_time ? asIso(row.end_time) : null),
    cover_image_url: asString(row.cover_image_url) || asString(row.image_url) || null,
    status: statusOf(row),
    visibility: visibilityOf(row),
    category: asString(row.category) || null,
    ticket_sales_start: extra.ticket_sales_start || (row.ticket_sales_start ? asIso(row.ticket_sales_start) : null),
    ticket_sales_end: extra.ticket_sales_end || (row.ticket_sales_end ? asIso(row.ticket_sales_end) : null),
    contact_email: extra.contact_email || asString(row.contact_email) || null,
    contact_phone: extra.contact_phone || asString(row.contact_phone) || null,
    organizer_name: extra.organizer_name || asString(row.organizer_name) || asString(row.vendor_name) || null,
    organizer_info: extra.organizer_info || asString(row.organizer_info) || null,
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
  const named = parseStoredTicketTypes(row.ticket_types)
  if (named.length) return ticketTiersFromStored(event.id, named)
  if (Array.isArray(row.ticket_tiers) && row.ticket_tiers.length) return row.ticket_tiers as TicketTier[]
  if (!row.tickets_enabled && row.ticket_price_bu == null && !row.max_tickets) return []
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
      metadata: { key: 'general' },
      created_at: now,
      updated_at: now,
    },
  ]
}

function parseQrMeta(raw: unknown) {
  const obj =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : typeof raw === 'string' && raw
        ? (() => {
            try {
              return JSON.parse(raw) as Record<string, unknown>
            } catch {
              return null
            }
          })()
        : null
  if (!obj) {
    return {
      checkin_code: null,
      qr_token: null,
      pay_ref: null,
      type: null,
      tier_id: null,
      tier_name: null,
      checked_in: false,
      checked_in_at: null,
      guest_comment: null,
    }
  }
  const checkedIn =
    obj.checked_in === true ||
    obj.checked_in === 'true' ||
    obj.checked_in === 1 ||
    Boolean(asString(obj.checked_in_at))
  return {
    checkin_code: asString(obj.checkin_code) || null,
    qr_token: asString(obj.qr_token) || null,
    pay_ref: asString(obj.pay_ref) || asString(obj.reference) || null,
    type: asString(obj.type) || null,
    tier_id: asString(obj.tier_id) || null,
    tier_name: asString(obj.tier_name) || null,
    checked_in: checkedIn,
    checked_in_at: asString(obj.checked_in_at) || null,
    guest_comment: asString(obj.guest_comment) || null,
  }
}

/** Tickets minted by this website after Paystack (`type: bu_ticket` / `BU_LIVE_` pay ref). */
export function isWebsiteIssuedLiveTicket(row: Record<string, unknown>) {
  const meta = parseQrMeta(row.qr_code_data)
  return meta.type === 'bu_ticket' || Boolean(meta.pay_ref?.startsWith('BU_LIVE_'))
}

function qrRawString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return JSON.stringify(value)
  return ''
}

export function mapLiveTicket(row: Record<string, unknown>): TicketRecord {
  const raw = asString(row.status, 'confirmed')
  let status: TicketStatus = 'paid'
  if (raw === 'checked_in' || raw === 'used') status = 'checked_in'
  else if (raw === 'refunded') status = 'refunded'
  else if (raw === 'cancelled') status = 'cancelled'
  else if (raw === 'reserved') status = 'reserved'
  else status = 'paid'

  const eventId = asString(row.event_id)
  const qrRaw = qrRawString(row.qr_code_data)
  const qrMeta = parseQrMeta(row.qr_code_data ?? qrRaw)
  if (qrMeta.checked_in || qrMeta.checked_in_at) status = 'checked_in'
  return {
    id: asString(row.id),
    ticket_number: asString(row.ticket_number) || null,
    event_id: eventId,
    tier_id: asString(row.tier_id) || asString(qrMeta.tier_id) || liveTierId(eventId),
    payment_id: asString(row.payment_id) || asString(row.transfer_id) || qrMeta.pay_ref || null,
    buyer_user_id: asString(row.buyer_user_id) || asString(row.buyer_id) || null,
    buyer_email: asString(row.buyer_email),
    buyer_name: asString(row.buyer_name) || null,
    buyer_phone: asString(row.buyer_phone) || null,
    amount_paid: asNumber(row.amount_paid ?? row.total_price_bu),
    status,
    qr_code_data: qrRaw || null,
    qr_token: asString(row.qr_token) || qrMeta.qr_token || qrRaw || null,
    checkin_code: asString(row.checkin_code) || qrMeta.checkin_code || null,
    checked_in_at: row.checked_in_at ? asIso(row.checked_in_at) : qrMeta.checked_in_at,
    checked_in_by: asString(row.checked_in_by) || null,
    reserved_until: row.reserved_until ? asIso(row.reserved_until) : null,
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at ?? row.created_at),
    guest_comment: qrMeta.guest_comment,
  }
}

export function liveRemaining(tier: Pick<TicketTier, 'quantity_total' | 'quantity_sold'>) {
  return Math.max(0, Number(tier.quantity_total) - Number(tier.quantity_sold))
}

function escapeIlike(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function asTicketRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[]
  if (value && typeof value === 'object') return [value as Record<string, unknown>]
  return []
}

export async function fetchLiveTicketsByPayRef(reference: string, db: SupabaseClient = createDataClient()) {
  const rpc = await db.rpc('bu_tickets_by_pay_ref', { p_ref: reference })
  if (!rpc.error && rpc.data != null) {
    const rows = asTicketRows(rpc.data)
    if (rows.length) return rows.map(mapLiveTicket)
  }

  const byJson = await db.from('tickets').select('*').contains('qr_code_data', { pay_ref: reference })
  if (!byJson.error && byJson.data?.length) {
    return (byJson.data as Record<string, unknown>[]).map(mapLiveTicket)
  }

  const byText = await db.from('tickets').select('*').ilike('qr_code_data', `%${escapeIlike(reference)}%`)
  if (!byText.error && byText.data?.length) {
    return (byText.data as Record<string, unknown>[]).map(mapLiveTicket)
  }

  return []
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
  if (packed.organizer_id !== organizerId) {
    const session = await readBuSession()
    const resolved = await resolveLiveCelebrantId({
      id: organizerId,
      email: session?.email,
      phone: session?.phone_e164 || session?.phone,
    })
    if (!resolved || packed.organizer_id !== resolved) return { forbidden: true as const }
  }
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
  if (!live.error && live.data?.length) {
    return ((live.data as Record<string, unknown>[]) ?? []).map(mapLiveTicket)
  }
  const listed: TicketRecord[] = []
  for (const eventId of eventIds) {
    const rpc = await db.rpc('bu_list_event_tickets', { p_event_id: eventId })
    if (!rpc.error && rpc.data != null) {
      listed.push(...asTicketRows(rpc.data).map(mapLiveTicket))
    }
  }
  return listed
}

export async function fetchLiveTierPrice(tierId: string, db: SupabaseClient = createDataClient()) {
  const eventId = parseLiveTierId(tierId)
  if (!eventId) return null
  const { data, error } = await db.from('events').select('*').eq('id', eventId).maybeSingle()
  if (error || !data) return null
  const packed = withLiveTiers(data as Record<string, unknown>)
  const exact = packed.ticket_tiers.find((tier) => tier.id === tierId)
  if (exact) return exact
  if (parseLiveTierKey(tierId) === 'general' && packed.ticket_tiers.length === 1) {
    return packed.ticket_tiers[0]
  }
  return null
}

export async function bumpLiveTicketTypeSold(
  eventId: string,
  tierId: string,
  qty: number,
  db: SupabaseClient = createDataClient(),
) {
  const key = parseLiveTierKey(tierId)
  const { data } = await db.from('events').select('ticket_types').eq('id', eventId).maybeSingle()
  const row = (data as Record<string, unknown> | null) ?? {}
  const types = parseStoredTicketTypes(row.ticket_types)
  if (!types.length) return
  const next: StoredTicketType[] = types.map((type) =>
    type.key === key ? { ...type, quantity_sold: type.quantity_sold + qty } : type,
  )
  await db.from('events').update({ ticket_types: withFormSidecar(next, parseEventFormDetails(row)) }).eq('id', eventId)
}

function liveCreateError(message: string) {
  if (/celebrant_id_fkey|foreign key constraint/i.test(message)) {
    return 'This signed-in account is not a live ɃU user. Sign out, then sign in with your ɃU ID (phone number) and PIN from the live ɃU app.'
  }
  return message
}

export async function resolveLiveCelebrantId(input: {
  id: string
  email?: string | null
  phone?: string | null
}) {
  const db = createDataClient()
  const byId = await db.from('users').select('id').eq('id', input.id).maybeSingle()
  if (asString(byId.data?.id)) return asString(byId.data?.id)

  const phone = input.phone?.trim()
  if (phone) {
    const found = await lookupLiveUser(phone)
    if (found?.id) return found.id
  }

  const email = input.email?.trim()
  if (email) {
    const byEmail = await db.from('users').select('id').eq('email', email).maybeSingle()
    if (asString(byEmail.data?.id)) return asString(byEmail.data?.id)
  }

  return null
}

function isMissingTicketTypesColumn(message?: string) {
  return /ticket_types/i.test(message ?? '') && /column|schema cache|does not exist/i.test(message ?? '')
}

function isMissingDetailsColumn(message?: string) {
  return /\bdetails\b/i.test(message ?? '') && /column|schema cache|does not exist/i.test(message ?? '')
}

function isMissingRpc(message?: string) {
  return /could not find the function|PGRST202|schema cache/i.test(message ?? '')
}

type EventWriteInput = {
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
  organizer_name?: string | null
  organizer_info?: string | null
  end_time?: string | null
  venue_lat?: number | null
  venue_lng?: number | null
  contact_email?: string | null
  contact_phone?: string | null
  ticket_sales_start?: string | null
  ticket_sales_end?: string | null
}

function detailsFromWriteInput(input: EventWriteInput): EventFormDetails {
  return buildEventFormDetails({
    organizer_name: input.organizer_name,
    organizer_info: input.organizer_info,
    end_time: input.end_time,
    venue_name: input.venue_name,
    venue_address: input.venue_address,
    venue_lat: input.venue_lat,
    venue_lng: input.venue_lng,
    contact_email: input.contact_email,
    contact_phone: input.contact_phone,
    ticket_sales_start: input.ticket_sales_start,
    ticket_sales_end: input.ticket_sales_end,
  })
}

async function persistLiveTicketTypes(
  eventId: string,
  types: StoredTicketType[],
  details: EventFormDetails,
  db: SupabaseClient,
): Promise<{ ok: true } | { ok: false; missingColumn: boolean; error?: string }> {
  const payload: Record<string, unknown> = {
    ticket_types: withFormSidecar(types, details),
    details,
  }
  let updated = await db.from('events').update(payload).eq('id', eventId)
  if (updated.error && isMissingDetailsColumn(updated.error.message)) {
    const { details: _omit, ...withoutDetails } = payload
    updated = await db.from('events').update(withoutDetails).eq('id', eventId)
  }
  if (!updated.error) return { ok: true }
  if (isMissingTicketTypesColumn(updated.error.message)) {
    const detailsOnly = await db.from('events').update({ details }).eq('id', eventId)
    if (!detailsOnly.error) return { ok: true }
    if (isMissingDetailsColumn(detailsOnly.error.message)) {
      return { ok: false, missingColumn: true }
    }
    return { ok: false, missingColumn: false, error: detailsOnly.error.message }
  }
  return { ok: false, missingColumn: false, error: updated.error.message }
}

async function persistEventFormDetails(
  eventId: string,
  celebrantId: string | null,
  types: StoredTicketType[] | undefined,
  details: EventFormDetails,
  db: SupabaseClient,
): Promise<{ ok: true } | { error: string }> {
  if (types?.length) {
    const saved = await persistLiveTicketTypes(eventId, types, details, db)
    if (saved.ok) return { ok: true }
    if (!saved.missingColumn && saved.error) return { error: liveCreateError(saved.error) }
  } else {
    const detailsOnly = await db.from('events').update({ details }).eq('id', eventId)
    if (!detailsOnly.error) return { ok: true }
    if (detailsOnly.error.message && !isMissingDetailsColumn(detailsOnly.error.message)) {
      return { error: liveCreateError(detailsOnly.error.message) }
    }
  }

  if (celebrantId) {
    const rpc = await db.rpc('bu_set_event_details', {
      p_event_id: eventId,
      p_celebrant_id: celebrantId,
      p_details: details,
    })
    if (!rpc.error) return { ok: true }
    if (!isMissingRpc(rpc.error.message) && !isMissingDetailsColumn(rpc.error.message)) {
      return { error: liveCreateError(rpc.error.message) }
    }
  }

  if (eventFormDetailsHasValues(details)) {
    return { error: `Could not keep the extra event fields. ${EVENT_DETAILS_SQL_HINT}` }
  }
  return { ok: true }
}

export async function insertLiveEvent(
  userId: string,
  input: EventWriteInput & { ticket_types?: StoredTicketType[] },
  db: SupabaseClient = createDataClient(),
) {
  const types = input.ticket_types?.length ? input.ticket_types : undefined
  const details = detailsFromWriteInput(input)
  const storedTypes = types?.length ? withFormSidecar(types, details) : undefined
  const payload: Record<string, unknown> = {
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
    details,
  }
  if (storedTypes) payload.ticket_types = storedTypes

  const finish = async (row: Record<string, unknown>) => {
    const id = asString(row.id)
    const extras = await persistEventFormDetails(id, userId, types, details, db)
    if ('error' in extras) return extras
    if (types?.length && !parseStoredTicketTypes(row.ticket_types).length && needsNamedTicketTypesColumn(types)) {
      const saved = await persistLiveTicketTypes(id, types, details, db)
      if (!saved.ok && saved.missingColumn) {
        return { error: `Could not save named ticket types. ${TICKET_TYPES_SQL_HINT}` }
      }
    }
    const reloaded = await db.from('events').select('*').eq('id', id).maybeSingle()
    if (reloaded.data) return { row: reloaded.data as Record<string, unknown> }
    return { row }
  }

  let inserted = await db.from('events').insert(payload).select('*').single()
  if (inserted.error && isMissingDetailsColumn(inserted.error.message)) {
    const { details: _omit, ...withoutDetails } = payload
    inserted = await db.from('events').insert(withoutDetails).select('*').single()
  }
  if (inserted.error && storedTypes && isMissingTicketTypesColumn(inserted.error.message)) {
    if (types && needsNamedTicketTypesColumn(types)) {
      return { error: `Could not save named ticket types. ${TICKET_TYPES_SQL_HINT}` }
    }
    const { ticket_types: _omit, ...withoutTypes } = payload
    inserted = await db.from('events').insert(withoutTypes).select('*').single()
    if (inserted.error && isMissingDetailsColumn(inserted.error.message)) {
      const { details: _omitDetails, ticket_types: _omitTypes, ...core } = payload
      inserted = await db.from('events').insert(core).select('*').single()
    }
  }
  if (!inserted.error && inserted.data) return finish(inserted.data as Record<string, unknown>)

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
    return { error: liveCreateError(inserted.error?.message || rpc.error.message) }
  }
  const created = await db.from('events').select('*').eq('id', rpc.data).maybeSingle()
  if (created.data) return finish(created.data as Record<string, unknown>)
  return { error: 'Event created but could not be loaded' }
}

export async function updateLiveEvent(
  eventId: string,
  celebrantId: string,
  input: EventWriteInput & {
    ticket_types?: Array<{ name: string; price: number; quantity_total: number; key?: string }>
  },
  db: SupabaseClient = createDataClient(),
): Promise<{ row: Record<string, unknown> } | { error: string; code?: 'NOT_FOUND' | 'FORBIDDEN' | 'VALIDATION' }> {
  const existing = await fetchEventRowBySlug(eventId, db)
  if (!existing) return { error: 'Event not found', code: 'NOT_FOUND' }
  const packed = withLiveTiers(existing)
  const owner = asString(existing.celebrant_id) || packed.organizer_id
  if (owner !== celebrantId) return { error: 'Not the organizer', code: 'FORBIDDEN' }

  const previousTypes = parseStoredTicketTypes(existing.ticket_types)
  const existingTypes = previousTypes.length ? previousTypes : storedTypesFromTiers(packed.ticket_tiers)
  const merged = mergeStoredTicketTypes(input.ticket_types ?? [], existingTypes)
  if ('error' in merged) return { error: merged.error, code: 'VALIDATION' }
  const types = merged.types
  const details = detailsFromWriteInput(input)
  const storedTypes = withFormSidecar(types, details)

  const payload: Record<string, unknown> = {
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
    ticket_price_bu: input.ticket_price_bu ?? types[0]?.price ?? 0,
    max_tickets: input.max_tickets ?? types.reduce((sum, type) => sum + type.quantity_total, 0),
    ticket_types: storedTypes,
    details,
  }

  const finish = async (row: Record<string, unknown>) => {
    const extras = await persistEventFormDetails(packed.id, celebrantId, types, details, db)
    if ('error' in extras) return extras
    const reloaded = await db.from('events').select('*').eq('id', packed.id).maybeSingle()
    if (reloaded.data) return { row: reloaded.data as Record<string, unknown> }
    return { row }
  }

  let updated = await db.from('events').update(payload).eq('id', packed.id).select('*').maybeSingle()
  if (updated.error && isMissingDetailsColumn(updated.error.message)) {
    const { details: _omit, ...withoutDetails } = payload
    updated = await db.from('events').update(withoutDetails).eq('id', packed.id).select('*').maybeSingle()
  }
  if (updated.error && isMissingTicketTypesColumn(updated.error.message)) {
    const { ticket_types: _omit, details: _omitDetails, ...withoutTypes } = payload
    updated = await db.from('events').update(withoutTypes).eq('id', packed.id).select('*').maybeSingle()
  }
  if (!updated.error && updated.data) return finish(updated.data as Record<string, unknown>)

  const rpc = await db.rpc('bu_update_event', {
    p_event_id: packed.id,
    p_celebrant_id: celebrantId,
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
    p_ticket_types: storedTypes,
  })
  if (rpc.error) {
    if (isMissingRpc(rpc.error.message)) {
      return { error: `Could not update this event. ${UPDATE_EVENT_SQL_HINT}` }
    }
    return { error: liveCreateError(updated.error?.message || rpc.error.message) }
  }
  const reloaded = await db.from('events').select('*').eq('id', packed.id).maybeSingle()
  if (reloaded.data) return finish(reloaded.data as Record<string, unknown>)
  return { error: 'Event updated but could not be loaded' }
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
  const nairaLedger =
    asNumber(row.balance) ||
    asNumber(row.naira_balance) ||
    asNumber(row.naira_available) ||
    asNumber(row.bu_balance)
  return {
    id: asString(row.id, userId),
    user_id: userId,
    bu_balance: buFromNaira(nairaLedger),
    naira_available: nairaLedger,
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

export async function fetchMyLiveTickets(
  userId: string,
  contact?: { email?: string | null; phone?: string | null },
  options?: { websiteIssuedOnly?: boolean },
) {
  const resolved = await resolveLiveCelebrantId({
    id: userId,
    email: contact?.email,
    phone: contact?.phone,
  })
  const ids = [...new Set([userId, resolved].filter((value): value is string => Boolean(value)))]
  const db = createDataClient()
  const live = await db.from('tickets').select('*').in('buyer_id', ids).order('created_at', { ascending: false })
  const source = !live.error && live.data
    ? (live.data as Record<string, unknown>[])
    : await (async () => {
        const next = await db.from('tickets').select('*').in('buyer_user_id', ids).order('created_at', { ascending: false })
        if (next.error || !next.data) return [] as Record<string, unknown>[]
        return next.data as Record<string, unknown>[]
      })()
  const rows = options?.websiteIssuedOnly ? source.filter(isWebsiteIssuedLiveTicket) : source
  return rows.map(mapLiveTicket)
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

export async function submitLiveTicketFeedback(input: {
  ticketId: string
  guestId: string
  comment: string
}) {
  const db = createDataClient()
  const rpc = await db.rpc('bu_submit_ticket_feedback', {
    p_ticket_id: input.ticketId,
    p_guest_id: input.guestId,
    p_comment: input.comment.trim(),
  })
  if (rpc.error || rpc.data == null) {
    return { error: rpc.error?.message ?? 'Could not save this comment. Run supabase/migrations/0011_bu_checkin_feedback.sql in the live ɃU SQL editor.' }
  }
  const row = asTicketRows(rpc.data)[0] ?? (rpc.data as Record<string, unknown>)
  return { ticket: mapLiveTicket(row) }
}
