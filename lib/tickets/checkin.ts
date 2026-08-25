import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError } from '@/lib/api/errors'
import { parseTicketQr } from '@/lib/tickets/qr-generator'
import { enqueueMerchantWebhook } from '@/lib/webhooks/merchant'
import type { CheckinResult, EventRecord, GatewayMerchant, TicketRecord, TicketTier } from '@/lib/types/database'

async function enrich(admin: ReturnType<typeof createAdminClient>, ticket: TicketRecord): Promise<{
  event_title?: string
  tier_name?: string
  buyer_name?: string
}> {
  const [{ data: event }, { data: tier }] = await Promise.all([
    admin.from('events').select('title').eq('id', ticket.event_id).maybeSingle(),
    admin.from('ticket_tiers').select('name').eq('id', ticket.tier_id).maybeSingle(),
  ])
  return {
    event_title: (event?.title as string | undefined) ?? undefined,
    tier_name: ((tier as TicketTier | null)?.name) ?? undefined,
    buyer_name: ticket.buyer_name ?? ticket.buyer_email ?? undefined,
  }
}

export async function lookupTicketForCheckin(input: {
  eventId: string
  checkinCode?: string
  qrPayload?: string
}): Promise<{ status: CheckinResult['status']; ticket?: TicketRecord; message: string }> {
  const admin = createAdminClient()
  let code = input.checkinCode?.trim().toUpperCase()
  let qrToken: string | undefined
  if (!code && input.qrPayload) {
    const parsed = parseTicketQr(input.qrPayload)
    if (parsed) {
      if (parsed.event_id !== input.eventId) {
        return { status: 'invalid', message: 'QR does not belong to this event' }
      }
      code = parsed.checkin_code
      qrToken = parsed.qr_token
    } else {
      code = input.qrPayload.trim().toUpperCase()
    }
  }
  if (!code) {
    return { status: 'invalid', message: 'No check-in code provided' }
  }

  const { data } = await admin
    .from('tickets')
    .select('*')
    .eq('event_id', input.eventId)
    .eq('checkin_code', code)
    .maybeSingle()

  if (!data) {
    return { status: 'invalid', message: 'INVALID TICKET' }
  }
  const ticket = data as TicketRecord
  if (qrToken && ticket.qr_token && ticket.qr_token !== qrToken) {
    return { status: 'invalid', ticket, message: 'INVALID TICKET' }
  }
  if (ticket.status === 'refunded') {
    return { status: 'refunded', ticket, message: 'REFUNDED TICKET' }
  }
  if (ticket.status === 'cancelled' || ticket.status === 'reserved') {
    return { status: 'invalid', ticket, message: 'INVALID TICKET' }
  }
  if (ticket.status === 'checked_in' || ticket.checked_in_at) {
    return { status: 'already_used', ticket, message: 'ALREADY USED' }
  }
  return { status: 'valid', ticket, message: 'VALID TICKET' }
}

export async function checkInTicket(input: {
  eventId: string
  checkinCode?: string
  qrPayload?: string
  gatekeeperId?: string | null
  confirm?: boolean
}): Promise<CheckinResult> {
  const admin = createAdminClient()
  const looked = await lookupTicketForCheckin(input)
  if (!looked.ticket || looked.status !== 'valid') {
    const extra = looked.ticket ? await enrich(admin, looked.ticket) : {}
    return { ...looked, ...extra }
  }

  if (!input.confirm) {
    return {
      status: 'valid',
      ticket: looked.ticket,
      message: 'VALID TICKET',
      ...(await enrich(admin, looked.ticket)),
    }
  }

  const ticket = looked.ticket
  const { data: updated, error } = await admin
    .from('tickets')
    .update({
      status: 'checked_in',
      checked_in_at: new Date().toISOString(),
      checked_in_by: input.gatekeeperId ?? null,
    })
    .eq('id', ticket.id)
    .eq('status', 'paid')
    .select('*')
    .maybeSingle()

  if (error || !updated) {
    throw new ApiError(409, 'CHECKIN_RACE', 'Ticket was already used')
  }

  await admin.from('event_check_ins').upsert(
    {
      event_id: input.eventId,
      ticket_id: ticket.id,
      operator_id: input.gatekeeperId ?? null,
      source: 'online',
    },
    { onConflict: 'ticket_id' },
  )

  const { data: event } = await admin.from('events').select('*').eq('id', input.eventId).maybeSingle()
  const record = event as EventRecord | null
  if (record?.merchant_id) {
    const { data: merchant } = await admin
      .from('gateway_merchants')
      .select('*')
      .eq('id', record.merchant_id)
      .maybeSingle()
    if (merchant) {
      await enqueueMerchantWebhook(merchant as GatewayMerchant, 'ticket.checked_in', {
        ticket_id: ticket.id,
        event_id: input.eventId,
      })
    }
  }

  const paid = updated as TicketRecord
  return {
    status: 'checked_in',
    ticket: paid,
    message: 'CHECKED IN',
    ...(await enrich(admin, paid)),
  }
}
