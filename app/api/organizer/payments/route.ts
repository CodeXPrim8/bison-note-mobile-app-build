import { requireUser } from '@/lib/api/session'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { fetchOrganizerEventRows, fetchTicketsForEvents, ticketsAsPayments } from '@/lib/events/live'

export async function GET() {
  try {
    const user = await requireUser()
    const rows = await fetchOrganizerEventRows(user.id)
    const ids = rows.map((row) => String(row.id))
    const tickets = await fetchTicketsForEvents(ids)
    return successResponse(ticketsAsPayments(tickets))
  } catch (error) {
    return handleRouteError(error)
  }
}
