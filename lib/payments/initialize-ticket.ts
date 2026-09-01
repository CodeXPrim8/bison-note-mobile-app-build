import { createAdminClient, tryCreateAdminClient } from '@/lib/supabase/admin'
import { ApiError } from '@/lib/api/errors'
import { getAppUrl, isPaystackConfigured, isServiceRoleConfigured } from '@/lib/env'
import { BuyQuoteError, quoteBuyBu, quoteBuyFromChargeNaira } from '@/lib/bu-rate'
import { quoteTicketTotal } from '@/lib/money'
import { normalizePhone } from '@/lib/phone'
import {
  commissionKobo,
  initializeTransaction,
  nairaToKobo,
} from '@/lib/payments/paystack'
import { fulfillSuccessfulPayment } from '@/lib/payments/fulfill'
import { initializeLiveTicketPurchase } from '@/lib/payments/live-ticket'
import { parseLiveTierId } from '@/lib/events/live'
import { isEventUpcoming } from '@/lib/events/sale'
import { generateReference } from '@/lib/tickets/ids'
import type { EventRecord, GatewayMerchant, Payment, TicketTier } from '@/lib/types/database'

export interface InitializeTicketInput {
  email: string
  amount?: number
  ticket_tier_id: string
  quantity: number
  callback_url?: string
  spray_bu_amount: number
  buyer_name?: string
  buyer_phone?: string
  custom?: Record<string, unknown>
  user_id?: string | null
  merchant?: GatewayMerchant | null
}

export async function initializeTicketPurchase(input: InitializeTicketInput) {
  if (parseLiveTierId(input.ticket_tier_id)) {
    return initializeLiveTicketPurchase(input)
  }
  if (!isServiceRoleConfigured()) {
    throw new ApiError(404, 'TIER_NOT_FOUND', 'Ticket tier not found')
  }

  const admin = createAdminClient()
  const quantity = input.quantity
  const spray = input.spray_bu_amount ?? 0
  const phoneE164 = input.buyer_phone ? normalizePhone(input.buyer_phone) : null

  const { data: tierRow, error: tierError } = await admin
    .from('ticket_tiers')
    .select('*')
    .eq('id', input.ticket_tier_id)
    .maybeSingle()

  if (tierError || !tierRow) {
    throw new ApiError(404, 'TIER_NOT_FOUND', 'Ticket tier not found')
  }
  const tier = tierRow as TicketTier

  const remaining = tier.quantity_total - tier.quantity_sold
  if (!tier.is_active || remaining < quantity) {
    throw new ApiError(409, 'TIER_SOLD_OUT', 'Ticket tier is sold out', {
      tier_id: tier.id,
      available: Math.max(0, remaining),
    })
  }

  const now = Date.now()
  if (tier.sales_start && new Date(tier.sales_start).getTime() > now) {
    throw new ApiError(409, 'SALES_NOT_OPEN', 'Ticket sales have not started')
  }
  if (tier.sales_end && new Date(tier.sales_end).getTime() < now) {
    throw new ApiError(409, 'SALES_CLOSED', 'Ticket sales have ended')
  }

  const { data: eventRow } = await admin.from('events').select('*').eq('id', tier.event_id).maybeSingle()
  if (!eventRow) {
    throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found')
  }
  const event = eventRow as EventRecord
  if (event.status !== 'published') {
    throw new ApiError(409, 'EVENT_NOT_ON_SALE', 'Event is not published')
  }
  if (!isEventUpcoming(event)) {
    throw new ApiError(409, 'EVENT_ENDED', 'This event has ended')
  }

  const salesStart = event.ticket_sales_start ? new Date(event.ticket_sales_start).getTime() : null
  const salesEnd = event.ticket_sales_end ? new Date(event.ticket_sales_end).getTime() : null
  if (salesStart && salesStart > now) {
    throw new ApiError(409, 'SALES_NOT_OPEN', 'Ticket sales have not started')
  }
  if (salesEnd && salesEnd < now) {
    throw new ApiError(409, 'SALES_CLOSED', 'Ticket sales have ended')
  }

  if (event.visibility === 'PRIVATE') {
    let inviteQuery = admin
      .from('event_invitations')
      .select('id, status')
      .eq('event_id', event.id)
      .neq('status', 'declined')
    if (input.user_id) {
      inviteQuery = inviteQuery.or(
        `invited_user_id.eq.${input.user_id}${phoneE164 ? `,invited_bu_id.eq.${phoneE164}` : ''}`,
      )
    } else if (phoneE164) {
      inviteQuery = inviteQuery.eq('invited_bu_id', phoneE164)
    } else {
      throw new ApiError(403, 'INVITE_REQUIRED', 'This is a private event. Sign in or enter your ɃU ID.')
    }
    const { data: invite } = await inviteQuery.limit(1).maybeSingle()
    if (!invite) {
      throw new ApiError(403, 'INVITE_REQUIRED', 'You need an invitation to buy tickets for this event')
    }
  }

  if (input.merchant && event.merchant_id && event.merchant_id !== input.merchant.id) {
    throw new ApiError(403, 'FORBIDDEN', 'This event does not belong to the merchant')
  }

  let linkedUserId = input.user_id ?? null
  if (!linkedUserId && phoneE164) {
    const { data: byPhone } = await admin.from('profiles').select('id').eq('phone_e164', phoneE164).maybeSingle()
    linkedUserId = (byPhone?.id as string | undefined) ?? null
  }

  const maxPer = tier.max_per_buyer ?? 10
  if (linkedUserId || input.email) {
    let ownedQuery = admin
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tier_id', tier.id)
      .in('status', ['reserved', 'paid', 'checked_in'])
    if (linkedUserId) {
      ownedQuery = ownedQuery.eq('buyer_user_id', linkedUserId)
    } else {
      ownedQuery = ownedQuery.eq('buyer_email', input.email)
    }
    const { count } = await ownedQuery
    if ((count ?? 0) + quantity > maxPer) {
      throw new ApiError(409, 'MAX_PER_BUYER', `Maximum ${maxPer} tickets per buyer for this tier`)
    }
  }

  const quote = quoteTicketTotal(Number(tier.price), quantity, spray)
  if (typeof input.amount === 'number' && Math.abs(quote.total - input.amount) > 0.009) {
    throw new ApiError(400, 'AMOUNT_MISMATCH', 'Amount does not match server-quoted total', {
      expected: quote.total,
      received: input.amount,
    })
  }

  const reserved = await admin.rpc('reserve_tickets', {
    p_tier_id: tier.id,
    p_qty: quantity,
  })
  if (reserved.error || reserved.data !== true) {
    throw new ApiError(409, 'TIER_SOLD_OUT', 'Ticket tier is sold out', {
      tier_id: tier.id,
      available: 0,
    })
  }

  const reference = generateReference('BU_TXN')
  const perTicket = Number(tier.price)
  const reservedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const metadata = {
    kind: 'ticket' as const,
    ticket_tier_id: tier.id,
    quantity,
    spray_bu_amount: spray,
    service_fee: quote.serviceFee,
    event_id: event.id,
    user_id: linkedUserId ?? undefined,
    merchant_id: input.merchant?.id,
    buyer_name: input.buyer_name,
    buyer_phone: input.buyer_phone,
    custom: input.custom,
  }

  const callbackUrl = input.callback_url ?? `${getAppUrl()}/pay/${reference}`

  const { data: paymentRow, error: paymentError } = await admin
    .from('payments')
    .insert({
      reference,
      user_id: linkedUserId,
      merchant_id: input.merchant?.id ?? event.merchant_id,
      event_id: event.id,
      kind: 'ticket',
      amount: quote.total,
      status: 'pending',
      buyer_email: input.email,
      buyer_name: input.buyer_name ?? null,
      buyer_phone: input.buyer_phone ?? null,
      callback_url: callbackUrl,
      metadata,
    })
    .select('*')
    .single()

  if (paymentError || !paymentRow) {
    await admin.rpc('release_tickets', { p_tier_id: tier.id, p_qty: quantity })
    throw new ApiError(500, 'PAYMENT_CREATE_FAILED', 'Could not create payment')
  }
  const payment = paymentRow as Payment

  const ticketInserts = Array.from({ length: quantity }).map(() => ({
    event_id: event.id,
    tier_id: tier.id,
    payment_id: payment.id,
    buyer_user_id: linkedUserId,
    buyer_email: input.email,
    buyer_name: input.buyer_name ?? null,
    buyer_phone: input.buyer_phone ?? null,
    amount_paid: perTicket,
    status: 'reserved',
    reserved_until: reservedUntil,
  }))

  const { error: ticketError } = await admin.from('tickets').insert(ticketInserts)
  if (ticketError) {
    await admin.rpc('release_tickets', { p_tier_id: tier.id, p_qty: quantity })
    await admin.from('payments').update({ status: 'failed' }).eq('id', payment.id)
    throw new ApiError(500, 'TICKET_RESERVE_FAILED', 'Could not reserve tickets')
  }

  if (quote.total === 0) {
    const fulfilled = await fulfillSuccessfulPayment(reference)
    return {
      authorization_url: `${getAppUrl()}/tickets?ref=${reference}`,
      reference,
      payment_id: payment.id,
      quote,
      tickets: fulfilled.tickets,
    }
  }

  const checkoutUrl = `${getAppUrl()}/pay/${reference}`
  const commissionRate = event.is_gateway_event
    ? Number(input.merchant?.commission_rate ?? event.commission_rate ?? 0.04)
    : Number(event.commission_rate ?? 0)

  if (isPaystackConfigured()) {
    try {
      const paystack = await initializeTransaction({
        email: input.email,
        amountKobo: nairaToKobo(quote.total),
        reference,
        callbackUrl: checkoutUrl,
        metadata: { ...metadata, payment_id: payment.id },
        subaccount: event.paystack_subaccount_code ?? input.merchant?.paystack_subaccount_code ?? undefined,
        transactionCharge: commissionRate > 0 ? commissionKobo(quote.total, commissionRate) : undefined,
      })
      await admin.from('payments').update({ authorization_url: paystack.authorization_url }).eq('id', payment.id)
      return {
        authorization_url: paystack.authorization_url,
        reference,
        payment_id: payment.id,
        quote,
      }
    } catch (error) {
      await admin.rpc('release_tickets', { p_tier_id: tier.id, p_qty: quantity })
      await admin.from('tickets').update({ status: 'cancelled' }).eq('payment_id', payment.id)
      await admin.from('payments').update({ status: 'failed' }).eq('id', payment.id)
      throw new ApiError(
        502,
        'PAYSTACK_ERROR',
        error instanceof Error ? error.message : 'Paystack initialize failed',
      )
    }
  }

  throw new ApiError(
    503,
    'PAYSTACK_REQUIRED',
    'Paystack is not configured. Add PAYSTACK_SECRET_KEY from the live ɃU project, then try again.',
  )
}

export async function initializeDeposit(input: {
  email: string
  bu?: number
  amount?: number
  user_id: string
  callback_url?: string
}) {
  let quote
  try {
    quote = input.bu != null ? quoteBuyBu(input.bu) : quoteBuyFromChargeNaira(input.amount ?? 0)
  } catch (error) {
    if (error instanceof BuyQuoteError) {
      throw new ApiError(400, error.code, error.message)
    }
    throw error
  }

  const admin = tryCreateAdminClient()
  if (!admin) {
    throw new ApiError(503, 'CHECKOUT_UNAVAILABLE', 'Could not start Paystack checkout.')
  }
  const reference = generateReference('DEPOSIT')
  const checkoutUrl = input.callback_url ?? `${getAppUrl()}/pay/${reference}`
  const depositMeta = {
    kind: 'deposit' as const,
    user_id: input.user_id,
    bu: quote.bu,
    credit_naira: quote.creditNaira,
    charge_naira: quote.chargeNaira,
    buy_rate: quote.buyRate,
    value_rate: quote.valueRate,
  }

  const { data: paymentRow, error } = await admin
    .from('payments')
    .insert({
      reference,
      user_id: input.user_id,
      kind: 'deposit',
      amount: quote.chargeNaira,
      status: 'pending',
      buyer_email: input.email,
      callback_url: checkoutUrl,
      metadata: depositMeta,
    })
    .select('*')
    .single()

  if (error || !paymentRow) {
    throw new ApiError(500, 'PAYMENT_CREATE_FAILED', 'Could not create deposit')
  }

  if (isPaystackConfigured()) {
    const paystack = await initializeTransaction({
      email: input.email,
      amountKobo: nairaToKobo(quote.chargeNaira),
      reference,
      callbackUrl: checkoutUrl,
      metadata: { ...depositMeta, payment_id: (paymentRow as Payment).id },
    })
    await admin
      .from('payments')
      .update({ authorization_url: paystack.authorization_url })
      .eq('id', (paymentRow as Payment).id)
    return { authorization_url: paystack.authorization_url, reference, quote }
  }

  throw new ApiError(
    503,
    'PAYSTACK_REQUIRED',
    'Paystack is not configured. Add PAYSTACK_SECRET_KEY from the live ɃU project, then try again.',
  )
}
