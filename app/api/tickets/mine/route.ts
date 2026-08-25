import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { createDataClient } from '@/lib/supabase/data'
import { fetchMyLiveTickets, withLiveTiers } from '@/lib/events/live'
import { publicTicketStatus } from '@/lib/types/database'

export async function GET() {
  try {
    const user = await requireUser()
    const list = await fetchMyLiveTickets(user.id)
    const eventIds = [...new Set(list.map((ticket) => ticket.event_id))]
    const db = createDataClient()
    const events = eventIds.length ? await db.from('events').select('*').in('id', eventIds) : { data: [] }
    const eventMap = new Map(
      ((events.data as Record<string, unknown>[] | null) ?? []).map((row) => [String(row.id), withLiveTiers(row)]),
    )

    return successResponse(
      list.map((ticket) => {
        const packed = eventMap.get(ticket.event_id) ?? null
        return {
          ...ticket,
          event: packed,
          tier: packed?.ticket_tiers?.[0] ?? null,
          display_status: publicTicketStatus(ticket.status, packed?.end_time),
        }
      }),
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
