import { randomUUID } from 'crypto'
import { ApiError } from '@/lib/api/errors'
import { getAppUrl, isPaystackConfigured } from '@/lib/env'
import { quoteTicketTotal } from '@/lib/money'
import { phoneLookupVariants } from '@/lib/phone'
import {
  fetchEventRowBySlug,
  fetchLiveEventInvites,
  fetchLiveTicketsByPayRef,
  fetchLiveTierPrice,
  fetchMyLiveTickets,
  liveRemaining,
  mapLiveTicket,
  parseLiveTierId,
  bumpLiveTicketTypeSold,
  resolveLiveCelebrantId,
  withLiveTiers,
} from '@/lib/events/live'
import { sendTicketEmail } from '@/lib/email/tickets'
import { creditTicketSaleShares } from '@/lib/sales/credits'
import {
  initializeTransaction,
  nairaToKobo,
  verifyTransaction,
} from '@/lib/payments/paystack'
import { createDataClient } from '@/lib/supabase/data'
import { generateCheckinCode, generateReference } from '@/lib/tickets/ids'
import { extractLivePayRef, parseTicketQr, ticketQrPayload } from '@/lib/tickets/qr-generator'
import { isEventUpcoming } from '@/lib/events/sale'
import type { CheckinResult, EventRecord, Payment, TicketRecord } from '@/lib/types/database'

interface LiveInitializeInput {
  email: string
  amount?: number
  ticket_tier_id: string
  quantity: number
  callback_url?: string
  spray_bu_amount: number
  buyer_name?: string
  buyer_phone?: string
  user_id?: string | null
  custom?: Record<string, unknown>
  affiliate_code?: string | null
}

export const LIVE_TICKET_REF_PREFIX = 'BU_LIVE_'
export const LIVE_TICKETS_SQL_HINT =
  'Run supabase/migrations/0011_bu_checkin_feedback.sql in the live ɃU Supabase SQL editor, then try again.'

export function isLiveTicketReference(reference: string) {
  return reference.startsWith(LIVE_TICKET_REF_PREFIX)
}

function isMissingRpc(message: string | undefined) {
  return /could not find the function|PGRST202|schema cache/i.test(message ?? '')
}

function asLiveTicketRows(value: unknown): Record<string, unknown>[] {
  if (typeof value === 'string') {
    try {
      return asLiveTicketRows(JSON.parse(value))
    } catch {
      return []
    }
  }
  if (Array.isArray(value)) return value as Record<string, unknown>[]
  if (value && typeof value === 'object') return [value as Record<string, unknown>]
  return []
}

function soldOutError(tierId: string, available: number): never {
  throw new ApiError(409, 'TIER_SOLD_OUT', 'Ticket tier is sold out', {
    tier_id: tierId,
    available: Math.max(0, available),
  })
}

async function loadLiveEvent(eventId: string) {
  const row = await fetchEventRowBySlug(eventId)
  if (!row) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found')
  return { row, packed: withLiveTiers(row) }
}

async function assertLiveInvite(event: EventRecord, buyerId: string, phone?: string | null) {
  if (event.visibility !== 'PRIVATE') return
  if (event.organizer_id === buyerId) return
  const invites = await fetchLiveEventInvites(event.id)
  const phones = phone ? phoneLookupVariants(phone) : []
  const ok = invites.some(
    (invite) =>
      invite.invited_user_id === buyerId ||
      (invite.invited_phone && phones.includes(invite.invited_phone)) ||
      (invite.invited_bu_id && phones.includes(invite.invited_bu_id)),
  )
  if (!ok) {
    throw new ApiError(403, 'INVITE_REQUIRED', 'You need an invitation to buy tickets for this event')
  }
}

function livePayment(reference: string, tickets: TicketRecord[], extra?: Partial<Payment>): Payment {
  const first = tickets[0]
  const now = first?.created_at ?? new Date().toISOString()
  return {
    id: reference,
    reference,
    paystack_reference: reference,
    user_id: first?.buyer_user_id ?? null,
    merchant_id: null,
    event_id: first?.event_id ?? extra?.event_id ?? null,
    kind: 'ticket',
    amount: tickets.reduce((sum, ticket) => sum + Number(ticket.amount_paid), 0),
    currency: 'NGN',
    status: 'success',
    buyer_email: first?.buyer_email || extra?.buyer_email || '',
    buyer_name: first?.buyer_name ?? extra?.buyer_name ?? null,
    buyer_phone: first?.buyer_phone ?? extra?.buyer_phone ?? null,
    callback_url: extra?.callback_url ?? null,
    authorization_url: extra?.authorization_url ?? null,
    metadata: {
      kind: 'ticket',
      event_id: first?.event_id,
      quantity: tickets.length,
    },
    fulfilled_at: now,
    created_at: now,
    updated_at: now,
  }
}

function qrItemsForMint(input: {
  eventId: string
  quantity: number
  unitPrice: number
  reference: string
  tierId?: string
  tierName?: string
}) {
  return Array.from({ length: input.quantity }, () => {
    const ticketId = randomUUID()
    const checkin = generateCheckinCode(6)
    const qr = ticketQrPayload({
      ticket_id: ticketId,
      event_id: input.eventId,
      checkin_code: checkin,
      pay_ref: input.reference,
      tier_id: input.tierId,
      tier_name: input.tierName,
    })
    return { id: ticketId, qr_code_data: qr, checkin_code: checkin, unit_price: input.unitPrice }
  })
}

function parseQrPayload(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

async function insertLiveTicketsDirect(
  eventId: string,
  buyerId: string,
  unitPrice: number,
  items: Array<{ id: string; qr_code_data: string }>,
) {
  const db = createDataClient()
  const rows: TicketRecord[] = []
  for (const item of items) {
    const base = {
      id: item.id,
      event_id: eventId,
      buyer_id: buyerId,
      quantity: 1,
      total_price_bu: unitPrice,
      status: 'confirmed',
    }
    const attempts = [
      { ...base, qr_code_data: parseQrPayload(item.qr_code_data) },
      { ...base, qr_code_data: item.qr_code_data },
    ]
    let inserted: { data: unknown; error: { message?: string } | null } | null = null
    for (const payload of attempts) {
      inserted = await db.from('tickets').insert(payload).select('*').maybeSingle()
      if (!inserted.error && inserted.data) break
      const { id: _id, ...withoutId } = payload
      inserted = await db.from('tickets').insert(withoutId).select('*').maybeSingle()
      if (!inserted.error && inserted.data) break
    }
    if (!inserted?.data) {
      throw new ApiError(
        503,
        'TICKET_MINT_FAILED',
        `${inserted?.error?.message ?? 'Could not mint a live ticket'}. ${LIVE_TICKETS_SQL_HINT}`,
      )
    }
    rows.push(mapLiveTicket(inserted.data as Record<string, unknown>))
  }
  return rows
}

async function mintLiveTickets(input: {
  eventId: string
  buyerId: string
  quantity: number
  unitPrice: number
  reference: string
  eventTitle: string
  email: string
  buyerName?: string | null
  ticketTierId?: string
  tierName?: string
}) {
  const existing = await fetchLiveTicketsByPayRef(input.reference)
  if (existing.length) return existing

  const tierId = input.ticketTierId ?? `${input.eventId}:general`
  const { row, packed } = await loadLiveEvent(input.eventId)
  const selected = packed.ticket_tiers.find((tier) => tier.id === tierId) ?? packed.ticket_tiers[0]
  const typeRemaining = liveRemaining(selected ?? { quantity_total: 0, quantity_sold: 0 })
  if (typeRemaining < input.quantity) soldOutError(tierId, typeRemaining)

  const items = qrItemsForMint({
    eventId: input.eventId,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    reference: input.reference,
    tierId,
    tierName: input.tierName ?? selected?.name,
  })
  const db = createDataClient()
  const rpc = await db.rpc('bu_fulfill_live_tickets', {
    p_event_id: input.eventId,
    p_buyer_id: input.buyerId,
    p_qty: input.quantity,
    p_unit_price: input.unitPrice,
    p_pay_ref: input.reference,
    p_qr_items: items.map((item) => ({ id: item.id, qr_code_data: parseQrPayload(item.qr_code_data) })),
  })

  const afterMint = async (minted: TicketRecord[]) => {
    await bumpLiveTicketTypeSold(input.eventId, tierId, input.quantity)
    void sendTicketEmail({
      to: input.email,
      buyerName: input.buyerName ?? 'Guest',
      eventTitle: input.eventTitle,
      tickets: minted,
    }).catch((err) => console.error('ticket email failed', err))
    return minted
  }

  if (!rpc.error && rpc.data != null) {
    const minted = asLiveTicketRows(rpc.data).map(mapLiveTicket).filter((ticket) => ticket.id)
    if (minted.length) return afterMint(minted)
    throw new ApiError(503, 'TICKET_MINT_FAILED', `Could not mint a live ticket. ${LIVE_TICKETS_SQL_HINT}`)
  }

  if (rpc.error && /sold out/i.test(rpc.error.message)) {
    soldOutError(tierId, 0)
  }
  const rpcNeedsFallback =
    isMissingRpc(rpc.error?.message) ||
    /jsonb ~~\*|operator does not exist|is of type jsonb but expression is of type text/i.test(
      rpc.error?.message ?? '',
    )
  if (rpc.error && !rpcNeedsFallback) {
    throw new ApiError(503, 'TICKET_MINT_FAILED', `${rpc.error.message}. ${LIVE_TICKETS_SQL_HINT}`)
  }

  const claimed = await db.rpc('bu_claim_event_tickets', {
    p_event_id: input.eventId,
    p_qty: input.quantity,
  })
  const claimedOk = !claimed.error && claimed.data === true
  if (!claimedOk) {
    if (claimed.error && !isMissingRpc(claimed.error.message)) {
      soldOutError(tierId, 0)
    }
    if (!claimed.error && claimed.data !== true && claimed.data != null) {
      soldOutError(tierId, 0)
    }
    if (typeRemaining < input.quantity) soldOutError(tierId, typeRemaining)
    const sold = Number(row.tickets_sold ?? 0)
    const lock = await db
      .from('events')
      .update({ tickets_sold: sold + input.quantity })
      .eq('id', input.eventId)
      .eq('tickets_sold', sold)
      .select('id')
      .maybeSingle()
    if (lock.error || !lock.data) {
      throw new ApiError(503, 'TICKET_MINT_FAILED', `Could not reserve live tickets. ${LIVE_TICKETS_SQL_HINT}`)
    }
  }

  const minted = await insertLiveTicketsDirect(input.eventId, input.buyerId, input.unitPrice, items)
  return afterMint(minted)
}

export async function initializeLiveTicketPurchase(input: LiveInitializeInput) {
  const eventId = parseLiveTierId(input.ticket_tier_id)
  if (!eventId) throw new ApiError(404, 'TIER_NOT_FOUND', 'Ticket tier not found')

  const tier = await fetchLiveTierPrice(input.ticket_tier_id)
  if (!tier) throw new ApiError(404, 'TIER_NOT_FOUND', 'Ticket tier not found')
  if (!tier.is_active) throw new ApiError(409, 'EVENT_NOT_ON_SALE', 'Event is not on sale')

  const remaining = liveRemaining(tier)
  if (remaining < input.quantity) soldOutError(tier.id, remaining)

  const { packed } = await loadLiveEvent(eventId)
  if (packed.status !== 'published') {
    throw new ApiError(409, 'EVENT_NOT_ON_SALE', 'Event is not published')
  }
  if (!isEventUpcoming(packed)) {
    throw new ApiError(409, 'EVENT_ENDED', 'This event has ended')
  }

  const buyerId = await resolveLiveCelebrantId({
    id: input.user_id || '',
    email: input.email,
    phone: input.buyer_phone,
  })
  if (!buyerId) {
    throw new ApiError(
      403,
      'NOT_LIVE_USER',
      'Sign in with your ɃU ID (phone number) and PIN from the live ɃU app to buy tickets.',
    )
  }

  await assertLiveInvite(packed, buyerId, input.buyer_phone)

  const maxPer = tier.max_per_buyer ?? 6
  const owned = (await fetchMyLiveTickets(buyerId)).filter(
    (ticket) => ticket.event_id === packed.id && ticket.status !== 'cancelled' && ticket.status !== 'refunded',
  )
  if (owned.length + input.quantity > maxPer) {
    throw new ApiError(409, 'MAX_PER_BUYER', `Maximum ${maxPer} tickets per buyer for this event`)
  }

  const quote = quoteTicketTotal(Number(tier.price), input.quantity, input.spray_bu_amount ?? 0)
  if (typeof input.amount === 'number' && Math.abs(quote.total - input.amount) > 0.009) {
    throw new ApiError(400, 'AMOUNT_MISMATCH', 'Amount does not match server-quoted total', {
      expected: quote.total,
      received: input.amount,
    })
  }

  const reference = generateReference('BU_LIVE')
  const returnToApp = String(input.custom?.next ?? '') === '/app'
  const callbackUrl =
    input.callback_url ?? `${getAppUrl()}/pay/${reference}${returnToApp ? '?next=/app' : ''}`

  if (quote.total === 0) {
    const tickets = await mintLiveTickets({
      eventId: packed.id,
      buyerId,
      quantity: input.quantity,
      unitPrice: Number(tier.price),
      reference,
      eventTitle: packed.title,
      email: input.email,
      buyerName: input.buyer_name,
      ticketTierId: tier.id,
      tierName: tier.name,
    })
    return {
      authorization_url: returnToApp
        ? `${getAppUrl()}/app?page=tickets`
        : `${getAppUrl()}/tickets?ref=${reference}`,
      reference,
      payment_id: reference,
      quote,
      tickets,
    }
  }

  if (!isPaystackConfigured()) {
    throw new ApiError(
      503,
      'PAYSTACK_REQUIRED',
      'Paystack is not configured. Add PAYSTACK_SECRET_KEY from the live ɃU project, then try again.',
    )
  }

  try {
    const paystack = await initializeTransaction({
      email: input.email,
      amountKobo: nairaToKobo(quote.total),
      reference,
      callbackUrl,
      metadata: {
        kind: 'live_ticket',
        event_id: packed.id,
        ticket_tier_id: tier.id,
        quantity: input.quantity,
        buyer_id: buyerId,
        email: input.email,
        name: input.buyer_name ?? '',
        phone: input.buyer_phone ?? '',
        unit_price: Number(tier.price),
        event_title: packed.title,
        affiliate_code: input.affiliate_code ?? '',
        organiser_id: packed.organizer_id ?? '',
        affiliate_enabled: packed.affiliate_enabled,
        affiliate_commission_pct: packed.affiliate_commission_pct,
      },
    })
    return {
      authorization_url: paystack.authorization_url,
      reference,
      payment_id: reference,
      quote,
    }
  } catch (error) {
    throw new ApiError(
      502,
      'PAYSTACK_ERROR',
      error instanceof Error ? error.message : 'Paystack initialize failed',
    )
  }
}

export async function loadLivePaymentByReference(reference: string) {
  const tickets = await fetchLiveTicketsByPayRef(reference)
  if (!tickets.length) return null
  const row = tickets[0]?.event_id ? await fetchEventRowBySlug(tickets[0].event_id) : null
  return {
    payment: livePayment(reference, tickets),
    tickets,
    event_title: row ? withLiveTiers(row).title : undefined,
  }
}

export async function fulfillLiveTicketPayment(reference: string): Promise<{
  payment: Payment
  tickets: TicketRecord[]
  event_title?: string
}> {
  const existing = await loadLivePaymentByReference(reference)
  if (existing?.tickets.length) return existing

  if (!isPaystackConfigured()) {
    throw new ApiError(409, 'PAYMENT_PENDING', 'Payment is still pending')
  }

  const verified = await verifyTransaction(reference)
  if (verified.status !== 'success') {
    throw new ApiError(409, 'PAYMENT_PENDING', 'Payment is still pending', {
      paystack_status: verified.status,
    })
  }

  const meta = verified.metadata ?? {}
  const eventId = String(meta.event_id ?? parseLiveTierId(String(meta.ticket_tier_id ?? '')) ?? '')
  const ticketTierId = String(meta.ticket_tier_id ?? '') || (eventId ? `${eventId}:general` : '')
  const quantity = Math.max(1, Number(meta.quantity ?? 1))
  const buyerId = String(meta.buyer_id ?? '')
  const email = String(meta.email ?? verified.customer?.email ?? '')
  const name = String(meta.name ?? '')
  const phone = String(meta.phone ?? '')
  const eventTitle = String(meta.event_title ?? 'BU Event')
  const unitPrice = Number(meta.unit_price)

  if (!eventId || !buyerId) {
    throw new ApiError(404, 'NOT_FOUND', 'Payment not found')
  }

  const tier = await fetchLiveTierPrice(ticketTierId)
  if (!tier) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found')
  const quote = quoteTicketTotal(Number.isFinite(unitPrice) ? unitPrice : Number(tier.price), quantity)
  const paidNaira = Number(verified.amount) / 100
  if (paidNaira + 0.01 < quote.total) {
    throw new ApiError(402, 'PAYMENT_FAILED', 'Payment amount does not cover this ticket quote')
  }

  const tickets = await mintLiveTickets({
    eventId,
    buyerId,
    quantity,
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : Number(tier.price),
    reference,
    eventTitle,
    email,
    buyerName: name,
    ticketTierId: tier.id,
    tierName: tier.name,
  })

  const eventRow = await fetchEventRowBySlug(eventId)
  const packed = eventRow ? withLiveTiers(eventRow) : null
  const organiserId = String(meta.organiser_id || packed?.organizer_id || '')
  const ticketNaira = (Number.isFinite(unitPrice) ? unitPrice : Number(tier.price)) * quantity
  if (organiserId) {
    try {
      await creditTicketSaleShares({
        reference,
        eventId,
        organiserUserId: organiserId,
        ticketNaira,
        affiliateEnabled: meta.affiliate_enabled === true || meta.affiliate_enabled === 'true' || Boolean(packed?.affiliate_enabled),
        affiliateCommissionPct: Number(meta.affiliate_commission_pct ?? packed?.affiliate_commission_pct ?? 0),
        affiliateCode: String(meta.affiliate_code || '') || null,
      })
    } catch (error) {
      console.error('creditTicketSaleShares after ticket mint', error)
    }
  }

  return {
    payment: livePayment(reference, tickets, {
      buyer_email: email,
      buyer_name: name || null,
      buyer_phone: phone || null,
      event_id: eventId,
    }),
    tickets,
    event_title: eventTitle,
  }
}

function evaluateLiveTicket(ticket: TicketRecord): Pick<CheckinResult, 'status' | 'message'> {
  if (ticket.status === 'refunded') return { status: 'refunded', message: 'REFUNDED TICKET' }
  if (ticket.status === 'cancelled' || ticket.status === 'reserved') {
    return { status: 'invalid', message: 'INVALID TICKET' }
  }
  if (ticket.status === 'checked_in' || ticket.checked_in_at) {
    return { status: 'already_used', message: 'ALREADY USED' }
  }
  return { status: 'valid', message: 'VALID TICKET' }
}

function enrichLiveCheckin(ticket: TicketRecord, parsed: ReturnType<typeof parseTicketQr>) {
  return {
    tier_name: parsed?.tier_name || undefined,
    buyer_name: ticket.buyer_name ?? ticket.buyer_email ?? undefined,
  }
}

export async function lookupLiveTicketForCheckin(input: {
  eventId: string
  checkinCode?: string
  qrPayload?: string
}): Promise<{ status: CheckinResult['status']; ticket?: TicketRecord; message: string }> {
  const raw = `${input.qrPayload ?? ''} ${input.checkinCode ?? ''}`.trim()
  let parsed = input.checkinCode ? parseTicketQr(input.checkinCode) : null
  if (!parsed && input.qrPayload) parsed = parseTicketQr(input.qrPayload)
  const payRef = parsed?.pay_ref || extractLivePayRef(raw)
  const code = (parsed?.checkin_code || (!parsed ? input.checkinCode || input.qrPayload : '') || '').trim()
  const ticketId = parsed?.ticket_id?.trim() || ''

  if (parsed?.event_id && parsed.event_id !== input.eventId) {
    return { status: 'invalid', message: 'This ticket is for a different event' }
  }
  if (!ticketId && !code && !payRef) {
    return { status: 'invalid', message: 'No check-in code provided' }
  }

  const db = createDataClient()
  let row: Record<string, unknown> | null = null

  if (ticketId) {
    const byId = await db.from('tickets').select('*').eq('id', ticketId).maybeSingle()
    if (!byId.error && byId.data) row = byId.data as Record<string, unknown>
  }

  if (!row && payRef) {
    const byRef = await fetchLiveTicketsByPayRef(payRef, db)
    const match =
      byRef.find((ticket) => ticket.id === ticketId) ||
      byRef.find((ticket) => ticket.event_id === input.eventId) ||
      byRef[0]
    if (match) {
      if (match.event_id !== input.eventId) {
        return { status: 'invalid', message: 'This ticket is for a different event' }
      }
      return { ...evaluateLiveTicket(match), ticket: match }
    }
  }

  if (!row && code && code.length >= 4) {
    const rpc = await db.rpc('bu_lookup_event_ticket', { p_event_id: input.eventId, p_code: code })
    if (!rpc.error && rpc.data) {
      row = asLiveTicketRows(rpc.data)[0] ?? null
    }
  }

  if (!row) {
    return { status: 'invalid', message: 'INVALID TICKET' }
  }

  const ticket = mapLiveTicket(row)
  if (ticket.event_id !== input.eventId) {
    return { status: 'invalid', message: 'This ticket is for a different event' }
  }
  return { ...evaluateLiveTicket(ticket), ticket }
}

export async function checkInLiveTicket(input: {
  eventId: string
  checkinCode?: string
  qrPayload?: string
  confirm?: boolean
}): Promise<CheckinResult> {
  const looked = await lookupLiveTicketForCheckin(input)
  const parsed = parseTicketQr(input.qrPayload || input.checkinCode || looked.ticket?.qr_code_data || '')
  const extra = looked.ticket ? enrichLiveCheckin(looked.ticket, parsed) : {}
  if (!looked.ticket || looked.status !== 'valid') {
    return { ...looked, ...extra }
  }
  if (!input.confirm) {
    return {
      status: 'valid',
      ticket: looked.ticket,
      message: 'VALID TICKET',
      ...extra,
    }
  }

  const db = createDataClient()
  const rpc = await db.rpc('bu_checkin_event_ticket', {
    p_event_id: input.eventId,
    p_ticket_id: looked.ticket.id,
  })
  let updated: TicketRecord | null = null
  if (!rpc.error && rpc.data) {
    updated = asLiveTicketRows(rpc.data).map(mapLiveTicket)[0] ?? null
  }

  if (updated && (updated.status === 'checked_in' || updated.checked_in_at)) {
    return {
      status: 'checked_in',
      ticket: updated,
      message: 'CHECKED IN',
      ...enrichLiveCheckin(updated, parsed),
    }
  }

  throw new ApiError(503, 'CHECKIN_FAILED', `Could not check in this ticket. ${LIVE_TICKETS_SQL_HINT}`)
}
