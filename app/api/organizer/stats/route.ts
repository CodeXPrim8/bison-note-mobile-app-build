import { requireUser } from '@/lib/api/session'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import {
  fetchLiveWallet,
  fetchOrganizerEventRows,
  fetchTicketsForEvents,
  resolveLiveCelebrantId,
  withLiveTiers,
} from '@/lib/events/live'
import { isEventUpcoming, listingRemaining } from '@/lib/events/sale'
import { readBuSession } from '@/lib/auth/bu-session'
import { listSaleCredits } from '@/lib/account/roles'
import { creditsByDay, ticketsByDay } from '@/lib/sales/credits'
import { eventVenueLabel } from '@/lib/events/event-details'

export async function GET() {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const liveId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || null,
      })) || user.id
    const rows = await fetchOrganizerEventRows(liveId)
    const packed = rows.map(withLiveTiers)
    const ids = packed.map((event) => event.id)
    const paid = await fetchTicketsForEvents(ids)
    const wallet = await fetchLiveWallet(liveId)
    const sales = (await listSaleCredits(liveId, 300))
      .filter((row) => row.kind === 'organiser_sale')
      .sort((a, b) => Date.parse(String(b.created_at || '')) - Date.parse(String(a.created_at || '')))

    const ticketsByEvent = new Map<string, typeof paid>()
    for (const ticket of paid) {
      const list = ticketsByEvent.get(ticket.event_id) ?? []
      list.push(ticket)
      ticketsByEvent.set(ticket.event_id, list)
    }
    const creditsByEvent = new Map<string, number>()
    for (const row of sales) {
      const eventId = typeof row.event_id === 'string' ? row.event_id : ''
      if (!eventId) continue
      creditsByEvent.set(eventId, (creditsByEvent.get(eventId) ?? 0) + Number(row.naira || 0))
    }

    const events = packed
      .map((event) => {
        const tickets = ticketsByEvent.get(event.id) ?? []
        const checkedIn = tickets.filter((ticket) => ticket.status === 'checked_in').length
        const revenue = tickets.reduce((sum, ticket) => sum + Number(ticket.amount_paid), 0)
        const remaining = listingRemaining(event)
        return {
          id: event.id,
          title: event.title,
          slug: event.slug,
          start_time: event.start_time,
          venue: eventVenueLabel(event),
          cover_image_url: event.cover_image_url,
          status: event.status,
          visibility: event.visibility,
          upcoming: isEventUpcoming(event),
          tickets_sold: tickets.length,
          revenue,
          credits: creditsByEvent.get(event.id) ?? 0,
          guests: tickets.length,
          checked_in: checkedIn,
          remaining,
        }
      })
      .sort((a, b) => {
        if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1
        return Date.parse(b.start_time || '') - Date.parse(a.start_time || '')
      })

    const series = ticketsByDay(paid, 14)
    const creditSeries = creditsByDay(sales, 14)

    return successResponse({
      total_events: packed.length,
      tickets_sold: paid.length,
      total_revenue: paid.reduce((sum, ticket) => sum + Number(ticket.amount_paid), 0),
      wallet_naira: wallet.naira_available,
      organiser_credits: sales.reduce((sum, row) => sum + Number(row.naira || 0), 0),
      recent_credits: sales.slice(0, 12),
      upcoming_events: packed.filter((event) => isEventUpcoming(event)).length,
      total_guests: paid.length,
      checked_in: paid.filter((ticket) => ticket.status === 'checked_in').length,
      events,
      series,
      credit_series: creditSeries,
      generated_at: new Date().toISOString(),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
