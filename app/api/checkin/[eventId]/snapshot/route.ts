import { createHmac } from 'crypto'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireEventOrganizer } from '@/lib/events/access'
import { fetchTicketsForEvents } from '@/lib/events/live'
import { getBankEncryptionKey } from '@/lib/env'

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await context.params
    const { event } = await requireEventOrganizer(eventId)
    const tickets = await fetchTicketsForEvents([event.id])
    const list = tickets
      .filter((ticket) => ticket.status === 'paid' || ticket.status === 'checked_in')
      .map((ticket) => ({
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        checkin_code: ticket.checkin_code,
        qr_token: ticket.qr_token,
        status: ticket.status,
        buyer_name: ticket.buyer_name,
        buyer_email: ticket.buyer_email,
      }))
    const payload = JSON.stringify({
      event_id: eventId,
      generated_at: new Date().toISOString(),
      tickets: list,
    })
    const signature = createHmac('sha256', getBankEncryptionKey()).update(payload).digest('hex')
    return successResponse({
      payload: JSON.parse(payload),
      signature,
      note: 'Cache this signed list for offline check-in. Sync scans via POST /api/checkin when online.',
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
