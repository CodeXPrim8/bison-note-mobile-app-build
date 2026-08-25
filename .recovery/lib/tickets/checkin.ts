import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError } from '@/lib/api/errors'
import { parseTicketQr } from '@/lib/tickets/qr-generator'
import type { CheckinResult, TicketRecord } from '@/lib/types/database'

export async function checkInTicket(input: {
  eventId: string
  checkinCode?: string
  qrPayload?: string
  gatekeeperId?: string | null
}): Promise<CheckinResult> {
  const admin = createAdminClient()
  let code = input.checkinCode?.trim().toUpperCase()
  if (!code && input.qrPayload) {
    const parsed = parseTicketQr(input.qrPayload)
    if (parsed) {
      if (parsed.event_id !== input.eventId) {
        return { status: 'invalid', message: 'QR does not belong to this event' }
      }
      code = parsed.checkin_code
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
    return { status: 'invalid', message: 'Ticket not found' }
  }
  const ticket = data as TicketRecord

  if (ticket.status === 'refunded') {
    return { status: 'refunded', ticket, message: 'Ticket was refunded' }
  }
  if (ticket.status === 'cancelled' || ticket.status === 'reserved') {
    return { status: 'invalid', ticket, message: 'Ticket is not valid for entry' }
  }
  if (ticket.status === 'checked_in' || ticket.checked_in_at) {
    return { status: 'already_used', ticket, message: 'Already checked in' }
  }

  const { data: updated, error } = await admin
    .from('tickets')
    .update({
      status: 'checked_in',
      checked_in_at: new Date().toISOString(),
      checked_in_by: input.gatekeeperId ?? null,
    })
    .eq('id', ticket.id)
    .in('status', ['paid'])
    .select('*')
    .maybeSingle()

  if (error || !updated) {
    throw new ApiError(409, 'CHECKIN_RACE', 'Ticket was already used')
  }

  return {
    status: 'checked_in',
    ticket: updated as TicketRecord,
    message: 'Welcome in',
  }
}
