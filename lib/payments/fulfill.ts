import { createAdminClient } from '@/lib/supabase/admin'
import { nairaFromBu } from '@/lib/bu-rate'
import { generateCheckinCode, generateQrToken, generateTicketNumber } from '@/lib/tickets/ids'
import { ticketQrPayload } from '@/lib/tickets/qr-generator'
import { enqueueMerchantWebhook } from '@/lib/webhooks/merchant'
import { sendTicketEmail } from '@/lib/email/tickets'
import { normalizePhone } from '@/lib/phone'
import type { EventRecord, GatewayMerchant, Payment, TicketRecord, TicketTier } from '@/lib/types/database'

async function uniqueCheckinCode(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  for (let i = 0; i < 12; i += 1) {
    const code = generateCheckinCode(6)
    const { data } = await admin.from('tickets').select('id').eq('checkin_code', code).maybeSingle()
    if (!data) return code
  }
  return generateCheckinCode(8)
}

async function uniqueTicketNumber(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  for (let i = 0; i < 12; i += 1) {
    const number = generateTicketNumber()
    const { data } = await admin.from('tickets').select('id').eq('ticket_number', number).maybeSingle()
    if (!data) return number
  }
  return `BU-${Date.now().toString(36).toUpperCase()}`
}

/**
 * Money path: webhook/verify source of truth.
 * Idempotent on payments.reference — a second charge.success is a no-op.
 */
export async function fulfillSuccessfulPayment(reference: string): Promise<{
  payment: Payment
  tickets: TicketRecord[]
}> {
  const admin = createAdminClient()

  const { data: paymentRow, error } = await admin
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .maybeSingle()

  if (error || !paymentRow) {
    throw new Error(`Payment not found: ${reference}`)
  }

  const payment = paymentRow as Payment
  if (payment.status === 'success' || payment.status === 'settled') {
    const { data: existing } = await admin.from('tickets').select('*').eq('payment_id', payment.id)
    return { payment, tickets: (existing as TicketRecord[]) ?? [] }
  }

  await admin.from('payments').update({ status: 'processing' }).eq('id', payment.id).eq('status', 'pending')

  const meta = payment.metadata ?? {}
  const sprayBu = Number(meta.spray_bu_amount ?? 0)

  if (payment.kind === 'deposit') {
    if (payment.user_id) {
      const creditedBu = Number(meta.bu ?? 0)
      const creditNaira = Number(meta.credit_naira ?? 0)
      const amountToCredit =
        Number.isFinite(creditNaira) && creditNaira > 0
          ? creditNaira
          : Number.isFinite(creditedBu) && creditedBu > 0
            ? nairaFromBu(creditedBu)
            : payment.amount
      await admin.rpc('credit_wallet', {
        p_user_id: payment.user_id,
        p_amount: amountToCredit,
        p_type: 'deposit',
        p_description: 'Wallet top-up',
        p_payment_id: payment.id,
        p_reference: reference,
        p_metadata: meta,
      })
    }
    const { data: updated } = await admin
      .from('payments')
      .update({ status: 'success', fulfilled_at: new Date().toISOString() })
      .eq('id', payment.id)
      .select('*')
      .single()
    return { payment: updated as Payment, tickets: [] }
  }

  let buyerUserId = payment.user_id
  const phoneE164 = payment.buyer_phone ? normalizePhone(payment.buyer_phone) : null
  if (!buyerUserId && phoneE164) {
    const { data: profile } = await admin.from('profiles').select('id').eq('phone_e164', phoneE164).maybeSingle()
    buyerUserId = (profile?.id as string | undefined) ?? null
  }

  const { data: ticketRows } = await admin.from('tickets').select('*').eq('payment_id', payment.id)
  const tickets = (ticketRows as TicketRecord[]) ?? []

  const paidTickets: TicketRecord[] = []
  for (const ticket of tickets) {
    const checkin = await uniqueCheckinCode(admin)
    const ticketNumber = await uniqueTicketNumber(admin)
    const qrToken = generateQrToken()
    const qr = ticketQrPayload({
      ticket_id: ticket.id,
      event_id: ticket.event_id,
      checkin_code: checkin,
      qr_token: qrToken,
    })
    const { data: updatedTicket } = await admin
      .from('tickets')
      .update({
        status: 'paid',
        checkin_code: checkin,
        ticket_number: ticketNumber,
        qr_token: qrToken,
        qr_code_data: qr,
        reserved_until: null,
        amount_paid: ticket.amount_paid,
        buyer_user_id: buyerUserId ?? ticket.buyer_user_id,
      })
      .eq('id', ticket.id)
      .select('*')
      .single()
    if (updatedTicket) paidTickets.push(updatedTicket as TicketRecord)
  }

  if (sprayBu > 0 && buyerUserId) {
    await admin.rpc('credit_wallet', {
      p_user_id: buyerUserId,
      p_amount: sprayBu,
      p_type: 'spray_credit',
      p_description: 'Event spray credit',
      p_payment_id: payment.id,
      p_event_id: payment.event_id,
      p_reference: reference,
      p_metadata: { spray_bu_amount: sprayBu },
    })
  }

  const { data: updatedPayment } = await admin
    .from('payments')
    .update({
      status: 'success',
      fulfilled_at: new Date().toISOString(),
      user_id: buyerUserId,
    })
    .eq('id', payment.id)
    .select('*')
    .single()

  const eventId = payment.event_id
  if (eventId) {
    const { data: event } = await admin.from('events').select('*').eq('id', eventId).maybeSingle()
    const { data: tiers } = await admin.from('ticket_tiers').select('*').eq('event_id', eventId)
    const soldOut = ((tiers as TicketTier[]) ?? []).every((tier) => tier.quantity_sold >= tier.quantity_total)

    if (buyerUserId || phoneE164) {
      let inviteUpdate = admin
        .from('event_invitations')
        .update({ status: 'ticket_purchased' })
        .eq('event_id', eventId)
      if (buyerUserId) {
        inviteUpdate = inviteUpdate.eq('invited_user_id', buyerUserId)
      } else if (phoneE164) {
        inviteUpdate = inviteUpdate.eq('invited_bu_id', phoneE164)
      }
      await inviteUpdate
    }

    if (event && (event as EventRecord).merchant_id) {
      const { data: merchant } = await admin
        .from('gateway_merchants')
        .select('*')
        .eq('id', (event as EventRecord).merchant_id)
        .maybeSingle()
      if (merchant) {
        await enqueueMerchantWebhook(merchant as GatewayMerchant, 'ticket.purchased', {
          reference,
          amount: payment.amount,
          buyer: {
            email: payment.buyer_email,
            name: payment.buyer_name,
            phone: payment.buyer_phone,
          },
          ticket_tier: meta.ticket_tier_id,
          tickets: paidTickets.map((t) => ({
            id: t.id,
            ticket_number: t.ticket_number,
            checkin_code: t.checkin_code,
          })),
        })
        if (soldOut) {
          await enqueueMerchantWebhook(merchant as GatewayMerchant, 'event.sold_out', {
            event_id: eventId,
          })
        }
      }
    }

    void sendTicketEmail({
      to: payment.buyer_email,
      buyerName: payment.buyer_name ?? 'Guest',
      eventTitle: (event as EventRecord | null)?.title ?? 'BU Event',
      tickets: paidTickets,
    }).catch((err) => console.error('ticket email failed', err))
  }

  return { payment: (updatedPayment as Payment) ?? payment, tickets: paidTickets }
}

export async function failPayment(reference: string, reason?: string) {
  const admin = createAdminClient()
  const { data: paymentRow } = await admin.from('payments').select('*').eq('reference', reference).maybeSingle()
  if (!paymentRow) return
  const payment = paymentRow as Payment
  if (payment.status === 'success' || payment.status === 'settled') return

  const { data: tickets } = await admin.from('tickets').select('*').eq('payment_id', payment.id)
  const list = (tickets as TicketRecord[]) ?? []
  if (list.length > 0) {
    const qty = list.length
    const tierId = list[0].tier_id
    await admin.rpc('release_tickets', { p_tier_id: tierId, p_qty: qty })
    await admin.from('tickets').update({ status: 'cancelled' }).eq('payment_id', payment.id).eq('status', 'reserved')
  }

  await admin
    .from('payments')
    .update({
      status: 'failed',
      metadata: { ...payment.metadata, fail_reason: reason ?? 'payment_failed' },
    })
    .eq('id', payment.id)

  if (payment.merchant_id) {
    const { data: merchant } = await admin
      .from('gateway_merchants')
      .select('*')
      .eq('id', payment.merchant_id)
      .maybeSingle()
    if (merchant) {
      await enqueueMerchantWebhook(merchant as GatewayMerchant, 'payment.failed', {
        reference,
        reason: reason ?? 'payment_failed',
      })
    }
  }
}

export async function expireReservations(): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tickets')
    .select('id, tier_id, payment_id')
    .eq('status', 'reserved')
    .lt('reserved_until', new Date().toISOString())
    .limit(200)

  const rows = data ?? []
  const byPayment = new Map<string, { tierId: string; qty: number }>()
  for (const row of rows) {
    const paymentId = row.payment_id as string | null
    if (!paymentId) continue
    const current = byPayment.get(paymentId) ?? { tierId: row.tier_id as string, qty: 0 }
    current.qty += 1
    byPayment.set(paymentId, current)
  }

  for (const [paymentId, group] of byPayment) {
    await admin.rpc('release_tickets', { p_tier_id: group.tierId, p_qty: group.qty })
    await admin.from('tickets').update({ status: 'cancelled' }).eq('payment_id', paymentId).eq('status', 'reserved')
    await admin.from('payments').update({ status: 'failed' }).eq('id', paymentId).eq('status', 'pending')
  }
  return rows.length
}
