import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError, handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'

export async function GET() {
  try {
    const user = await requireUser()
    const admin = createAdminClient()
    const { data: events } = await admin
      .from('events')
      .select('*')
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false })

    const list = (events as EventRecord[]) ?? []
    const ids = list.map((event) => event.id)
    const { data: tiers } = ids.length
      ? await admin.from('ticket_tiers').select('*').in('event_id', ids)
      : { data: [] }
    const { data: tickets } = ids.length
      ? await admin.from('tickets').select('*').in('event_id', ids).in('status', ['paid', 'checked_in'])
      : { data: [] }

    const tierList = (tiers as TicketTier[]) ?? []
    const ticketList = (tickets as TicketRecord[]) ?? []

    return successResponse(
      list.map((event) => {
        const eventTickets = ticketList.filter((ticket) => ticket.event_id === event.id)
        const checkedIn = eventTickets.filter((ticket) => ticket.status === 'checked_in').length
        return {
          ...event,
          ticket_tiers: tierList.filter((tier) => tier.event_id === event.id),
          tickets_sold: eventTickets.length,
          revenue: eventTickets.reduce((sum, ticket) => sum + Number(ticket.amount_paid), 0),
          checkin_rate: eventTickets.length ? checkedIn / eventTickets.length : 0,
        }
      }),
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
