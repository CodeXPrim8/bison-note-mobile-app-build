import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError } from '@/lib/api/errors'
import { getAppUrl, isPaystackConfigured } from '@/lib/env'
import {
  commissionKobo,
  initializeTransaction,
  nairaToKobo,
} from '@/lib/payments/paystack'
import { fulfillSuccessfulPayment } from '@/lib/payments/fulfill'
import { generateReference } from '@/lib/tickets/ids'
import type { EventRecord, GatewayMerchant, Payment, TicketTier } from '@/lib/types/database'

export interface InitializeTicketInput {
  email: string
  amount: number
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
  const admin = createAdminClient()
  const quantity = input.quantity
  const spray = input.spray_bu_amount ?? 0

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

  const expected = Number(tier.price) * quantity + spray
  if (Math.abs(expected - input.amount) > 0.009) {
    throw new ApiError(400, 'AMOUNT_MISMATCH', 'Amount does not match tier price + spray credit', {
      expected,
      received: input.amount,
    })
  }

  const { data: eventRow } = await admin.from('events').select('*').eq('id', tier.event_id).maybeSingle()
  if (!eventRow) {
    throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found')
  }
  const event = eventRow as EventRecord
  if (event.status !== 'published') {
    throw new ApiError(409, 'EVENT_NOT_ON_SALE', 'Event is not published')
  }

  if (input.merchant && event.merchant_id && event.merchant_id !== input.merchant.id) {
    throw new ApiError(403, 'FORBIDDEN', 'This event does not belong to the merchant')
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

  const reference = generateReference('TICKET')
  const perTicket = Number(tier.price)
  const reservedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const metadata = {
    kind: 'ticket' as const,
    ticket_tier_id: tier.id,
    quantity,
    spray_bu_amount: spray,
    event_id: event.id,
    user_id: input.user_id ?? undefined,
    merchant_id: input.merchant?.id,
    buyer_name: input.buyer_name,
    buyer_phone: input.buyer_phone,
    custom: input.custom,
  }

  const callbackUrl =
    input.callback_url ?? `${getAppUrl()}/checkout/${reference}`

  const { data: paymentRow, error: paymentError } = await admin
    .from('payments')
    .insert({
      reference,
      user_id: input.user_id ?? null,
      merchant_id: input.merchant?.id ?? event.merchant_id,
      event_id: event.id,
      kind: 'ticket',
      amount: expected,
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
    buyer_user_id: input.user_id ?? null,
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

  // Free tickets skip Paystack and fulfill immediately.
  if (expected === 0) {
    const fulfilled = await fulfillSuccessfulPayment(reference)
    return {
      authorization_url: `${getAppUrl()}/tickets?ref=${reference}`,
      reference,
      demo: true,
      payment_id: payment.id,
      tickets: fulfilled.tickets,
    }
  }

  const checkoutUrl = `${getAppUrl()}/checkout/${reference}`
  const commissionRate =
    event.is_gateway_event
      ? Number(input.merchant?.commission_rate ?? event.commission_rate ?? 0.04)
      : Number(event.commission_rate ?? 0)

  if (isPaystackConfigured()) {
    try {
      const paystack = await initializeTransaction({
        email: input.email,
        amountKobo: nairaToKobo(expected),
        reference,
        callbackUrl: checkoutUrl,
        metadata: { ...metadata, payment_id: payment.id },
        subaccount: event.paystack_subaccount_code ?? input.merchant?.paystack_subaccount_code ?? undefined,
        transactionCharge: commissionRate > 0 ? commissionKobo(expected, commissionRate) : undefined,
      })
      await admin
        .from('payments')
        .update({ authorization_url: paystack.authorization_url })
        .eq('id', payment.id)
      return {
        authorization_url: paystack.authorization_url,
        reference,
        demo: false,
        payment_id: payment.id,
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

  await admin.from('payments').update({ authorization_url: checkoutUrl }).eq('id', payment.id)
  return {
    authorization_url: checkoutUrl,
    reference,
    demo: true,
    payment_id: payment.id,
  }
}

export async function initializeDeposit(input: {
  email: string
  amount: number
  user_id: string
  callback_url?: string
}) {
  const admin = createAdminClient()
  const reference = generateReference('DEPOSIT')
  const checkoutUrl = input.callback_url ?? `${getAppUrl()}/checkout/${reference}`

  const { data: paymentRow, error } = await admin
    .from('payments')
    .insert({
      reference,
      user_id: input.user_id,
      kind: 'deposit',
      amount: input.amount,
      status: 'pending',
      buyer_email: input.email,
      callback_url: checkoutUrl,
      metadata: { kind: 'deposit', user_id: input.user_id },
    })
    .select('*')
    .single()

  if (error || !paymentRow) {
    throw new ApiError(500, 'PAYMENT_CREATE_FAILED', 'Could not create deposit')
  }

  if (isPaystackConfigured()) {
    const paystack = await initializeTransaction({
      email: input.email,
      amountKobo: nairaToKobo(input.amount),
      reference,
      callbackUrl: checkoutUrl,
      metadata: { kind: 'deposit', payment_id: (paymentRow as Payment).id, user_id: input.user_id },
    })
    await admin
      .from('payments')
      .update({ authorization_url: paystack.authorization_url })
      .eq('id', (paymentRow as Payment).id)
    return { authorization_url: paystack.authorization_url, reference, demo: false }
  }

  await admin
    .from('payments')
    .update({ authorization_url: checkoutUrl })
    .eq('id', (paymentRow as Payment).id)
  return { authorization_url: checkoutUrl, reference, demo: true }
}
