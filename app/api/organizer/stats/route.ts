import { requireUser } from '@/lib/api/session'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { fetchOrganizerEventRows, fetchTicketsForEvents, mapLiveEvent } from '@/lib/events/live'
import { isEventUpcoming } from '@/lib/events/sale'

export async function GET() {
  try {
    const user = await requireUser()
    const rows = await fetchOrganizerEventRows(user.id)
    const list = rows.map(mapLiveEvent)
    const ids = list.map((event) => event.id)
    const paid = await fetchTicketsForEvents(ids)
    return successResponse({
      total_events: list.length,
      tickets_sold: paid.length,
      total_revenue: paid.reduce((sum, ticket) => sum + Number(ticket.amount_paid), 0),
      upcoming_events: list.filter((event) => isEventUpcoming(event)).length,
      total_guests: paid.length,
      checked_in: paid.filter((ticket) => ticket.status === 'checked_in').length,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
